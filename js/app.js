function showScreen(name) {
  document.querySelectorAll(".screen").forEach(function (el) {
    el.classList.toggle("active", el.id === "screen-" + name);
  });
  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.screen === name);
  });
}

document.querySelectorAll(".nav-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    showScreen(btn.dataset.screen);
  });
});

(async function boot() {
  await seedDatabaseIfNeeded();

  const settings = await getAppSettings();
  if (!settings || !settings.pinHash) {
    showPinSetupScreen();
  } else {
    showLockScreen();
  }
})();
