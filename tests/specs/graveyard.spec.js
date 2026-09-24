// v1.9.1: workouts past midnight, backups that can't be overwritten by accident,
// weigh-ins that are really today's, and advice that reads past a deload.

const { test, expect } = require('./fixtures');

const dot = (page, card, i) => page.locator('[data-card]').nth(card).locator('.dot').nth(i);
const bench = page => page.evaluate(() => { const x = workouts[1].exercises[0]; return { id: x.id, name: x.name, sets: x.sets, reps: x.reps }; });

test.describe('past midnight', () => {
  test('a workout that crosses midnight stays on the day it started', async ({ app, page }) => {
    await app.open({ time: '2026-06-15T23:50:00-04:00' });
    const b = await bench(page);
    for (let i = 0; i < 3; i++) await dot(page, 0, i).click();
    await page.clock.setSystemTime(new Date('2026-06-16T00:05:00-04:00'));
    await page.clock.runFor(61_000);   // the once-a-minute day check runs
    await expect(page.locator('#hdrDatePill')).toHaveText('MON, JUN 15');
    await dot(page, 0, 3).click();
    expect(await app.storage('wt-done')).toEqual({ '2026-06-15': { [b.id]: 4 } });
    expect(Object.keys(await app.storage('wt-history'))).toEqual(['2026-06-15']);
    expect(await page.evaluate(() => timer.active)).toBe(true);   // still the workout in progress
  });

  test('reopened the next morning, Train is on the new day and the Coach is told so', async ({ app, page }) => {
    await app.open({ time: '2026-06-15T21:00:00-04:00' });
    await dot(page, 0, 0).click();
    await page.clock.setSystemTime(new Date('2026-06-16T07:00:00-04:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#heroLabel')).toHaveText('TODAY');
    await expect(page.locator('#heroDayType')).toHaveText('PULL DAY');
    await expect(page.locator('#hdrDatePill')).toHaveText('TUE, JUN 16');
    await dot(page, 0, 0).click();
    const h = await app.storage('wt-history');
    expect(Object.keys(h).sort()).toEqual(['2026-06-15', '2026-06-16']);
    expect([h['2026-06-16'].dayIdx, h['2026-06-16'].type]).toEqual([2, 'pull']);
    expect(h['2026-06-15'].type).toBe('push');
    const prompt = await page.evaluate(() => buildCoachSystemPrompt());
    expect(prompt).toContain('TODAY (2026-06-16)');
    expect(prompt).toContain('TUESDAY — PULL DAY');
  });

  test('ticking a recovery item on a rest day is saved', async ({ app, page }) => {
    await app.open({ time: '2026-06-14T10:00:00-04:00' });   // Sunday
    await page.locator('[data-rec]').first().click();
    const h = await app.storage('wt-history');
    expect(h['2026-06-14'].type).toBe('rest');
    expect(h['2026-06-14'].recDone).toHaveLength(1);
  });

  test('a date first saved as the other kind of day takes a set instead of crashing', async ({ app, page }) => {
    const seed = { '2026-06-15': { date: '2026-06-15', dayIdx: 1, type: 'rest', label: 'Full Rest', recDone: [] } };
    await app.open({ seed: { 'wt-history': seed } });
    const b = await bench(page);
    await dot(page, 0, 0).click();
    const e = (await app.storage('wt-history'))['2026-06-15'];
    expect(e.type).toBe('push');
    expect(e.exercises.find(x => x.id === b.id).log).toHaveLength(1);
  });
});

test.describe('the week after a deload', () => {
  const session = (b, date, lbs, reps, extra = {}) => ({ date, dayIdx: 1, type: 'push', label: 'Push Day', dayName: 'MONDAY', ...extra,
    exercises: [{ id: b.id, name: b.name, sets: b.sets, reps: b.reps, weight: lbs + ' lbs', log: reps.map(r => ({ reps: r, lbs })) }] });
  const advice = (page, hist) => page.evaluate(h => {
    const x = workouts[1].exercises[0];
    return progressionFor(x, lastSessionFor(h, x, '2026-06-15'), 5);
  }, hist);

  test('the Next line reads the last working session, not the deload', async ({ app, page }) => {
    await app.open({ seed: { 'wt-calc-week': 5 } });
    const b = await bench(page);
    const top = Array(b.sets).fill(+b.reps.split('-').pop());
    const p = await advice(page, {
      '2026-06-01': session(b, '2026-06-01', 100, top, { week: 3, deload: false }),
      '2026-06-08': session(b, '2026-06-08', 65, top, { week: 4, deload: true }),
    });
    expect([p.verdict, p.lbs, p.next]).toEqual(['add', 100, 105]);
    expect(p.text).toContain('Last time (Jun 1, before the deload)');
  });

  test('sessions from before v1.9.1 are recognised as deloads by their weight', async ({ app, page }) => {
    await app.open({ seed: { 'wt-calc-week': 5 } });
    const b = await bench(page);
    const top = Array(b.sets).fill(+b.reps.split('-').pop());
    const deload = await advice(page, {
      '2026-06-01': session(b, '2026-06-01', 100, top),
      '2026-06-08': session(b, '2026-06-08', 65, top),
    });
    expect([deload.lbs, deload.next]).toEqual([100, 105]);
    // A small drop is a lighter day, not a deload: it is read as it is.
    const lighter = await advice(page, {
      '2026-06-01': session(b, '2026-06-01', 100, top),
      '2026-06-08': session(b, '2026-06-08', 95, top),
    });
    expect([lighter.lbs, lighter.next]).toEqual([95, 100]);
    expect(lighter.text).not.toContain('deload');
  });

  test('a new session records the plan week it was logged in', async ({ app, page }) => {
    await app.open({ seed: { 'wt-calc-week': 4 } });
    await dot(page, 0, 0).click();
    const e = (await app.storage('wt-history'))['2026-06-15'];
    expect([e.week, e.deload]).toEqual([4, true]);
  });
});

test.describe('saving the body sheet', () => {
  const openBody = async (app, page, seed) => {
    await app.open({ seed });
    await app.tab('intake');
    await page.click('[data-act="body"]');
  };

  test('changing only the pace doesn’t log an old weight as today’s', async ({ app, page }) => {
    await openBody(app, page, { 'wt-body': { bodyFat: 24 }, 'wt-weighins': { '2026-06-01': 190 } });
    await expect(page.locator('[data-bf="lbs"]')).toHaveValue('190');
    await expect(page.locator('#intakeSheet')).toContainText('That’s your last weigh-in');
    await page.locator('.in-seg-btn[data-key="pace"]:not(.on)').first().click();
    await page.click('[data-sa="body-save"]');
    expect(await app.storage('wt-weighins')).toEqual({ '2026-06-01': 190 });
  });

  test('a deleted reading doesn’t come back dated today', async ({ app, page }) => {
    await openBody(app, page, { 'wt-body': { bodyFat: 24 }, 'wt-weighins': { '2026-06-01': 190, '2026-06-08': 198.2 } });
    await expect(page.locator('[data-bf="lbs"]')).toHaveValue('198.2');
    await page.click('[data-sa="wi-del"][data-date="2026-06-08"]');
    await expect(page.locator('[data-bf="lbs"]')).toHaveValue('190');
    await page.click('[data-sa="body-save"]');
    expect(await app.storage('wt-weighins')).toEqual({ '2026-06-01': 190 });
  });

  test('a weight you type is logged as today’s', async ({ app, page }) => {
    await openBody(app, page, { 'wt-body': { bodyFat: 24 }, 'wt-weighins': { '2026-06-01': 190 } });
    await page.fill('[data-bf="lbs"]', '188.4');
    await page.click('[data-sa="body-save"]');
    expect(await app.storage('wt-weighins')).toEqual({ '2026-06-01': 190, '2026-06-15': 188.4 });
  });
});

// A fake GitHub gists API: remembers what was sent, and can hold a read open.
async function fakeGitHub(page, gists = {}) {
  const gh = { gists, calls: [], n: 0, holdGet: null };
  const reply = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, m = req.method();
    gh.calls.push(m + ' ' + path);
    const stamp = () => '2026-06-15T14:' + String(++gh.n).padStart(2, '0') + ':00Z';
    if (path === '/gists' && m === 'GET') {
      return reply(route, 200, Object.entries(gh.gists).map(([id, g]) => ({ id, updated_at: g.updated_at, files: { 'workout-data.json': {} } })));
    }
    if (path === '/gists' && m === 'POST') {
      const id = 'new' + (gh.n + 1), content = JSON.parse(req.postData()).files['workout-data.json'].content;
      gh.gists[id] = { updated_at: stamp(), content };
      return reply(route, 201, { id, updated_at: gh.gists[id].updated_at });
    }
    const id = path.split('/')[2], g = gh.gists[id];
    if (!g) return reply(route, 404, { message: 'Not Found' });
    if (m === 'GET') {
      if (gh.holdGet) await gh.holdGet;
      return reply(route, 200, { id, updated_at: g.updated_at, files: { 'workout-data.json': { content: g.content } } });
    }
    if (m === 'PATCH') {
      g.content = JSON.parse(req.postData()).files['workout-data.json'].content;
      g.updated_at = stamp();
      return reply(route, 200, { id, updated_at: g.updated_at });
    }
    return reply(route, 405, { message: 'unexpected' });
  });
  return gh;
}

const BACKUP_HIST = { '2026-06-12': { date: '2026-06-12', dayIdx: 5, type: 'push', label: 'Push Day', dayName: 'FRIDAY',
  exercises: [{ id: 'f1', name: 'Barbell Bench Press', sets: 4, reps: '5-8', weight: '100 lbs', log: [{ reps: 8, lbs: 100 }] }] } };
const BACKUP = JSON.stringify({ 'wt-history': BACKUP_HIST });
const CONNECTED = { 'wt-gh-token': 'ghp_test', 'wt-gh-gist-id': 'g1', 'wt-gh-remote-at': 'T0' };
const patches = gh => gh.calls.filter(c => c.startsWith('PATCH'));

test.describe('GitHub backup', () => {
  test('a cancelled first-time Restore leaves the phone unconnected, so nothing is backed over it', async ({ app, page }) => {
    await app.open();
    const gh = await fakeGitHub(page, { g1: { updated_at: 'T0', content: BACKUP } });
    await app.tab('history');
    await page.fill('.gist-inp', 'ghp_test');
    await page.evaluate(() => { window.confirm = () => false; });
    await page.getByRole('button', { name: 'RESTORE', exact: true }).click();
    await expect.poll(() => gh.calls).toContain('GET /gists');
    expect(await app.storage('wt-gh-token')).toBeNull();
    expect(await app.storage('wt-gh-gist-id')).toBeNull();
    await app.tab('train');
    await dot(page, 0, 0).click();
    await page.clock.runFor(5000);
    expect(patches(gh)).toEqual([]);
  });

  test('a Restore that fails leaves the phone unconnected', async ({ app, page }) => {
    await app.open();
    await fakeGitHub(page, { g1: { updated_at: 'T0', content: '{}' } });
    await app.tab('history');
    await page.fill('.gist-inp', 'ghp_test');
    await page.getByRole('button', { name: 'RESTORE', exact: true }).click();
    await expect(page.locator('#syncMsg')).toHaveText('✗ Restore failed: That backup is empty');
    expect(await app.storage('wt-gh-token')).toBeNull();
  });

  test('a first-time Restore that works connects the phone', async ({ app, page }) => {
    await app.open();
    await fakeGitHub(page, { g1: { updated_at: 'T0', content: BACKUP } });
    await app.tab('history');
    await page.fill('.gist-inp', 'ghp_test');
    await page.getByRole('button', { name: 'RESTORE', exact: true }).click();
    await expect(page.locator('#syncMsg')).toHaveText('✓ Restored from GitHub');
    expect(await app.storage('wt-gh-token')).toBe('ghp_test');
    expect(await app.storage('wt-gh-gist-id')).toBe('g1');
    expect(Object.keys(await app.storage('wt-history'))).toEqual(['2026-06-12']);
  });

  test('a backup that was about to be sent can’t land on top of a restore', async ({ app, page }) => {
    await app.open({ seed: CONNECTED });
    const gh = await fakeGitHub(page, { g1: { updated_at: 'T0', content: BACKUP } });
    await dot(page, 0, 0).click();   // schedules a backup of this phone's data in 4 s
    await app.tab('history');
    let release; gh.holdGet = new Promise(r => { release = r; });
    await page.getByRole('button', { name: 'RESTORE', exact: true }).click();
    await expect.poll(() => gh.calls).toContain('GET /gists/g1');
    await page.clock.runFor(5000);   // the scheduled backup's moment passes while the restore is reading
    release();
    await expect(page.locator('#syncMsg')).toHaveText('✓ Restored from GitHub');
    await page.clock.runFor(5000);
    expect(patches(gh)).toEqual([]);
    expect(JSON.parse(gh.gists.g1.content)['wt-history']).toEqual(BACKUP_HIST);
    expect(Object.keys(await app.storage('wt-history'))).toEqual(['2026-06-12']);
  });

  test('a backup another device changed isn’t replaced without asking', async ({ app, page }) => {
    await app.open({ seed: CONNECTED });
    const gh = await fakeGitHub(page, { g1: { updated_at: 'T5', content: BACKUP } });
    await dot(page, 0, 0).click();
    await page.clock.runFor(4100);
    await expect(page.locator('#syncMsg')).toContainText('another device changed the backup');
    expect(patches(gh)).toEqual([]);
    // Sync Now asks, and replaces it only on OK.
    await app.tab('history');
    await page.getByRole('button', { name: 'SYNC NOW' }).click();
    await expect.poll(() => patches(gh)).toEqual(['PATCH /gists/g1']);
    expect(await app.storage('wt-gh-remote-at')).toBe(gh.gists.g1.updated_at);
  });

  test('an unchanged backup is updated as before, and the new version remembered', async ({ app, page }) => {
    await app.open({ seed: CONNECTED });
    const gh = await fakeGitHub(page, { g1: { updated_at: 'T0', content: BACKUP } });
    await dot(page, 0, 0).click();
    await page.clock.runFor(4100);
    await expect.poll(() => patches(gh)).toEqual(['PATCH /gists/g1']);
    await expect(page.locator('#syncMsg')).toHaveText('✓ Backed up to GitHub');
    expect(await app.storage('wt-gh-remote-at')).toBe(gh.gists.g1.updated_at);
  });

  test('Connect & Sync uses the backup you already have, after asking', async ({ app, page }) => {
    await app.open();
    const gh = await fakeGitHub(page, { g1: { updated_at: '2026-06-01T10:00:00Z', content: BACKUP } });
    await app.tab('history');
    await page.fill('.gist-inp', 'ghp_test');
    await page.getByRole('button', { name: 'CONNECT & SYNC' }).click();
    await expect(page.locator('#syncMsg')).toHaveText('✓ Backed up to GitHub');
    expect(gh.calls.filter(c => c.startsWith('POST'))).toEqual([]);
    expect(patches(gh)).toEqual(['PATCH /gists/g1']);
    expect(await app.storage('wt-gh-gist-id')).toBe('g1');
  });

  test('a token with no backup behind it shows the setup card, not “Connected”', async ({ app, page }) => {
    await app.open({ seed: { 'wt-gh-token': 'ghp_test' } });
    await app.tab('history');
    await expect(page.getByRole('button', { name: 'CONNECT & SYNC' })).toBeVisible();
    await expect(page.locator('#gistSection')).not.toContainText('Connected');
  });

  test('Connect & Sync tapped twice makes one backup, not two', async ({ app, page }) => {
    await app.open();
    const gh = await fakeGitHub(page);
    await app.tab('history');
    await page.fill('.gist-inp', 'ghp_test');
    await page.evaluate(() => { const b = document.querySelector('.gist-save-btn'); b.click(); b.click(); });
    await expect(page.locator('#syncMsg')).toHaveText('✓ Backed up to GitHub');
    expect(gh.calls.filter(c => c.startsWith('POST'))).toEqual(['POST /gists']);
    expect(Object.keys(gh.gists)).toHaveLength(1);
  });
});
