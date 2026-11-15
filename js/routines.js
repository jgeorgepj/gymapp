async function addExercise(data) {
  const exercise = {
    id: uuid(),
    name: data.name,
    type: data.type,
    muscleGroup: data.muscleGroup,
    isCustom: true,
    hidden: false,
    defaultUnit: data.defaultUnit,
  };
  await dbPut("exercises", exercise);
  return exercise;
}

async function updateExercise(id, updates) {
  const exercise = await dbGet("exercises", id);
  if (!exercise) return;
  Object.assign(exercise, updates);
  await dbPut("exercises", exercise);
}

async function deleteExercise(id) {
  const exercise = await dbGet("exercises", id);
  if (!exercise || !exercise.isCustom) return;
  await dbDelete("exercises", id);
}

async function setExerciseHidden(id, hidden) {
  const exercise = await dbGet("exercises", id);
  if (!exercise) return;
  exercise.hidden = hidden;
  await dbPut("exercises", exercise);
}

function defaultUnitForType(type) {
  if (type === "cardio") return "distance";
  if (type === "bodyweight") return "reps";
  return "kg";
}

async function createRoutine(data) {
  const routine = {
    id: uuid(),
    name: data.name,
    exercises: data.exercises || [],
  };
  await dbPut("routines", routine);
  return routine;
}

async function updateRoutine(id, updates) {
  const routine = await dbGet("routines", id);
  if (!routine) return;
  Object.assign(routine, updates);
  await dbPut("routines", routine);
}

async function deleteRoutine(id) {
  await dbDelete("routines", id);
  const scheduleDays = await dbGetAll("schedule");
  for (const day of scheduleDays) {
    if (day.routineId === id) {
      await dbPut("schedule", { day: day.day, routineId: null });
    }
  }
}
