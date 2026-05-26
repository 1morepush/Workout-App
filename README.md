# TRAIN — Workout Tracker PWA

A minimal, mobile-first progressive web app for tracking gym workouts. Built as a single HTML file — no backend, no build step, no dependencies. Install it on your phone's home screen and use it like a native app.

**[Launch App →](https://1morepush.github.io/Workout-App/)**

---

## What It Does

- **Day-based workout plans** — each day of the week has its own workout
- **Exercise cards** — tap to log sets and reps as you complete them
- **Set tracker** — visual progress bar showing completed vs. planned sets
- **Rest timer** — tap the rest button after a set; counts down and flashes when rest is over
- **Workout complete banner** — fires when all exercises for the day are done
- **Offline-ready** — works with no internet after first load

## Quick Start

**Option A — Hosted (no setup needed):**

Open [https://1morepush.github.io/Workout-App/](https://1morepush.github.io/Workout-App/) in your phone's browser and tap "Add to Home Screen."

**Option B — Run locally:**

```bash
git clone https://github.com/1morepush/Workout-App.git
cd Workout-App
open index.html        # macOS
# or: start index.html # Windows
# or: xdg-open index.html # Linux
```

**Option C — One-click launcher:**

```bash
chmod +x start.sh && ./start.sh
```

## Install as a PWA (Recommended)

**iOS (Safari):**
1. Open the URL in Safari
2. Tap the Share button → "Add to Home Screen" → "Add"

**Android (Chrome):**
1. Open the URL in Chrome
2. Three-dot menu → "Add to Home Screen" or "Install App"

Once installed, runs full-screen with no browser UI — just like a native app.

## Customizing Workouts

The workout plan is defined inline in `index.html`. Edit the exercise data array to change movements, sets, and reps per day.

## Tech Stack

| What | How |
|------|-----|
| Architecture | Single HTML file — zero build step, zero dependencies |
| Styling | CSS custom properties, dark warm theme (gold `#C9A84C` + rust `#C8552A`) |
| Typography | Bebas Neue (headings) + Outfit (body) + DM Mono (data labels) |
| PWA | `apple-mobile-web-app-capable` meta tags, safe-area insets |
| Storage | `localStorage` for set completion persistence |
| Deployment | GitHub Pages (auto-deploys on push to `main`) |

## File Structure

```
Workout-App/
└── index.html    # Entire app — HTML, CSS, and JS in one file
```

---

## Branch Notes

**`claude/add-exercises-previous-day-HJyHI`** — Experimental branch adding the ability to log sets on previous days, not just today.
