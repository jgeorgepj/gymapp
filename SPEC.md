# IronLog — Gym Workout Tracker PWA
### Product & Technical Specification

**Owner:** Single user (personal use)
**Platform:** Installable Progressive Web App (PWA) — works on iOS and Android via the browser, no app store needed
**Status:** Draft spec, v1.0

---

## 1. Overview

IronLog is a mobile-first web app for tracking gym workouts. You pre-configure a weekly workout schedule (e.g. Monday = Push, Tuesday = Pull), then each day open the app, start the suggested workout (or any other), log each exercise's sets/reps/weight/time/distance as you go, and later review progress through history, charts, and a body-weight trend.

It runs entirely in the browser, stores all data **locally on the device** (no backend, no account system beyond a local PIN), and is installed straight from the browser to the home screen — no Apple App Store or Google Play required.

### 1.1 Goals
- Single user, single device. Simple PIN-protected access.
- Pre-configure a routine per day of the week.
- Log strength (weight/reps/sets), cardio (time/distance), and bodyweight (reps) exercises during a live workout session.
- Track body weight over time separately.
- View workout history/calendar, per-exercise strength progress charts, and body-weight trend chart.
- Fully installable as a PWA (Add to Home Screen) on both iOS Safari and Android Chrome.
- Works fully offline after first load.
- Simple JSON export/import for manual backup.

### 1.2 Non-goals (v1)
- No multi-user accounts, no login server, no cloud sync.
- No circuit/HIIT-style round timers (AMRAP/EMOM) — only straight sets/reps and time/distance.
- No volume totals or personal-record (PR) auto-detection dashboard (left as a future enhancement).
- No social features, no sharing.

---

## 2. Tech Stack

Chosen for simplicity, since this is a beginner-friendly build with no backend:

| Layer | Choice | Why |
|---|---|---|
| Markup/Styling | Plain HTML5 + CSS3 | No build step, no npm install, easy to read and edit directly. |
| Logic | Plain JavaScript (ES6+, vanilla, no framework) | No compiling/bundling needed. Just `<script>` tags. |
| Storage | **IndexedDB** via the small [`idb`](https://github.com/jakearchibald/idb) helper library (loaded from a CDN as a single script, no build tool) | Browser's built-in local database. Handles structured data (routines, logs) far better than `localStorage`. Works fully offline. |
| Offline/Install | Service Worker + Web App Manifest | Standard PWA mechanism — makes the app installable and usable with no network connection. |
| Charts | [Chart.js](https://www.chartjs.org/) via CDN `<script>` tag | Simple canvas-based charts, no build step, good enough for line charts of strength/body-weight trends. |
| Hosting | **GitHub Pages** | Free, HTTPS by default (required for PWA install), deploys directly from this git repo. |

No React/Vue/Angular, no Webpack/Vite, no Node backend. Just static files served over HTTPS.

### 2.1 Why IndexedDB instead of localStorage
`localStorage` only stores strings and has a small size cap (~5MB), which gets awkward fast with years of workout logs. IndexedDB is built into every mobile browser, has much higher storage limits, and supports structured records and indexes (e.g. "all logs for exercise X, sorted by date") — which the Reports screen needs.

---

## 3. Information Architecture / Screens

Bottom navigation bar with 4 tabs (visible once unlocked):

1. **Today** — home screen. Shows today's scheduled workout (or lets you pick another), with a "Start Workout" button. Also shows yesterday's completion status / a small streak indicator.
2. **Schedule** — configure which routine runs on which day of the week; create/edit/delete routines and the exercises within them.
3. **Reports** — workout history/calendar, per-exercise strength progress chart, body-weight trend chart, body-weight entry form.
4. **Settings** — PIN change, units (kg/lbs), export/import backup, exercise library management, about/version.

Plus modal/full-screen flows:
- **Lock screen** (PIN entry) — shown on app launch/resume until unlocked.
- **Live Workout screen** — full-screen logging UI while a workout is in progress (reachable from Today tab).
- **Exercise Library** — add/edit custom exercises (reachable from Schedule and Settings).

```
[Lock Screen: PIN entry]
        |
        v
+-------------------------------------------+
|  Today   Schedule   Reports   Settings    |  <- bottom nav
+-------------------------------------------+
   |            |          |          |
Start Workout  Edit     History/     PIN,
  -> Live      Days/    Charts/      Units,
  Workout      Routines  BodyWt      Backup,
                          Entry      Exercise Lib
```

---

## 4. Data Model (IndexedDB)

One IndexedDB database: `ironlog-db`. Object stores (tables):

### 4.1 `settings` (single record, key = `"app"`)
```js
{
  id: "app",
  pinHash: "<sha-256 hash of PIN>",
  units: "kg" | "lbs",
  theme: "dark",             // reserved for future light/dark toggle
  appVersion: "1.0.0"
}
```
PIN is never stored in plain text — hashed client-side with SubtleCrypto (SHA-256) before saving. There is no "forgot PIN" recovery server; the Settings screen lets you change the PIN once unlocked. If truly locked out, a documented recovery path (Section 8.4) resets app data.

### 4.2 `exercises`
```js
{
  id: "uuid",
  name: "Barbell Bench Press",
  type: "strength" | "cardio" | "bodyweight",
  muscleGroup: "Chest" | "Back" | "Legs" | "Shoulders" | "Arms" | "Core" | "Cardio" | "Other",
  isCustom: false,           // true if user-added vs built-in starter list
  defaultUnit: "kg" | "time" | "distance" | "reps"   // hints which fields to show when logging
}
```
Seeded on first launch with ~30–40 common exercises spanning strength (bench press, squat, deadlift, overhead press, barbell row, lat pulldown, leg press, bicep curl, etc.), cardio (treadmill run, cycling, rowing machine, elliptical, stair climber), and bodyweight (push-ups, pull-ups, dips, plank, lunges, sit-ups). User can add/edit/delete their own on top of this list.

### 4.3 `routines`
A routine is a named, reusable workout template (e.g. "Push Day", "Leg Day", "5k Run").
```js
{
  id: "uuid",
  name: "Push Day",
  exercises: [
    {
      exerciseId: "uuid",         // FK -> exercises
      order: 1,
      targetSets: 3,               // strength/bodyweight: planned number of sets
      targetReps: 10,               // strength/bodyweight: planned reps per set
      targetDurationSec: null,      // cardio: planned duration
      targetDistanceKm: null,       // cardio: planned distance
      restSec: 90                   // suggested rest timer default for this exercise
    },
    // ...more exercises
  ]
}
```

### 4.4 `schedule`
Exactly 7 records, one per weekday, mapping a day to a routine (or rest).
```js
{
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun",
  routineId: "uuid" | null   // null = Rest day
}
```

### 4.5 `workoutSessions`
One record per actual workout performed (whether it followed the day's schedule or was an ad-hoc choice).
```js
{
  id: "uuid",
  date: "2026-11-14",            // ISO date, local
  routineId: "uuid" | null,      // which routine it was based on (null if fully ad-hoc)
  routineName: "Push Day",       // snapshot of name at time of workout, in case routine is renamed/deleted later
  startedAt: "2026-11-14T18:02:00",
  completedAt: "2026-11-14T19:10:00" | null,
  status: "in_progress" | "completed" | "abandoned",
  notes: "Felt strong today",
  exerciseLogs: [
    {
      exerciseId: "uuid",
      exerciseName: "Barbell Bench Press",  // snapshot
      type: "strength",
      completed: true,                       // checkmark state
      notes: "left shoulder a bit tight",
      sets: [
        { setNumber: 1, weight: 60, reps: 10, unit: "kg" },
        { setNumber: 2, weight: 60, reps: 9,  unit: "kg" },
        { setNumber: 3, weight: 65, reps: 6,  unit: "kg" }
      ],
      cardio: {                              // present only for type "cardio"
        durationSec: 1500,
        distanceKm: 5.0
      }
    }
    // ...more exercise logs
  ]
}
```
Bodyweight exercises reuse the `sets` array (reps only, `weight: null`).

### 4.6 `bodyWeightLogs`
```js
{
  id: "uuid",
  date: "2026-11-14",
  weight: 78.4,
  unit: "kg",
  note: ""
}
```

---

## 5. Feature Details

### 5.1 Login (PIN lock)
- First launch: "Set up your PIN" screen — enter a 4–6 digit PIN twice to confirm. Hashed (SHA-256) and stored in `settings.pinHash`.
- Every subsequent app open (or resume after being backgrounded >5 minutes) shows a Lock screen requiring the PIN before revealing any data.
- Settings screen allows changing the PIN (must enter current PIN first).
- No biometrics in v1 (kept simple, per decision); can be added later via WebAuthn.

### 5.2 Schedule configuration (Schedule tab)
- Grid/list of the 7 weekdays, each showing the assigned routine name or "Rest".
- Tapping a day opens a picker: choose an existing routine, mark as Rest, or create a new routine inline.
- Routine editor: name the routine, add exercises from the library (search/filter by muscle group or type), set target sets/reps (strength/bodyweight) or target duration/distance (cardio), set a default rest time per exercise, reorder via drag or up/down buttons, remove exercises.
- Routines are reusable — the same "Push Day" routine can be assigned to multiple weekdays.

### 5.3 Today screen
- Shows today's weekday and the routine scheduled for it (or "Rest day").
- Big **Start Workout** button, defaulting to today's scheduled routine.
- A secondary **"Choose a different workout"** link/button lets you pick any other saved routine or start a **blank/ad-hoc session** (add exercises on the fly) — the schedule is a default suggestion, not a restriction.
- If a workout was already completed today, shows a "✅ Completed" summary instead of the Start button, with an option to log another session anyway.
- Small recent-activity strip (last 7 days, dot per day: worked out / rest / missed).

### 5.4 Live Workout screen
Entered after tapping Start Workout. Full-screen, one exercise at a time (swipe or tap to move between exercises in the routine; order editable on the fly by jumping to any exercise from a mini exercise list at the top).

Per exercise, shows:
- Exercise name, muscle group/type.
- **Last time's performance** for this exercise (most recent prior `exerciseLogs` entry): e.g. "Last time: 60kg × 10, 60kg × 9, 65kg × 6" — shown as a reference line above the input fields.
- Input rows per set:
  - Strength: weight + reps (numeric inputs, +/- steppers for quick adjustment).
  - Cardio: duration (mm:ss) + distance.
  - Bodyweight: reps only (+ optional hold-time for planks etc.).
- "+ Add Set" button to log another set beyond the planned target.
- **Rest timer**: after saving a set, a countdown (defaulting to the exercise's configured `restSec`, editable) starts automatically with a sound + vibration alert at 0. Can be skipped/stopped early.
- Per-exercise **notes** text field (collapsed by default).
- Checkbox/checkmark to mark the exercise "done" (auto-suggested once all target sets are logged, but toggleable manually).
- Progress indicator (e.g. "3 of 6 exercises") at the top.

Session controls:
- **Finish Workout** button (enabled any time) — marks `status: completed`, sets `completedAt`, returns to Today screen with a summary.
- Workout-level notes field on the finish screen.
- If the app is closed mid-workout, the session is saved as `in_progress` in IndexedDB and automatically resumed next time the app opens (prompt: "Resume today's workout?"). After 24 hours an unfinished session auto-marks as `abandoned` rather than resuming indefinitely.

### 5.5 Reports tab
Three sections, selectable via sub-tabs or a scrollable single page:
1. **History/Calendar** — month calendar view; days with a completed workout are highlighted (color-coded by routine), rest days are neutral, missed scheduled days are flagged subtly. Tapping a day shows that day's session summary (read-only), with the ability to edit or delete a past log entry. A simple streak counter ("current streak: 5 days") sits above the calendar.
2. **Strength Progress** — pick an exercise from a dropdown; line chart (Chart.js) of top weight (or best set) per session over time, plus a simple reps trend. Only shown for strength/bodyweight exercises with ≥2 logged sessions.
3. **Body Weight** — form to add today's body-weight entry (date defaults to today, editable), list of past entries (editable/deletable), and a line chart of weight over time with a selectable range (last 1/3/6/12 months / all).

### 5.6 Settings tab
- Change PIN.
- Units toggle: kg ⟷ lbs (converts display only; stored values keep their original unit per entry so historical data isn't silently altered — see 5.6.1).
- Exercise Library management: view/add/edit/delete exercises (built-in ones can be hidden but not deleted, to avoid breaking existing logs that reference them; custom ones can be freely deleted if unused).
- **Backup & Restore**:
  - "Export Data" — serializes all IndexedDB stores to a single JSON file and triggers a browser download (e.g. `ironlog-backup-2026-11-14.json`).
  - "Import Data" — file picker to restore from a previously exported JSON file, with a confirmation warning that it overwrites current data.
- About: app version, a short note that data is stored only on this device.

#### 5.6.1 Units handling
Each weight value is stored with the unit it was entered in. The units *setting* only controls what unit new entries default to and how existing values are *displayed* (converted on the fly for display, e.g. kg→lbs using 1 kg = 2.20462 lbs), so switching the setting never mutates historical data.

### 5.7 Offline & Installability (PWA mechanics)
- `manifest.json` defines: app name "IronLog", short name, start URL, `display: standalone`, theme/background colors (dark theme, see 5.8), and icon set (192×192, 512×512, maskable).
- A Service Worker (`sw.js`) pre-caches all static assets (HTML/CSS/JS/icons/Chart.js/idb library) on install, so the app loads and fully functions with no network connection after the first visit. Uses a cache-first strategy with a version-based cache name so updates to the app's code get picked up on next load.
- On iOS Safari: user taps Share → "Add to Home Screen". On Android Chrome: browser shows an automatic "Install app" banner/prompt, or user taps the menu → "Install app". No app-store listing involved either way.
- Because all data lives in IndexedDB, there is no login/network round-trip required to use the app offline — only the very first load needs network access (or the app pre-installed) to fetch the files.

### 5.8 Visual Design
- Dark theme by default: near-black background (`#121212`), bold accent color (orange, `#ff6b35`, or similar) for buttons/highlights/active nav items, high-contrast white/light-gray text for readability under gym lighting.
- Large tap targets and big readable numbers for weight/reps input (optimized for sweaty-handed, quick glance use mid-workout).
- Mobile-first single-column layouts; bottom nav bar fixed for thumb reach.
- App name: **IronLog**. Icon: simple flat barbell/dumbbell glyph on the dark/orange theme, generated as a basic SVG/PNG set (192px/512px) — easy to swap out later if you want a custom design.

---

## 6. File Structure

```
GymApp/
├── index.html              # App shell (single-page app, screens toggled via JS)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (caching, offline)
├── css/
│   └── styles.css          # All styling (dark theme, layout, components)
├── js/
│   ├── app.js              # App init, navigation/routing between screens
│   ├── db.js                # IndexedDB setup + CRUD helpers (wraps idb library)
│   ├── auth.js              # PIN setup/unlock/change logic (SubtleCrypto hashing)
│   ├── schedule.js          # Schedule tab logic
│   ├── routines.js          # Routine/exercise-library CRUD logic
│   ├── workout.js           # Live Workout screen logic, rest timer
│   ├── reports.js           # Calendar, charts, body-weight log logic
│   ├── settings.js          # Settings tab logic, export/import
│   └── seedData.js          # Built-in starter exercise list
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable.png
├── vendor/                  # Locally vendored copies of idb + Chart.js (so offline install doesn't depend on a live CDN)
│   ├── idb.js
│   └── chart.umd.js
└── SPEC.md                 # This document
```
No `package.json` / `node_modules` needed — everything runs by opening `index.html` through a static file server.

---

## 7. Edge Cases Covered

| Scenario | Behavior |
|---|---|
| App closed mid-workout | Session persists as `in_progress`; prompted to resume on next open; auto-abandoned after 24h. |
| Workout on a "Rest" day | Allowed — Today screen lets you pick any routine or start ad-hoc regardless of schedule. |
| Editing/deleting a past log | Allowed from the Reports → History calendar day view. |
| Deleting a routine still referenced by past sessions | Past sessions keep a `routineName` snapshot, so history stays readable even if the routine is later renamed/deleted. Schedule days pointing to a deleted routine fall back to "Rest" with a one-time warning. |
| Deleting a built-in exercise used in logs | Built-in exercises can be hidden from pickers but not hard-deleted, preserving log integrity. |
| Switching kg/lbs | Only affects display conversion and new-entry defaults; stored values keep original units (section 5.6.1). |
| Forgotten PIN | No server-side recovery (no accounts). Settings documents a manual recovery: clearing the site's storage via browser settings resets the app (and erases local data) — strongly recommend exporting a backup periodically. |
| Multiple workouts same day | Supported — Today screen allows logging another session even after one is completed that day. |
| No network / airplane mode | Fully functional after first install, per Service Worker caching (5.7). |
| First-ever launch | Seeds built-in exercises, prompts PIN setup, prompts initial schedule setup (can skip and configure later; Today screen just shows "Rest day / no schedule yet" with ad-hoc start still available). |

---

## 8. Build & Deployment Plan

### 8.1 Development
No build tooling required. Recommended beginner workflow:
1. Install [VS Code](https://code.visualstudio.com/) with the "Live Server" extension.
2. Open the `GymApp` folder, right-click `index.html` → "Open with Live Server" to preview with auto-reload at `http://localhost:5500`.
3. Service workers require HTTPS *or* `localhost` — Live Server's `localhost` origin satisfies this for local testing.

### 8.2 Testing on your phone before deploying
- While developing, you can test on your phone over the same Wi-Fi network using your computer's local IP (e.g. `http://192.168.1.x:5500`) — note Service Worker install prompts may not fully work over plain HTTP on some mobile browsers, so final install testing should happen on the deployed HTTPS GitHub Pages URL (8.3).

### 8.3 Deployment (GitHub Pages)
1. Push this repo to GitHub (public or private repo both work with Pages).
2. Repo → Settings → Pages → Source: deploy from the `main` branch, root folder.
3. GitHub provides a URL like `https://<username>.github.io/GymApp/`.
4. Visit that URL on your phone (Safari on iOS, Chrome on Android) → use "Add to Home Screen" / the install prompt.
5. Any future `git push` to `main` auto-updates the live site; the Service Worker's versioned cache ensures your phone picks up the new version next time it's opened (with a brief "Update available, refresh to apply" notice).

### 8.4 Recovery / Reset
If the PIN is forgotten or data becomes corrupted: on the phone, go to browser settings → Site settings → find the GitHub Pages site → "Clear data/storage". This wipes IronLog's local data and PIN, letting you start fresh (hence the strong recommendation to use Export/Backup (5.6) periodically, e.g. monthly).

---

## 9. Future Enhancements (explicitly out of scope for v1, parking lot)
- Multi-device sync via a backend (Firebase/Supabase) if you ever want to check progress from a second device.
- Volume totals & automatic Personal Record (PR) detection/celebration.
- Circuit/HIIT workout types with round timers (AMRAP/EMOM).
- Biometric unlock (WebAuthn) instead of/alongside PIN.
- Light theme / auto theme switching.
- Supersets (grouping two exercises back-to-back with shared rest).
- Photo progress log alongside body-weight entries.

---

## 10. Summary of Key Decisions (from interview)

| Decision | Choice |
|---|---|
| Users | Single user |
| Data storage/sync | Local only (IndexedDB), no cloud |
| Login | Simple local PIN, hashed, no account system |
| Workout types | Strength, Cardio, Bodyweight (no circuits/rounds) |
| Exercise library | Built-in starter list + custom additions |
| Schedule style | Fixed by day of week, overridable any day |
| Live workout aids | Last-time reference, rest timer, checkmarks, notes |
| Body weight tracking | Yes, separate log + trend chart |
| Units | User-configurable (kg/lbs) in Settings |
| Reports | History/calendar, per-exercise strength chart, body-weight chart |
| Tech stack | Vanilla HTML/CSS/JS, no framework, no build tools |
| Hosting | GitHub Pages |
| Backup | Manual JSON export/import |
| Theme | Dark, gym-style, orange accent |
| App name | IronLog |
