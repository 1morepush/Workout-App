# TRAIN — Workout Tracker PWA

A mobile-first progressive web app for tracking gym workouts, meals, and training history — with an AI coach and cross-device sync via GitHub Gist. Built as a single HTML file with no backend, no build step, no dependencies.

**[Launch App →](https://1morepush.github.io/Workout-App/)**

---

## What It Does

Four tabs, all stored in `localStorage` and optionally synced to a GitHub Gist:

### 🏋️ Train
- **Day-based workout plan** — each day has its own exercises (built around a RECOMP 18-month plan)
- **Set tracker** — tap to log sets and reps as you complete them; visual progress bar shows completed vs. planned
- **Rest timer** — starts automatically after logging a set; flashes when rest is over
- **Add / reset exercises** — FAB buttons to add a custom exercise or reset the day
- **Workout complete banner** — fires when all exercises are done

### 🥗 Meal
- **Daily meal plan** — pre-defined meals with items, kcal, and protein per meal
- **Toggle views** — switch between Today's plan and a full macro summary

### 📊 History
- **Workout log** — scrollable history of every session stored locally
- **Strength charts** — per-exercise volume/rep history over time
- **Gist sync status** — shows last sync time and lets you trigger a manual sync

### 🤖 Coach
- **AI personal trainer** — powered by Groq API (free tier)
- **Knows your workout** — system prompt includes your current plan, so the coach can give contextual advice
- **Persistent chat** — conversation history saved in `localStorage`
- **Setup flow** — paste your Groq API key once; stored locally, never sent anywhere except Groq

---

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

**Option C — One-click launcher (serves via Python HTTP):**

```bash
chmod +x start.sh && ./start.sh
```

---

## Install as a PWA (Recommended)

**iOS (Safari):** Share → "Add to Home Screen" → Add

**Android (Chrome):** Three-dot menu → "Add to Home Screen" / "Install App"

Once installed, runs full-screen with no browser UI. Works offline after first load.

---

## GitHub Gist Sync (Optional)

Sync your workout history across devices without a backend.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**
2. Grant only the `gist` scope
3. In the app → History tab → paste your token and a Gist ID (or create a new one)
4. Your data syncs automatically every session

Your token is stored in `localStorage` and only ever sent to `api.github.com`.

---

## AI Coach Setup (Optional)

1. Get a free API key at [console.groq.com](https://console.groq.com)
2. In the app → Coach tab → paste your key and tap **Activate Coach**
3. The key is saved in `localStorage` — never leaves your device except when calling Groq

---

## Customizing Workouts

The workout plan and meal plan are defined as data arrays inline in `index.html`. Edit them to change movements, sets, reps, meals, and macros.

---

## Tech Stack

| What | How |
|------|-----|
| Architecture | Single HTML file — zero build step, zero dependencies |
| Styling | CSS custom properties, dark warm theme (gold `#C9A84C` + rust `#C8552A`) |
| Typography | Bebas Neue (headings) + Outfit (body) + DM Mono (data labels) |
| PWA | Service worker (cache-first), `apple-mobile-web-app-capable` meta tags |
| Storage | `localStorage` for all data persistence |
| Sync | GitHub Gist API (optional, requires personal access token) |
| AI Coach | Groq API — `openai/v1/chat/completions` compatible (optional, free tier) |
| Deployment | GitHub Pages (auto-deploys on push to `main`) |

---

## File Structure

```
Workout-App/
├── index.html    # Entire app — HTML, CSS, JS, and service worker in one file
└── start.sh      # Launches a local HTTP server (needed for service worker)
```
