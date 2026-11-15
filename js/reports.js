let calendarMonth = null;
let currentSummarySessions = [];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateToStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

async function renderCalendar() {
  if (!calendarMonth) {
    const d = getEffectiveDate();
    calendarMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  }

  const sessions = await dbGetAll("workoutSessions");
  const schedule = await dbGetAll("schedule");

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  document.getElementById("calendar-month-label").textContent =
    calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const todayStr = todayDateString();

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  WEEKDAY_NAMES.forEach(function (name) {
    const head = document.createElement("div");
    head.className = "calendar-head";
    head.textContent = name;
    grid.appendChild(head);
  });

  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(document.createElement("div"));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const dayCompleted = sessions.filter(function (s) { return s.date === dateStr && s.status === "completed"; });
    const weekdayName = WEEKDAY_NAMES[new Date(year, month, day).getDay()];
    const scheduleEntry = schedule.find(function (s) { return s.day === weekdayName; });
    const isScheduledWorkoutDay = !!(scheduleEntry && scheduleEntry.routineId);

    const cell = document.createElement("button");
    cell.className = "calendar-cell";
    cell.textContent = day;

    if (dayCompleted.length > 0) {
      cell.classList.add("has-session");
    } else if (isScheduledWorkoutDay && dateStr < todayStr) {
      cell.classList.add("missed");
    } else if (!isScheduledWorkoutDay) {
      cell.classList.add("rest-day");
    }
    if (dateStr === todayStr) cell.classList.add("today");

    if (dayCompleted.length > 0) {
      cell.addEventListener("click", function () { openDaySummary(dayCompleted); });
    }

    grid.appendChild(cell);
  }

  const streak = await computeStreak(sessions, schedule);
  document.getElementById("calendar-streak").textContent = "Current streak: " + streak + " day" + (streak === 1 ? "" : "s");
}

async function computeStreak(sessions, schedule) {
  let streak = 0;
  const cursor = getEffectiveDate();

  for (let i = 0; i < 365; i++) {
    const dateStr = dateToStr(cursor);
    const weekdayName = WEEKDAY_NAMES[cursor.getDay()];
    const completedThatDay = sessions.some(function (s) { return s.date === dateStr && s.status === "completed"; });
    const scheduleEntry = schedule.find(function (s) { return s.day === weekdayName; });
    const isRestDay = !scheduleEntry || !scheduleEntry.routineId;

    if (completedThatDay) {
      streak++;
    } else if (!isRestDay) {
      break;
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function openDaySummary(sessionsForDay) {
  currentSummarySessions = sessionsForDay;
  renderDaySummaryContent();
  showOverlay("day-summary-overlay");
}

function renderDaySummaryContent() {
  const container = document.getElementById("day-summary-content");
  container.innerHTML = "";

  currentSummarySessions.forEach(function (session) {
    const block = document.createElement("div");
    block.className = "routine-exercise-row";

    let html = "<strong>" + session.routineName + "</strong> — " + session.date;
    session.exerciseLogs.forEach(function (log) {
      const setsText = log.sets.length
        ? log.sets.map(function (s) { return formatSetEntry(log.type, s); }).join(", ")
        : "No sets logged";
      html += "<div style='margin-top:0.4rem;'>" + log.exerciseName + ": " + setsText + "</div>";
      if (log.notes) html += "<div class='placeholder'>Note: " + log.notes + "</div>";
    });
    if (session.notes) html += "<div class='placeholder' style='margin-top:0.4rem;'>Workout notes: " + session.notes + "</div>";
    html += '<button class="day-summary-delete-btn" data-session-id="' + session.id + '">Delete this session</button>';

    block.innerHTML = html;
    container.appendChild(block);
  });

  container.querySelectorAll(".day-summary-delete-btn").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      if (confirm("Delete this workout session? This cannot be undone.")) {
        const sessionId = btn.dataset.sessionId;
        await dbDelete("workoutSessions", sessionId);
        currentSummarySessions = currentSummarySessions.filter(function (s) { return s.id !== sessionId; });
        if (currentSummarySessions.length === 0) {
          closeOverlays();
        } else {
          renderDaySummaryContent();
        }
        await renderCalendar();
      }
    });
  });
}

document.getElementById("day-summary-close").addEventListener("click", function () {
  closeOverlays();
});

document.getElementById("calendar-prev-month").addEventListener("click", function () {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});

document.getElementById("calendar-next-month").addEventListener("click", function () {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

let strengthChartInstance = null;

function computeSessionBest(log) {
  if (log.type === "strength") {
    let best = { weight: 0, reps: 0 };
    log.sets.forEach(function (s) {
      const w = formatWeight(s.weight || 0, s.unit || "kg", currentUnits);
      if (w > best.weight || (w === best.weight && (s.reps || 0) > best.reps)) {
        best = { weight: w, reps: s.reps || 0 };
      }
    });
    return best;
  }
  let bestReps = 0;
  log.sets.forEach(function (s) {
    if ((s.reps || 0) > bestReps) bestReps = s.reps || 0;
  });
  return { weight: null, reps: bestReps };
}

async function renderStrengthChartSection() {
  const sessions = await dbGetAll("workoutSessions");
  const completed = sessions.filter(function (s) { return s.status === "completed"; });

  const sessionCountByExercise = {};
  const nameByExercise = {};
  const typeByExercise = {};

  completed.forEach(function (session) {
    session.exerciseLogs.forEach(function (log) {
      if ((log.type === "strength" || log.type === "bodyweight") && log.sets.length > 0) {
        sessionCountByExercise[log.exerciseId] = (sessionCountByExercise[log.exerciseId] || 0) + 1;
        nameByExercise[log.exerciseId] = log.exerciseName;
        typeByExercise[log.exerciseId] = log.type;
      }
    });
  });

  const eligibleIds = Object.keys(sessionCountByExercise).filter(function (id) {
    return sessionCountByExercise[id] >= 2;
  });

  const select = document.getElementById("strength-chart-exercise-select");
  const canvas = document.getElementById("strength-chart-canvas");
  const emptyMsg = document.getElementById("strength-chart-empty");
  const prevValue = select.value;
  select.innerHTML = "";

  if (eligibleIds.length === 0) {
    emptyMsg.textContent = "Log the same strength or bodyweight exercise in at least 2 completed workouts to see a progress chart.";
    select.style.display = "none";
    canvas.style.display = "none";
    if (strengthChartInstance) {
      strengthChartInstance.destroy();
      strengthChartInstance = null;
    }
    return;
  }

  select.style.display = "";
  canvas.style.display = "";
  emptyMsg.textContent = "";

  eligibleIds
    .sort(function (a, b) { return nameByExercise[a].localeCompare(nameByExercise[b]); })
    .forEach(function (id) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = nameByExercise[id];
      select.appendChild(opt);
    });

  if (prevValue && eligibleIds.includes(prevValue)) select.value = prevValue;

  renderStrengthChart(select.value, typeByExercise[select.value], completed);
}

function renderStrengthChart(exerciseId, type, completedSessions) {
  const points = completedSessions
    .slice()
    .sort(function (a, b) { return new Date(a.startedAt) - new Date(b.startedAt); })
    .map(function (session) {
      const log = session.exerciseLogs.find(function (l) { return l.exerciseId === exerciseId; });
      if (!log || !log.sets.length) return null;
      return { date: session.date, best: computeSessionBest(log) };
    })
    .filter(Boolean);

  const ctx = document.getElementById("strength-chart-canvas").getContext("2d");
  if (strengthChartInstance) {
    strengthChartInstance.destroy();
    strengthChartInstance = null;
  }

  const datasets = [];
  if (type === "strength") {
    datasets.push({
      label: "Top weight (" + currentUnits + ")",
      data: points.map(function (p) { return p.best.weight; }),
      borderColor: "#ff6b35",
      backgroundColor: "#ff6b35",
      tension: 0.2,
    });
    datasets.push({
      label: "Reps at top weight",
      data: points.map(function (p) { return p.best.reps; }),
      borderColor: "#a0a0a0",
      backgroundColor: "#a0a0a0",
      tension: 0.2,
      yAxisID: "y1",
    });
  } else {
    datasets.push({
      label: "Best reps",
      data: points.map(function (p) { return p.best.reps; }),
      borderColor: "#ff6b35",
      backgroundColor: "#ff6b35",
      tension: 0.2,
    });
  }

  strengthChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: points.map(function (p) { return p.date; }),
      datasets: datasets,
    },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { color: "#a0a0a0" }, grid: { color: "#2d2d2d" } },
        y: { ticks: { color: "#a0a0a0" }, grid: { color: "#2d2d2d" } },
        y1: type === "strength" ? { position: "right", ticks: { color: "#a0a0a0" }, grid: { display: false } } : undefined,
      },
      plugins: {
        legend: { labels: { color: "#f2f2f2" } },
      },
    },
  });
}

document.getElementById("strength-chart-exercise-select").addEventListener("change", async function () {
  const sessions = await dbGetAll("workoutSessions");
  const completed = sessions.filter(function (s) { return s.status === "completed"; });
  const exercises = await dbGetAll("exercises");
  const exercise = exercises.find(function (e) { return e.id === this.value; }, this);
  renderStrengthChart(this.value, exercise ? exercise.type : "strength", completed);
});

let bodyWeightChartInstance = null;

async function renderBodyWeightSection() {
  document.getElementById("bodyweight-date-input").value = todayDateString();
  document.getElementById("bodyweight-value-input").placeholder = "Weight (" + currentUnits + ")";
  await renderBodyWeightChart();
  await renderBodyWeightEntriesList();
}

async function getFilteredBodyWeightLogs() {
  const logs = (await dbGetAll("bodyWeightLogs")).sort(function (a, b) { return a.date.localeCompare(b.date); });
  const range = document.getElementById("bodyweight-range-select").value;
  if (range === "all") return logs;

  const months = Number(range);
  const cutoff = getEffectiveDate();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = dateToStr(cutoff);
  return logs.filter(function (l) { return l.date >= cutoffStr; });
}

async function renderBodyWeightChart() {
  const logs = await getFilteredBodyWeightLogs();
  const canvas = document.getElementById("bodyweight-chart-canvas");
  const emptyMsg = document.getElementById("bodyweight-chart-empty");

  if (bodyWeightChartInstance) {
    bodyWeightChartInstance.destroy();
    bodyWeightChartInstance = null;
  }

  if (logs.length === 0) {
    emptyMsg.textContent = "Log a body weight entry to see your trend here.";
    canvas.style.display = "none";
    return;
  }
  emptyMsg.textContent = "";
  canvas.style.display = "";

  const ctx = canvas.getContext("2d");
  bodyWeightChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: logs.map(function (l) { return l.date; }),
      datasets: [{
        label: "Body weight (" + currentUnits + ")",
        data: logs.map(function (l) { return formatWeight(l.weight, l.unit, currentUnits); }),
        borderColor: "#ff6b35",
        backgroundColor: "#ff6b35",
        tension: 0.2,
      }],
    },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { color: "#a0a0a0" }, grid: { color: "#2d2d2d" } },
        y: { ticks: { color: "#a0a0a0" }, grid: { color: "#2d2d2d" } },
      },
      plugins: { legend: { labels: { color: "#f2f2f2" } } },
    },
  });
}

async function renderBodyWeightEntriesList() {
  const logs = (await dbGetAll("bodyWeightLogs")).sort(function (a, b) { return b.date.localeCompare(a.date); });
  const container = document.getElementById("bodyweight-entries-list");
  container.innerHTML = "";

  logs.forEach(function (log) {
    const row = document.createElement("div");
    row.className = "routine-row";

    const label = document.createElement("span");
    label.textContent = log.date + ": " + formatWeight(log.weight, log.unit, currentUnits) + currentUnits;
    row.appendChild(label);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async function () {
      if (confirm("Delete this body weight entry?")) {
        await dbDelete("bodyWeightLogs", log.id);
        await renderBodyWeightChart();
        await renderBodyWeightEntriesList();
      }
    });
    row.appendChild(delBtn);

    container.appendChild(row);
  });
}

document.getElementById("bodyweight-add-btn").addEventListener("click", async function () {
  const date = document.getElementById("bodyweight-date-input").value || todayDateString();
  const weightVal = Number(document.getElementById("bodyweight-value-input").value);
  if (!weightVal) return;

  await dbPut("bodyWeightLogs", { id: uuid(), date: date, weight: weightVal, unit: currentUnits, note: "" });
  document.getElementById("bodyweight-value-input").value = "";
  await renderBodyWeightChart();
  await renderBodyWeightEntriesList();
});

document.getElementById("bodyweight-range-select").addEventListener("change", function () {
  renderBodyWeightChart();
});

document.querySelector('.nav-btn[data-screen="reports"]').addEventListener("click", function () {
  renderCalendar();
  renderStrengthChartSection();
  renderBodyWeightSection();
});
