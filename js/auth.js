let isUnlocked = false;
let lastActiveAt = Date.now();
const LOCK_AFTER_MS = 5 * 60 * 1000;

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getAppSettings() {
  return dbGet("settings", "app");
}

async function setupPin(pin) {
  const pinHash = await hashPin(pin);
  await dbPut("settings", {
    id: "app",
    pinHash: pinHash,
    units: "kg",
    theme: "dark",
    appVersion: "1.0.0",
  });
}

async function verifyPin(pin) {
  const settings = await getAppSettings();
  if (!settings) return false;
  const hash = await hashPin(pin);
  return hash === settings.pinHash;
}

async function changePin(oldPin, newPin) {
  const ok = await verifyPin(oldPin);
  if (!ok) return false;
  const settings = await getAppSettings();
  settings.pinHash = await hashPin(newPin);
  await dbPut("settings", settings);
  return true;
}

function showOverlay(id) {
  document.querySelectorAll(".overlay-screen").forEach(function (el) {
    el.classList.toggle("active", el.id === id);
  });
}

function showPinSetupScreen() {
  showOverlay("screen-pin-setup");
}

function showLockScreen() {
  showOverlay("screen-lock");
}

function unlockApp() {
  isUnlocked = true;
  lastActiveAt = Date.now();
  document.querySelectorAll(".overlay-screen").forEach(function (el) {
    el.classList.remove("active");
  });
  document.getElementById("app-main").classList.remove("hidden");
  loadUnitsPreference();
  renderTodayScreen();
  checkForResumableSession();
}

function lockApp() {
  isUnlocked = false;
  document.getElementById("app-main").classList.add("hidden");
  showLockScreen();
}

document.getElementById("pin-setup-submit").addEventListener("click", async function () {
  const p1 = document.getElementById("pin-setup-1").value.trim();
  const p2 = document.getElementById("pin-setup-2").value.trim();
  const errorEl = document.getElementById("pin-setup-error");
  if (!/^\d{4,6}$/.test(p1)) {
    errorEl.textContent = "PIN must be 4-6 digits.";
    return;
  }
  if (p1 !== p2) {
    errorEl.textContent = "PINs don't match.";
    return;
  }
  await setupPin(p1);
  errorEl.textContent = "";
  unlockApp();
});

document.getElementById("pin-lock-submit").addEventListener("click", async function () {
  const input = document.getElementById("pin-lock-input");
  const errorEl = document.getElementById("pin-lock-error");
  const ok = await verifyPin(input.value.trim());
  if (ok) {
    errorEl.textContent = "";
    input.value = "";
    unlockApp();
  } else {
    errorEl.textContent = "Incorrect PIN.";
  }
});

document.getElementById("pin-lock-input").addEventListener("keydown", function (e) {
  if (e.key === "Enter") document.getElementById("pin-lock-submit").click();
});

document.getElementById("pin-setup-2").addEventListener("keydown", function (e) {
  if (e.key === "Enter") document.getElementById("pin-setup-submit").click();
});

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") {
    lastActiveAt = Date.now();
  } else if (document.visibilityState === "visible" && isUnlocked) {
    if (Date.now() - lastActiveAt >= LOCK_AFTER_MS) {
      lockApp();
    }
  }
});
