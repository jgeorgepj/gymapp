let editingExerciseId = null;
let currentUnits = "kg";
const KG_TO_LBS = 2.20462;

function convertWeight(value, fromUnit, toUnit) {
  if (value == null || fromUnit === toUnit) return value;
  if (fromUnit === "kg" && toUnit === "lbs") return value * KG_TO_LBS;
  if (fromUnit === "lbs" && toUnit === "kg") return value / KG_TO_LBS;
  return value;
}

function formatWeight(value, storedUnit, displayUnit) {
  if (value == null) return value;
  return Math.round(convertWeight(value, storedUnit, displayUnit) * 10) / 10;
}

async function loadUnitsPreference() {
  const settings = await getAppSettings();
  currentUnits = (settings && settings.units) || "kg";
  const select = document.getElementById("units-select");
  if (select) select.value = currentUnits;
}

document.getElementById("units-select").addEventListener("change", async function () {
  const settings = await getAppSettings();
  settings.units = this.value;
  await dbPut("settings", settings);
  currentUnits = this.value;

  if (activeSession) await renderWorkoutScreen();
  await renderStrengthChartSection();
  await renderBodyWeightSection();
});

async function renderExerciseLibrary() {
  const exercises = await dbGetAll("exercises");
  const container = document.getElementById("exercise-library-list");
  container.innerHTML = "";

  const types = ["strength", "cardio", "bodyweight"];
  types.forEach(function (type) {
    const group = exercises
      .filter(function (ex) { return ex.type === type; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (group.length === 0) return;

    const heading = document.createElement("h3");
    heading.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    container.appendChild(heading);

    group.forEach(function (ex) {
      container.appendChild(renderExerciseRow(ex));
    });
  });
}

function renderExerciseRow(ex) {
  const row = document.createElement("div");
  row.className = "exercise-row" + (ex.hidden ? " hidden-exercise" : "");

  const label = document.createElement("span");
  label.textContent = ex.name + " · " + ex.muscleGroup + (ex.hidden ? " (hidden)" : "");
  row.appendChild(label);

  const actions = document.createElement("div");
  actions.className = "exercise-row-actions";

  if (ex.isCustom) {
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () { openExerciseForm(ex); });
    actions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async function () {
      if (confirm('Delete "' + ex.name + '"? This cannot be undone.')) {
        await deleteExercise(ex.id);
        await renderExerciseLibrary();
      }
    });
    actions.appendChild(delBtn);
  } else {
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = ex.hidden ? "Unhide" : "Hide";
    toggleBtn.addEventListener("click", async function () {
      await setExerciseHidden(ex.id, !ex.hidden);
      await renderExerciseLibrary();
    });
    actions.appendChild(toggleBtn);
  }

  row.appendChild(actions);
  return row;
}

function openExerciseForm(ex) {
  editingExerciseId = ex ? ex.id : null;
  document.getElementById("exercise-form-title").textContent = ex ? "Edit Exercise" : "Add Exercise";
  document.getElementById("exercise-form-name").value = ex ? ex.name : "";
  document.getElementById("exercise-form-type").value = ex ? ex.type : "strength";
  document.getElementById("exercise-form-musclegroup").value = ex ? ex.muscleGroup : "Chest";
  document.getElementById("exercise-form-error").textContent = "";
  showOverlay("exercise-form-overlay");
}

function closeExerciseForm() {
  document.querySelectorAll(".overlay-screen").forEach(function (el) {
    el.classList.remove("active");
  });
}

document.getElementById("add-exercise-btn").addEventListener("click", function () {
  openExerciseForm(null);
});

document.getElementById("exercise-form-cancel").addEventListener("click", function () {
  closeExerciseForm();
});

document.getElementById("exercise-form-save").addEventListener("click", async function () {
  const name = document.getElementById("exercise-form-name").value.trim();
  const type = document.getElementById("exercise-form-type").value;
  const muscleGroup = document.getElementById("exercise-form-musclegroup").value;
  const errorEl = document.getElementById("exercise-form-error");

  if (!name) {
    errorEl.textContent = "Name is required.";
    return;
  }

  const defaultUnit = defaultUnitForType(type);

  if (editingExerciseId) {
    await updateExercise(editingExerciseId, { name: name, type: type, muscleGroup: muscleGroup, defaultUnit: defaultUnit });
  } else {
    await addExercise({ name: name, type: type, muscleGroup: muscleGroup, defaultUnit: defaultUnit });
  }

  closeExerciseForm();
  await renderExerciseLibrary();
});

document.querySelector('.nav-btn[data-screen="settings"]').addEventListener("click", function () {
  renderExerciseLibrary();
});

const ALL_STORES = ["settings", "exercises", "routines", "schedule", "workoutSessions", "bodyWeightLogs"];

async function exportData() {
  const data = {};
  for (const store of ALL_STORES) {
    data[store] = await dbGetAll(store);
  }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ironlog-backup-" + todayDateString() + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById("export-data-btn").addEventListener("click", exportData);

document.getElementById("import-data-btn").addEventListener("click", function () {
  document.getElementById("import-data-file").click();
});

document.getElementById("import-data-file").addEventListener("change", async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm("Importing will overwrite ALL current data with the contents of this backup file. Continue?")) {
    e.target.value = "";
    return;
  }

  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    alert("That file doesn't look like a valid IronLog backup.");
    e.target.value = "";
    return;
  }

  for (const store of ALL_STORES) {
    await dbClear(store);
    if (Array.isArray(data[store])) {
      for (const record of data[store]) {
        await dbPut(store, record);
      }
    }
  }

  e.target.value = "";
  alert("Import complete. Reloading the app...");
  location.reload();
});
