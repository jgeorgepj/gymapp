let editingRoutine = null;
let pickerForDay = null;
let exerciseCache = [];

async function renderScheduleScreen() {
  exerciseCache = await dbGetAll("exercises");
  await renderWeekdayGrid();
  await renderRoutineList();
}

async function renderWeekdayGrid() {
  const schedule = await dbGetAll("schedule");
  const routines = await dbGetAll("routines");
  const byDay = {};
  schedule.forEach(function (s) { byDay[s.day] = s; });

  const grid = document.getElementById("weekday-grid");
  grid.innerHTML = "";

  WEEKDAYS.forEach(function (day) {
    const entry = byDay[day] || { day: day, routineId: null };
    const routine = entry.routineId ? routines.find(function (r) { return r.id === entry.routineId; }) : null;

    const row = document.createElement("button");
    row.className = "weekday-row";
    row.innerHTML =
      '<span class="weekday-label">' + day + "</span>" +
      '<span class="weekday-routine">' + (routine ? routine.name : "Rest") + "</span>";
    row.addEventListener("click", function () { openDayPicker(day); });
    grid.appendChild(row);
  });
}

async function renderRoutineList() {
  const routines = await dbGetAll("routines");
  const container = document.getElementById("routine-list");
  container.innerHTML = "";

  routines
    .sort(function (a, b) { return a.name.localeCompare(b.name); })
    .forEach(function (routine) {
      const row = document.createElement("div");
      row.className = "routine-row";

      const label = document.createElement("span");
      label.textContent = routine.name + " (" + routine.exercises.length + " exercises)";
      row.appendChild(label);

      const actions = document.createElement("div");
      actions.className = "exercise-row-actions";

      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        pickerForDay = null;
        openRoutineEditor(routine);
      });
      actions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async function () {
        if (confirm('Delete routine "' + routine.name + '"? Any days using it will be set to Rest.')) {
          await deleteRoutine(routine.id);
          await renderScheduleScreen();
        }
      });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      container.appendChild(row);
    });
}

async function openDayPicker(day) {
  pickerForDay = day;
  document.getElementById("day-picker-title").textContent = "Assign " + day;

  const routines = await dbGetAll("routines");
  const optionsEl = document.getElementById("day-picker-options");
  optionsEl.innerHTML = "";

  const restBtn = document.createElement("button");
  restBtn.textContent = "Rest";
  restBtn.addEventListener("click", async function () {
    await assignRoutineToDay(pickerForDay, null);
    closeOverlays();
    await renderScheduleScreen();
  });
  optionsEl.appendChild(restBtn);

  routines
    .sort(function (a, b) { return a.name.localeCompare(b.name); })
    .forEach(function (routine) {
      const btn = document.createElement("button");
      btn.textContent = routine.name;
      btn.addEventListener("click", async function () {
        await assignRoutineToDay(pickerForDay, routine.id);
        closeOverlays();
        await renderScheduleScreen();
      });
      optionsEl.appendChild(btn);
    });

  const newBtn = document.createElement("button");
  newBtn.textContent = "+ New Routine";
  newBtn.addEventListener("click", function () {
    openRoutineEditor(null);
  });
  optionsEl.appendChild(newBtn);

  showOverlay("day-picker-overlay");
}

async function assignRoutineToDay(day, routineId) {
  await dbPut("schedule", { day: day, routineId: routineId });
}

function closeOverlays() {
  document.querySelectorAll(".overlay-screen").forEach(function (el) {
    el.classList.remove("active");
  });
}

function openRoutineEditor(routine) {
  editingRoutine = routine
    ? JSON.parse(JSON.stringify(routine))
    : { id: null, name: "", exercises: [] };

  populateRoutineExerciseSelect();
  document.getElementById("routine-editor-title").textContent = editingRoutine.id ? "Edit Routine" : "New Routine";
  document.getElementById("routine-name-input").value = editingRoutine.name;
  renderRoutineEditor();
  document.getElementById("routine-editor-error").textContent = "";
  showOverlay("routine-editor-overlay");
}

function populateRoutineExerciseSelect() {
  const select = document.getElementById("routine-exercise-select");
  select.innerHTML = "";
  const types = ["strength", "cardio", "bodyweight"];
  types.forEach(function (type) {
    const options = exerciseCache
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

function renderRoutineEditor() {
  const list = document.getElementById("routine-exercise-list");
  list.innerHTML = "";

  editingRoutine.exercises.forEach(function (entry, idx) {
    list.appendChild(renderRoutineExerciseRow(entry, idx));
  });
}

function renderRoutineExerciseRow(entry, idx) {
  const exercise = exerciseCache.find(function (ex) { return ex.id === entry.exerciseId; });
  const row = document.createElement("div");
  row.className = "routine-exercise-row";

  const name = document.createElement("span");
  name.className = "routine-exercise-name";
  name.textContent = exercise ? exercise.name : "(unknown exercise)";
  row.appendChild(name);

  const fields = document.createElement("div");
  fields.className = "routine-exercise-fields";

  if (exercise && exercise.type === "cardio") {
    fields.appendChild(makeFieldInput("Duration (min)", Math.round((entry.targetDurationSec || 0) / 60), function (val) {
      entry.targetDurationSec = Number(val) * 60;
    }));
    fields.appendChild(makeFieldInput("Distance (km)", entry.targetDistanceKm || "", function (val) {
      entry.targetDistanceKm = val === "" ? null : Number(val);
    }));
  } else {
    fields.appendChild(makeFieldInput("Sets", entry.targetSets || "", function (val) {
      entry.targetSets = val === "" ? null : Number(val);
    }));
    fields.appendChild(makeFieldInput("Reps", entry.targetReps || "", function (val) {
      entry.targetReps = val === "" ? null : Number(val);
    }));
  }

  fields.appendChild(makeFieldInput("Rest (sec)", entry.restSec || "", function (val) {
    entry.restSec = val === "" ? null : Number(val);
  }));

  row.appendChild(fields);

  const actions = document.createElement("div");
  actions.className = "routine-exercise-actions";

  const upBtn = document.createElement("button");
  upBtn.textContent = "Up";
  upBtn.disabled = idx === 0;
  upBtn.addEventListener("click", function () {
    swapRoutineExercises(idx, idx - 1);
  });
  actions.appendChild(upBtn);

  const downBtn = document.createElement("button");
  downBtn.textContent = "Down";
  downBtn.disabled = idx === editingRoutine.exercises.length - 1;
  downBtn.addEventListener("click", function () {
    swapRoutineExercises(idx, idx + 1);
  });
  actions.appendChild(downBtn);

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", function () {
    editingRoutine.exercises.splice(idx, 1);
    renderRoutineEditor();
  });
  actions.appendChild(removeBtn);

  row.appendChild(actions);
  return row;
}

function makeFieldInput(labelText, value, onChange) {
  const group = document.createElement("label");
  group.className = "field-group";
  group.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.value = value;
  input.addEventListener("change", function () { onChange(input.value); });
  group.appendChild(input);
  return group;
}

function swapRoutineExercises(i, j) {
  const arr = editingRoutine.exercises;
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
  renderRoutineEditor();
}

document.getElementById("routine-add-exercise-btn").addEventListener("click", function () {
  const select = document.getElementById("routine-exercise-select");
  const exerciseId = select.value;
  if (!exerciseId) return;
  const exercise = exerciseCache.find(function (ex) { return ex.id === exerciseId; });

  const entry = {
    exerciseId: exerciseId,
    order: editingRoutine.exercises.length + 1,
    targetSets: exercise.type === "cardio" ? null : 3,
    targetReps: exercise.type === "cardio" ? null : 10,
    targetDurationSec: exercise.type === "cardio" ? 600 : null,
    targetDistanceKm: null,
    restSec: 90,
  };
  editingRoutine.exercises.push(entry);
  renderRoutineEditor();
});

document.getElementById("routine-editor-cancel").addEventListener("click", function () {
  editingRoutine = null;
  pickerForDay = null;
  closeOverlays();
});

document.getElementById("routine-editor-save").addEventListener("click", async function () {
  const name = document.getElementById("routine-name-input").value.trim();
  const errorEl = document.getElementById("routine-editor-error");

  if (!name) {
    errorEl.textContent = "Routine name is required.";
    return;
  }

  editingRoutine.exercises.forEach(function (entry, idx) { entry.order = idx + 1; });

  let savedRoutine;
  if (editingRoutine.id) {
    await updateRoutine(editingRoutine.id, { name: name, exercises: editingRoutine.exercises });
    savedRoutine = editingRoutine;
  } else {
    savedRoutine = await createRoutine({ name: name, exercises: editingRoutine.exercises });
  }

  if (pickerForDay) {
    await assignRoutineToDay(pickerForDay, savedRoutine.id);
    pickerForDay = null;
  }

  editingRoutine = null;
  closeOverlays();
  await renderScheduleScreen();
});

document.getElementById("day-picker-cancel").addEventListener("click", function () {
  pickerForDay = null;
  closeOverlays();
});

document.getElementById("new-routine-btn").addEventListener("click", function () {
  pickerForDay = null;
  openRoutineEditor(null);
});

document.querySelector('.nav-btn[data-screen="schedule"]').addEventListener("click", function () {
  renderScheduleScreen();
});
