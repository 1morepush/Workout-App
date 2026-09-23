# TRAIN — Workout Tracker PWA

A mobile-first progressive web app for tracking gym workouts, meals, and training history — with an AI coach and cross-device sync via GitHub Gist. Built as a single HTML file with no backend, no build step, no dependencies.

**[Launch App →](https://1morepush.github.io/Workout-App/)**

---

## What It Does

Five tabs, all stored in `localStorage` and optionally synced to a GitHub Gist:

### 🏋️ Train
- **Day-based workout plan** — each day has its own exercises (built around a RECOMP 18-month plan)
- **Set tracker** — tap to log sets and reps as you complete them; visual progress bar shows completed vs. planned
- **Plan targets, with the reason** — each lift shows this week's target from the 12-week plan and why: your start weight, the phase, the steps added, or what a deload is 65% of. Tap **Use** to take it
- **Rest timer** — starts automatically after logging a set; flashes when rest is over
- **Add / reset exercises** — FAB buttons to add a custom exercise or reset the day
- **Workout complete banner** — fires when all exercises are done

### 🥗 Meal
- **Daily meal plan** — pre-defined meals with items, kcal, and protein per meal
- **Toggle views** — switch between Today's plan and a full macro summary

### 🍽️ Intake
- **Scan a nutrition label** — snap a photo; the app reads the per-serving values and you set how many servings you had
- **Describe a meal** — type "double cheeseburger and large fries" and it estimates each food
- **Manual entry** — type the numbers yourself; works without an API key
- **Review before saving** — every AI result opens in an editable sheet, marked `LABEL` or `EST.`
- **Too much today** — flags any limit you've passed (sodium, added sugar, saturated fat, calories, carbs, fat), worst first, with the foods that put you over
- **Eat less of / avoid** — flags foods carrying 20%+ of a daily limit in one serving (the FDA's threshold for "high") and anything with trans fat
- **Targets from your body** — enter your weight (and body fat % if you know it) and calories and macros are set to reach a body-fat goal (15% by default): goal weight, a steady deficit, protein at 1 g per lb of goal weight. Each target says how it was worked out
- **Weigh-ins** — log your weight any day; the card shows your trend and roughly how many weeks to goal
- **Targets** — before a weight is entered they come from your meal plan; any number you set yourself wins
- **Back-log** — step to previous days to add something you forgot

### 📊 History
- **Workout log** — scrollable history of every session stored locally
- **Strength charts** — per-exercise volume/rep history over time
- **Gist sync status** — shows last sync time and lets you trigger a manual sync
- **What's new** — release notes for every version; a dot on the History tab means there's something you haven't seen

### 🤖 Coach
- **AI personal trainer** — powered by Groq API (free tier)
- **Explains your plan, doesn't override it** — it's given each lift's plan target and reason, and explains those rather than inventing its own numbers
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

The same key powers label scanning and meal estimates in the Intake tab. Models used: `openai/gpt-oss-20b` (Coach) and `qwen/qwen3.8-27b` (Intake, reads images). Groq retires models regularly — if a tab starts erroring, check [console.groq.com/docs/deprecations](https://console.groq.com/docs/deprecations) and update `COACH_MODEL` / `INTAKE_MODEL` in `index.html`.

---

## Customizing Workouts

The workout plan and meal plan are defined as data arrays inline in `index.html`. Edit them to change movements, sets, reps, meals, and macros.

---

## Running the Tests

Browser tests cover every tab: set logging and dates across timezones, plan targets for every lift and week, the rest timer, the Intake tab's scanning and flags, the Coach, and release notes. They run automatically on GitHub for every pull request. To run them yourself:

```bash
cd tests
npm ci
npx playwright install chromium   # first time only
npx playwright test
```

The AI is never called for real — tests fake Groq's responses — so no API key is needed.

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
| AI | Groq API — `openai/v1/chat/completions` compatible (optional, free tier) |
| Deployment | GitHub Pages (auto-deploys on push to `main`) |

---

## File Structure

```
Workout-App/
├── index.html    # Entire app — HTML, CSS, JS, and service worker in one file
├── CLAUDE.md     # How to work on this repo with Claude Code: the core rule, versioning, known pitfalls
├── start.sh      # Launches a local HTTP server (needed for service worker)
├── tests/        # Browser tests (Playwright) — dev-only, the app has no dependencies
└── .github/workflows/tests.yml   # Runs the tests on every pull request
```
