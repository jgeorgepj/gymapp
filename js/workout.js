let currentTodayRoutine = null;
let activeSession = null;
let activeExerciseIndex = 0;
let allExercisesCache = [];
let restTimerInterval = null;
let restTimerRemaining = 0;

function startRestTimer(seconds) {
  clearRestTimer();
  restTimerRemaining = Math.max(0, seconds || 90);
  const el = document.getElementById("rest-timer");
  el.style.display = "flex";
  updateRestTimerDisplay();
  restTimerInterval = setInterval(function () {
    restTimerRemaining--;
    updateRestTimerDisplay();
    if (restTimerRemaining <= 0) {
      clearRestTimer();
      playRestTimerAlert();
    }
  }, 1000);
}

function updateRestTimerDisplay() {
  document.getElementById("rest-timer-display").textContent = "Rest: " + restTimerRemaining + "s";
}

function clearRestTimer() {
  if (restTimerInterval) {
    clearInterval(restTimerInterval);
    restTimerInterval = null;
  }
  document.getElementById("rest-timer").style.display = "none";
}

function playRestTimerAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = function () { ctx.close(); };
  } catch (e) {
    // AudioContext unavailable — silently skip the beep.
  }
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
}

document.getElementById("rest-timer-skip").addEventListener("click", clearRestTimer);

document.getElementById("rest-timer-add15").addEventListener("click", function () {
  restTimerRemaining += 15;
  updateRestTimerDisplay();
});

function getEffectiveDate() {
  const params = new URLSearchParams(window.location.search);
  const debugDate = params.get("debugDate");
  return debugDate ? new Date(debugDate + "T00:00:00") : new Date();
}

function getTodayWeekday() {
  const map = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return map[getEffectiveDate().getDay()];
}

function todayDateString() {
  const d = getEffectiveDate();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

async function renderTodayScreen() {
  const day = getTodayWeekday();
  const schedule = await dbGetAll("schedule");
  const routines = await dbGetAll("routines");
  const entry = schedule.find(function (s) { return s.day === day; });
  const routine = entry && entry.routineId
    ? routines.find(function (r) { return r.id === entry.routineId; })
    : null;

  currentTodayRoutine = routine;

  document.getElementById("today-day-label").textContent = "Today is " + day;
  document.getElementById("today-routine-label").textContent = routine
    ? "Scheduled: " + routine.name
    : "Rest day";

  const sessions = await dbGetAll("workoutSessions");
  const todayStr = todayDateString();
  const completedToday = sessions.filter(function (s) { return s.date === todayStr && s.status === "completed"; });

  const banner = document.getElementById("today-completed-banner");
  const startBtn = document.getElementById("start-workout-btn");
  if (completedToday.length > 0) {
    banner.textContent = "✅ Completed (" + completedToday.length + " session" + (completedToday.length > 1 ? "s" : "") + " today)";
    banner.style.display = "block";
    startBtn.textContent = "Start Another Workout";
  } else {
    banner.style.display = "none";
    startBtn.textContent = "Start Workout";
  }
}

async function startWorkout(routine) {
  clearRestTimer();
  allExercisesCache = await dbGetAll("exercises");

  const exerciseLogs = (routine ? routine.exercises.slice().sort(function (a, b) { return a.order - b.order; }) : [])
    .map(function (entry) {
      const exercise = allExercisesCache.find(function (e) { return e.id === entry.exerciseId; });
      return {
        exerciseId: entry.exerciseId,
        exerciseName: exercise ? exercise.name : "Unknown Exercise",
        type: exercise ? exercise.type : "strength",
        completed: false,
        notes: "",
        targetSets: entry.targetSets,
        targetReps: entry.targetReps,
        targetDurationSec: entry.targetDurationSec,
        targetDistanceKm: entry.targetDistanceKm,
        restSec: entry.restSec,
        sets: [],
      };
    });

  activeSession = {
    id: uuid(),
    date: todayDateString(),
    routineId: routine ? routine.id : null,
    routineName: routine ? routine.name : "Ad-hoc Workout",
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "in_progress",
    notes: "",
    exerciseLogs: exerciseLogs,
  };
  activeExerciseIndex = 0;

  await persistActiveSession();
  populateWorkoutAddExerciseSelect();
  document.getElementById("workout-screen-title").textContent = activeSession.routineName;
  await renderWorkoutScreen();
  showOverlay("screen-workout");
}

async function persistActiveSession() {
  if (activeSession) await dbPut("workoutSessions", activeSession);
}

function currentExerciseLog() {
  return activeSession.exerciseLogs[activeExerciseIndex];
}

function populateWorkoutAddExerciseSelect() {
  const select = document.getElementById("workout-exercise-select");
  select.innerHTML = "";
  const types = ["strength", "cardio", "bodyweight"];
  types.forEach(function (type) {
    const options = allExercisesCache
      .filter(function (ex) { return ex.type === type && !ex.hidden; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (options.length === 0) return;
    const group = document.createElement("optgroup");
    group.label = type.charAt(0).toUpperCase() + type.slice(1);
    options.forEach(function (ex) {
      const opt = document.createElement("option");
      opt.value = ex.id;
      opt.textContent = ex.name;
      group.appendChild(opt);
    });
    select.appendChild(group);
  });
}

function formatSetEntry(type, s) {
  if (type === "strength") {
    const displayWeight = formatWeight(s.weight || 0, s.unit || "kg", currentUnits);
    return displayWeight + currentUnits + " × " + (s.reps || 0);
  }
  if (type === "cardio") {
    const mins = Math.round((s.durationSec || 0) / 60);
    return mins + " min" + (s.distanceKm ? " / " + s.distanceKm + " km" : "");
  }
  return (s.reps || 0) + " reps" + (s.holdSec ? " (" + s.holdSec + "s hold)" : "");
}

function formatSets(log) {
  return log.sets.map(function (s) { return formatSetEntry(log.type, s); }).join(", ");
}

function describeTargets(log) {
  if (log.type === "cardio") {
    const parts = [];
    if (log.targetDurationSec) parts.push(Math.round(log.targetDurationSec / 60) + " min target");
    if (log.targetDistanceKm) parts.push(log.targetDistanceKm + " km target");
    return parts.join(" · ") || "Cardio";
  }
  const parts = [];
  if (log.targetSets) parts.push(log.targetSets + " sets");
  if (log.targetReps) parts.push(log.targetReps + " reps");
  return parts.length ? parts.join(" x ") : (log.type === "bodyweight" ? "Bodyweight" : "Strength");
}

async function getLastLogForExercise(exerciseId) {
  const sessions = await dbGetAll("workoutSessions");
  const completed = sessions
    .filter(function (s) {
      return s.status === "completed" && (!activeSession || s.id !== activeSession.id);
    })
    .sort(function (a, b) { return new Date(b.startedAt) - new Date(a.startedAt); });

  for (const session of completed) {
    const log = session.exerciseLogs.find(function (l) {
      return l.exerciseId === exerciseId && l.sets && l.sets.length;
    });
    if (log) return log;
  }
  return null;
}

function makeSetField(field, labelText, type, step) {
  const group = document.createElement("label");
  group.className = "field-group";
  group.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.min = "0";
  if (step) input.step = step;
  input.dataset.field = field;
  group.appendChild(input);
  return group;
}

function renderSetInput(log) {
  const container = document.getElementById("workout-set-input");
  container.innerHTML = "";
  if (log.type === "strength") {
    container.appendChild(makeSetField("weight", "Weight (" + currentUnits + ")", "number", "0.5"));
    container.appendChild(makeSetField("reps", "Reps", "number"));
  } else if (log.type === "cardio") {
    container.appendChild(makeSetField("durationMin", "Duration (min)", "number"));
    container.appendChild(makeSetField("distanceKm", "Distance (km)", "number", "0.01"));
  } else {
    container.appendChild(makeSetField("reps", "Reps", "number"));
    container.appendChild(makeSetField("holdSec", "Hold (sec)", "number"));
  }
}

function renderSetsList(log) {
  const container = document.getElementById("workout-sets-list");
  container.innerHTML = "";
  log.sets.forEach(function (s, i) {
    const row = document.createElement("div");
    row.className = "set-row";
    row.textContent = "Set " + (i + 1) + ": " + formatSetEntry(log.type, s);
    container.appendChild(row);
  });
}

async function renderWorkoutScreen() {
  const navEl = document.getElementById("workout-exercise-nav");
  const panel = document.getElementById("workout-current-exercise");
  const progressEl = document.getElementById("workout-progress");

  if (!activeSession.exerciseLogs.length) {
    progressEl.textContent = "No exercises yet — add one below.";
    navEl.innerHTML = "";
    panel.style.display = "none";
    return;
  }

  panel.style.display = "";
  progressEl.textContent = "Exercise " + (activeExerciseIndex + 1) + " of " + activeSession.exerciseLogs.length;

  navEl.innerHTML = "";
  activeSession.exerciseLogs.forEach(function (log, idx) {
    const pill = document.createElement("button");
    pill.textContent = (log.completed ? "✓ " : "") + log.exerciseName;
    pill.className = "exercise-pill" + (idx === activeExerciseIndex ? " active" : "");
    pill.addEventListener("click", function () {
      activeExerciseIndex = idx;
      renderWorkoutScreen();
    });
    navEl.appendChild(pill);
  });

  const log = currentExerciseLog();
  document.getElementById("workout-exercise-name").textContent = log.exerciseName;
  document.getElementById("workout-exercise-meta").textContent = describeTargets(log);

  const lastLog = await getLastLogForExercise(log.exerciseId);
  document.getElementById("workout-last-time").textContent = lastLog
    ? "Last time: " + formatSets(lastLog)
    : "No previous data for this exercise.";

  renderSetsList(log);
  renderSetInput(log);

  document.getElementById("workout-done-checkbox").checked = log.completed;
  document.getElementById("workout-exercise-notes").value = log.notes || "";
  document.getElementById("workout-exercise-notes").style.display = "none";
}

function getFieldValue(field) {
  const el = document.querySelector('#workout-set-input [data-field="' + field + '"]');
  return el ? el.value : "";
}

document.getElementById("workout-add-set-btn").addEventListener("click", async function () {
  const log = currentExerciseLog();
  const entry = { setNumber: log.sets.length + 1 };

  if (log.type === "strength") {
    entry.weight = Number(getFieldValue("weight")) || 0;
    entry.reps = Number(getFieldValue("reps")) || 0;
    entry.unit = currentUnits;
  } else if (log.type === "cardio") {
    entry.durationSec = Math.round((Number(getFieldValue("durationMin")) || 0) * 60);
    const distance = getFieldValue("distanceKm");
    entry.distanceKm = distance === "" ? null : Number(distance);
  } else {
    entry.reps = Number(getFieldValue("reps")) || 0;
    const hold = getFieldValue("holdSec");
    entry.holdSec = hold === "" ? null : Number(hold);
  }

  log.sets.push(entry);

  if (log.targetSets && log.sets.length >= log.targetSets) {
    log.completed = true;
  }

  await persistActiveSession();
  await renderWorkoutScreen();
  startRestTimer(log.restSec);
});

document.getElementById("workout-done-checkbox").addEventListener("change", async function (e) {
  currentExerciseLog().completed = e.target.checked;
  await persistActiveSession();
  await renderWorkoutScreen();
});

document.getElementById("workout-notes-toggle").addEventListener("click", function () {
  const ta = document.getElementById("workout-exercise-notes");
  ta.style.display = ta.style.display === "none" ? "block" : "none";
});

document.getElementById("workout-exercise-notes").addEventListener("change", async function (e) {
  currentExerciseLog().notes = e.target.value;
  await persistActiveSession();
});

document.getElementById("workout-add-exercise-btn").addEventListener("click", async function () {
  const select = document.getElementById("workout-exercise-select");
  const exerciseId = select.value;
  if (!exerciseId) return;
  const exercise = allExercisesCache.find(function (e) { return e.id === exerciseId; });

  activeSession.exerciseLogs.push({
    exerciseId: exerciseId,
    exerciseName: exercise.name,
    type: exercise.type,
    completed: false,
    notes: "",
    targetSets: exercise.type === "cardio" ? null : 3,
    targetReps: exercise.type === "cardio" ? null : 10,
    targetDurationSec: exercise.type === "cardio" ? 600 : null,
    targetDistanceKm: null,
    restSec: 90,
    sets: [],
  });

  activeExerciseIndex = activeSession.exerciseLogs.length - 1;
  await persistActiveSession();
  await renderWorkoutScreen();
});

document.getElementById("workout-back-btn").addEventListener("click", function () {
  clearRestTimer();
  closeOverlays();
});

document.getElementById("workout-finish-btn").addEventListener("click", function () {
  document.getElementById("finish-workout-notes").value = activeSession.notes || "";
  showOverlay("finish-workout-overlay");
});

document.getElementById("finish-workout-cancel").addEventListener("click", function () {
  showOverlay("screen-workout");
});

document.getElementById("finish-workout-confirm").addEventListener("click", async function () {
  clearRestTimer();
  activeSession.notes = document.getElementById("finish-workout-notes").value.trim();
  activeSession.status = "completed";
  activeSession.completedAt = new Date().toISOString();
  await persistActiveSession();
  activeSession = null;
  closeOverlays();
  await renderTodayScreen();
});

document.getElementById("choose-workout-btn").addEventListener("click", async function () {
  const routines = await dbGetAll("routines");
  const optionsEl = document.getElementById("choose-workout-options");
  optionsEl.innerHTML = "";

  routines
    .sort(function (a, b) { return a.name.localeCompare(b.name); })
    .forEach(function (routine) {
      const btn = document.createElement("button");
      btn.textContent = routine.name;
      btn.addEventListener("click", function () {
        closeOverlays();
        startWorkout(routine);
      });
      optionsEl.appendChild(btn);
    });

  const adhocBtn = document.createElement("button");
  adhocBtn.textContent = "Ad-hoc (no routine)";
  adhocBtn.addEventListener("click", function () {
    closeOverlays();
    startWorkout(null);
  });
  optionsEl.appendChild(adhocBtn);

  showOverlay("choose-workout-overlay");
});

document.getElementById("choose-workout-cancel").addEventListener("click", function () {
  closeOverlays();
});

document.getElementById("start-workout-btn").addEventListener("click", function () {
  startWorkout(currentTodayRoutine);
});

document.querySelector('.nav-btn[data-screen="today"]').addEventListener("click", function () {
  renderTodayScreen();
});

const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;
let pendingResumeSession = null;

async function checkForResumableSession() {
  const sessions = await dbGetAll("workoutSessions");
  const inProgress = sessions.filter(function (s) { return s.status === "in_progress"; });

  for (const session of inProgress) {
    const ageMs = Date.now() - new Date(session.startedAt).getTime();
    if (ageMs >= RESUME_WINDOW_MS) {
      session.status = "abandoned";
      await dbPut("workoutSessions", session);
    }
  }

  const resumable = inProgress.find(function (s) {
    return Date.now() - new Date(s.startedAt).getTime() < RESUME_WINDOW_MS;
  });

  if (resumable) {
    pendingResumeSession = resumable;
    document.getElementById("resume-prompt-text").textContent =
      'You have an unfinished "' + resumable.routineName + '" workout from today. Resume where you left off?';
    showOverlay("resume-prompt-overlay");
  }
}

function findResumeIndex(session) {
  const idx = session.exerciseLogs.findIndex(function (log) { return !log.completed; });
  return idx === -1 ? 0 : idx;
}

async function resumeSession(session) {
  allExercisesCache = await dbGetAll("exercises");
  activeSession = session;
  activeExerciseIndex = findResumeIndex(session);
  populateWorkoutAddExerciseSelect();
  document.getElementById("workout-screen-title").textContent = activeSession.routineName;
  await renderWorkoutScreen();
  showOverlay("screen-workout");
}

document.getElementById("resume-prompt-confirm").addEventListener("click", async function () {
  const session = pendingResumeSession;
  pendingResumeSession = null;
  closeOverlays();
  await resumeSession(session);
});

document.getElementById("resume-prompt-dismiss").addEventListener("click", function () {
  pendingResumeSession = null;
  closeOverlays();
});
