// Guards: the "things that have already gone wrong here" list from CLAUDE.md,
// turned into checks that fail on their own instead of relying on memory.

const { test, expect, source } = require('./fixtures');

test('the app script parses', () => {
  const scripts = [...source().matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  expect(scripts.length).toBeGreaterThan(0);
  for (const [, code] of scripts) expect(() => new Function(code)).not.toThrow();
});

test('no date key is built with toISOString (it is UTC — evenings land on tomorrow)', () => {
  const offenders = source().split('\n')
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter(({ text }) => /toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/.test(text));
  expect(offenders, 'use isoLocal() for YYYY-MM-DD keys').toEqual([]);
});

// Keys that must stay on this device: credentials, sync bookkeeping, per-phone UI state.
const DEVICE_ONLY = {
  'wt-coach-key':     'Groq API key — a credential',
  'wt-gh-token':      'GitHub token — a credential',
  'wt-gh-gist-id':    'which Gist this phone syncs to',
  'wt-gh-last-sync':  'this phone’s last sync time',
  'wt-gh-remote-at':  'the backup’s version this phone last saw — how it spots another device’s changes',
  'wt-seen-version':  'whether this phone has seen the newest release notes',
  'wt-coach-msgs':    'legacy single-chat store, read once for migration',
  'wt-datefix-dismissed': 'this phone chose to leave pre-v1.3 misdated sessions alone',
};

test('every storage key is either backed up or deliberately device-only', async ({ app, page }) => {
  await app.open();
  const synced = await page.evaluate(() => SYNC_KEYS);
  // Only strings used as storage keys — not CSS classes like .wt-chip that share the prefix.
  const src = source();
  const used = [...new Set([
    ...src.matchAll(/(?:lsGet|lsSet|getItem|setItem|removeItem)\(\s*['"](wt-[a-z0-9-]+)['"]/g),
    // any constant holding a key — not just ones named *STORE/*KEY (DATEFIX_DISMISSED slipped past that)
    ...src.matchAll(/const\s+\w+\s*=\s*['"](wt-[a-z0-9-]+)['"]/g),
  ].map(m => m[1]))];
  expect(used.length, 'key detection found almost nothing — the pattern is broken').toBeGreaterThan(10);
  const unaccounted = used.filter(k => !synced.includes(k) && !(k in DEVICE_ONLY));
  expect(unaccounted, 'new key: add it to SYNC_KEYS, or to DEVICE_ONLY here with a reason').toEqual([]);
  const both = synced.filter(k => k in DEVICE_ONLY);
  expect(both, 'a device-only key must not be synced').toEqual([]);
});

test('logged sets have one writer: commitHistory() is the only code that saves them', () => {
  // Two stores that each got written on their own is how History edits used to be
  // undone and deleted sessions came back. Everything else must go through it.
  const src = source();
  expect(src.match(/lsSet\(\s*['"]wt-history['"]/g) || [], 'wt-history writers').toHaveLength(1);
  expect(src.match(/lsSet\(\s*['"]wt-done['"]/g) || [], 'wt-done writers').toHaveLength(1);
  const body = src.slice(src.indexOf('function commitHistory('), src.indexOf('function sessionFor('));
  expect(body).toMatch(/lsSet\('wt-history'/);
  expect(body).toMatch(/lsSet\('wt-done'/);
});

test('Groq model ids are not ones Groq has already shut down', async ({ app, page }) => {
  // From console.groq.com/docs/deprecations. Extend when Groq retires more.
  const RETIRED = [
    'llama-3.1-8b-instant', 'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama-3.2-11b-vision-preview', 'llama-3.2-90b-vision-preview', 'qwen/qwen3-32b',
  ];
  await app.open();
  const models = await page.evaluate(() => ({ coach: COACH_MODEL, intake: INTAKE_MODEL }));
  expect(RETIRED).not.toContain(models.coach);
  expect(RETIRED).not.toContain(models.intake);
  expect(source()).not.toMatch(/model:\s*['"][^'"]+['"]/);   // ids live in the constants, nowhere else
});

test('every exercise on a Train card has a plan entry (names must match)', async ({ app, page }) => {
  await app.open();
  const missing = await page.evaluate(() =>
    [...new Set(defaultData().flatMap(d => (d.exercises || []).map(e => e.name)))].filter(n => !planExercise(n)));
  expect(missing, 'add the card’s name to that calculator entry’s `also` list').toEqual([]);
});

test('release notes: version comes from them, newest first, each one complete', async ({ app, page }) => {
  await app.open();
  const { version, releases } = await page.evaluate(() => ({ version: APP_VERSION, releases: RELEASES }));
  expect(version).toBe('v' + releases[0].version);
  const num = v => v.split('.').map(Number).concat([0, 0]).slice(0, 3);
  const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
  for (let i = 1; i < releases.length; i++) {
    expect(newer(releases[i - 1].version, releases[i].version), releases[i - 1].version + ' above ' + releases[i].version).toBe(true);
    expect(releases[i - 1].date >= releases[i].date).toBe(true);
  }
  for (const r of releases) {
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.name && r.headline).toBeTruthy();
    expect(r.changes.length).toBeGreaterThan(0);
  }
});
