const DB_NAME = "ironlog-db";
const DB_VERSION = 1;

const dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore("settings", { keyPath: "id" });
    db.createObjectStore("exercises", { keyPath: "id" });
    db.createObjectStore("routines", { keyPath: "id" });
    db.createObjectStore("schedule", { keyPath: "day" });

    const sessions = db.createObjectStore("workoutSessions", { keyPath: "id" });
    sessions.createIndex("date", "date");

    const bodyWeight = db.createObjectStore("bodyWeightLogs", { keyPath: "id" });
    bodyWeight.createIndex("date", "date");
  },
});

async function dbGetAll(store) {
  return (await dbPromise).getAll(store);
}

async function dbGet(store, key) {
  return (await dbPromise).get(store, key);
}

async function dbPut(store, value) {
  return (await dbPromise).put(store, value);
}

async function dbDelete(store, key) {
  return (await dbPromise).delete(store, key);
}

async function dbClear(store) {
  return (await dbPromise).clear(store);
}

function uuid() {
  return crypto.randomUUID();
}
