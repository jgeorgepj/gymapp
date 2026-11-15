const EXERCISE_SEED = [
  // Strength — Chest
  { name: "Barbell Bench Press", type: "strength", muscleGroup: "Chest", defaultUnit: "kg" },
  { name: "Incline Dumbbell Press", type: "strength", muscleGroup: "Chest", defaultUnit: "kg" },
  { name: "Cable Fly", type: "strength", muscleGroup: "Chest", defaultUnit: "kg" },
  { name: "Machine Chest Press", type: "strength", muscleGroup: "Chest", defaultUnit: "kg" },

  // Strength — Back
  { name: "Deadlift", type: "strength", muscleGroup: "Back", defaultUnit: "kg" },
  { name: "Barbell Row", type: "strength", muscleGroup: "Back", defaultUnit: "kg" },
  { name: "Lat Pulldown", type: "strength", muscleGroup: "Back", defaultUnit: "kg" },
  { name: "Seated Cable Row", type: "strength", muscleGroup: "Back", defaultUnit: "kg" },
  { name: "T-Bar Row", type: "strength", muscleGroup: "Back", defaultUnit: "kg" },

  // Strength — Legs
  { name: "Back Squat", type: "strength", muscleGroup: "Legs", defaultUnit: "kg" },
  { name: "Leg Press", type: "strength", muscleGroup: "Legs", defaultUnit: "kg" },
  { name: "Leg Curl", type: "strength", muscleGroup: "Legs", defaultUnit: "kg" },
  { name: "Leg Extension", type: "strength", muscleGroup: "Legs", defaultUnit: "kg" },
  { name: "Hip Thrust", type: "strength", muscleGroup: "Legs", defaultUnit: "kg" },
  { name: "Calf Raise", type: "strength", muscleGroup: "Legs", defaultUnit: "kg" },
  { name: "Goblet Squat", type: "strength", muscleGroup: "Legs", defaultUnit: "kg" },

  // Strength — Shoulders
  { name: "Overhead Press", type: "strength", muscleGroup: "Shoulders", defaultUnit: "kg" },
  { name: "Dumbbell Shoulder Press", type: "strength", muscleGroup: "Shoulders", defaultUnit: "kg" },
  { name: "Lateral Raise", type: "strength", muscleGroup: "Shoulders", defaultUnit: "kg" },
  { name: "Face Pull", type: "strength", muscleGroup: "Shoulders", defaultUnit: "kg" },

  // Strength — Arms
  { name: "Bicep Curl", type: "strength", muscleGroup: "Arms", defaultUnit: "kg" },
  { name: "Hammer Curl", type: "strength", muscleGroup: "Arms", defaultUnit: "kg" },
  { name: "Tricep Pushdown", type: "strength", muscleGroup: "Arms", defaultUnit: "kg" },
  { name: "Skull Crusher", type: "strength", muscleGroup: "Arms", defaultUnit: "kg" },

  // Cardio
  { name: "Treadmill Run", type: "cardio", muscleGroup: "Cardio", defaultUnit: "distance" },
  { name: "Outdoor Run", type: "cardio", muscleGroup: "Cardio", defaultUnit: "distance" },
  { name: "Stationary Bike", type: "cardio", muscleGroup: "Cardio", defaultUnit: "distance" },
  { name: "Rowing Machine", type: "cardio", muscleGroup: "Cardio", defaultUnit: "distance" },
  { name: "Elliptical", type: "cardio", muscleGroup: "Cardio", defaultUnit: "time" },
  { name: "Stair Climber", type: "cardio", muscleGroup: "Cardio", defaultUnit: "time" },
  { name: "Swimming", type: "cardio", muscleGroup: "Cardio", defaultUnit: "distance" },

  // Bodyweight
  { name: "Push-Up", type: "bodyweight", muscleGroup: "Chest", defaultUnit: "reps" },
  { name: "Pull-Up", type: "bodyweight", muscleGroup: "Back", defaultUnit: "reps" },
  { name: "Chin-Up", type: "bodyweight", muscleGroup: "Back", defaultUnit: "reps" },
  { name: "Dip", type: "bodyweight", muscleGroup: "Arms", defaultUnit: "reps" },
  { name: "Plank", type: "bodyweight", muscleGroup: "Core", defaultUnit: "reps" },
  { name: "Sit-Up", type: "bodyweight", muscleGroup: "Core", defaultUnit: "reps" },
  { name: "Bodyweight Squat", type: "bodyweight", muscleGroup: "Legs", defaultUnit: "reps" },
  { name: "Walking Lunge", type: "bodyweight", muscleGroup: "Legs", defaultUnit: "reps" },
  { name: "Burpee", type: "bodyweight", muscleGroup: "Other", defaultUnit: "reps" },
  { name: "Mountain Climber", type: "bodyweight", muscleGroup: "Core", defaultUnit: "reps" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function seedDatabaseIfNeeded() {
  const existingExercises = await dbGetAll("exercises");
  if (existingExercises.length === 0) {
    for (const ex of EXERCISE_SEED) {
      await dbPut("exercises", {
        id: uuid(),
        name: ex.name,
        type: ex.type,
        muscleGroup: ex.muscleGroup,
        isCustom: false,
        hidden: false,
        defaultUnit: ex.defaultUnit,
      });
    }
  }

  const existingSchedule = await dbGetAll("schedule");
  if (existingSchedule.length === 0) {
    for (const day of WEEKDAYS) {
      await dbPut("schedule", { day, routineId: null });
    }
  }
}
