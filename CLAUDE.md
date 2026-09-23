# Working in this repository

TRAIN is a personal workout, meal and intake tracker. The whole app is one file,
`index.html` (HTML, CSS, JS and the service worker), with no build step and no
dependencies. GitHub Pages deploys `main` automatically, so merging is shipping.

## The rule the app is built around

**The AI reads and explains. The plan's rules decide.**

A bad weight jump or a skipped deload can hurt someone, and a nutrition number
that is a guess must never look like a fact. So:

- Every suggested weight comes from `planFor()` (section `PLAN RULES`), which
  returns the number *and* the sentence explaining it. Nothing else computes a
  weight. The calculator, the Train cards and the Coach all call it.
- The Coach is told the plan's targets and reasons and must explain them, not
  invent numbers. It only talks; it has no path to change data.
- Intake targets come from `bodyPlanFor()` (weight, body fat, goal) or, without
  a weight, from `MEAL_PLAN`. Same pattern: every number with its reason, and a
  number the user typed wins until they reset it.
- Intake flags come from fixed thresholds (FDA daily values, 20% = "high"), not
  from the model. The model only reads labels and estimates meals, and every
  result goes through a review sheet before it is saved, tagged `LABEL`/`EST.`.

If a feature involves a judgement about training or food, it belongs in plain,
testable code — not in a prompt.

## Before finishing any change a user could notice

Add a release to `RELEASES` (top of the `STATE + STORAGE` section). That is the
whole version bump: `APP_VERSION` is read from the top entry. The rules for
which digit moves are in the comment above `RELEASES`, and that comment is the
authority. In short: new capability → minor, repair of shipped behaviour →
patch, nothing noticeable → no entry. A fix that ships with a feature rides in
that feature's release. Write the notes as the person holding the phone would
say them, and give the release a gym-joke name.

Say in your reply which digit moved and why.

## Things that have already gone wrong here

- **Dates.** Never build a date key with `toISOString()` — it is UTC, and
  evening workouts were filed under tomorrow. Use `isoLocal()`. The date shown
  and the date stored for a day must come from the same function
  (`viewDayDate()`).
- **Two copies of the same fact.** Logged sets live in `wt-done` *and* a
  snapshot in `wt-history`. Anything that changes one (reset, delete, edit) must
  update the other, or History reports sets that no longer exist.
- **New storage keys** must be added to `SYNC_KEYS`, or they are silently left
  out of the Gist backup. Per-device state (e.g. `wt-seen-version`) stays out on
  purpose.
- **Names must match.** Train cards and the calculator refer to exercises by
  name. When they differ, add the card's name to the calculator entry's `also`
  list — don't rename `name`, which keys the user's saved start weights.
- **Groq retires models.** `llama-3.1-8b-instant` was shut down on 2026-08-16
  and the Coach failed silently for weeks. Model IDs live in `COACH_MODEL` and
  `INTAKE_MODEL`; check https://console.groq.com/docs/deprecations before
  changing or relying on them. `gpt-oss` models spend reasoning tokens from the
  completion budget — keep headroom.
- **`--day-color` is rust on leg days.** Never use it for warnings; the Intake
  tab pins its own semantic colours for that reason.
- **Model output is untrusted.** Render it with `textContent`, never
  `innerHTML`.
- **Floating buttons.** The add/reset buttons reach ~185px up from the bottom.
  `#main` has matching bottom padding so the last card can scroll clear.

## Verifying before you push

Browser tests live in `tests/` (Playwright; dev-only — the app itself still has
no dependencies). GitHub runs them on every PR and every push to `main`.

```sh
cd tests && npm ci && npx playwright test
```

In Claude Code on the web, don't run `playwright install`; point at the
preinstalled browser instead (check the build number with `ls /opt/pw-browsers`):

```sh
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test
```

- Every test opens the app at a fixed moment (Monday 15 June 2026, New York) on
  a 390×844 phone, and fails if the page throws. See `tests/specs/fixtures.js`.
- There is no Groq key in the sandbox or CI. Tests fake `api.groq.com`, assert
  on what the app sends, and script the replies. Say plainly that the live
  model was not exercised.
- `specs/guards.spec.js` turns the list above into checks. When one fails, fix
  the code. Only edit a guard's list (e.g. `DEVICE_ONLY`, `RETIRED`) when the
  code is right and the list is out of date, and write down why.
- No retries: a test that fails once has found something.
- A new feature comes with tests, and a bug fix with a test that fails without
  the fix. Before trusting a new test, break the code it covers and watch it fail.
- Tests change nothing a user can see, so they get no release entry.
- Still look at screenshots of anything you changed visually. Several layout bugs
  here were only visible that way.

## Workflow

Open PRs as drafts. The owner merges; don't merge without being asked.
