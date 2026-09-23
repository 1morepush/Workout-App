// v1.8: correcting weigh-ins, and moving sessions misfiled by the pre-v1.3 UTC bug.

const { test, expect } = require('./fixtures');

test.describe('past weigh-ins', () => {
  const W = { '2026-06-01': 190.4, '2026-06-03': 189.8, '2026-06-05': 910, '2026-06-08': 189.2, '2026-06-15': 188.6 };

  test('a reading far from its neighbours is flagged, and only that one', async ({ app, page }) => {
    await app.open();
    const odd = await page.evaluate(w => [...weighInOutliers(w)], W);
    expect(odd).toEqual(['2026-06-05']);
  });

  test('fix a typo, delete a reading, save', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 24 }, 'wt-weighins': W } });
    await app.tab('intake');
    await page.click('[data-act="body"]');
    const row = page.locator('.in-wi-row', { has: page.locator('[data-wi="2026-06-05"]') });
    await expect(row).toHaveClass(/is-odd/);
    await expect(row).toContainText('Looks off?');
    await expect(page.locator('[data-bf="lbs"]')).toHaveValue('188.6');           // today's, not in the list
    await expect(page.locator('[data-wi="2026-06-15"]')).toHaveCount(0);
    await page.fill('[data-wi="2026-06-05"]', '191.0');
    await page.click('[data-sa="wi-del"][data-date="2026-06-03"]');
    await page.click('[data-sa="body-save"]');
    expect(await app.storage('wt-weighins')).toEqual({ '2026-06-01': 190.4, '2026-06-05': 191, '2026-06-08': 189.2, '2026-06-15': 188.6 });
  });

  test('cancel throws away edits', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 24 }, 'wt-weighins': W } });
    await app.tab('intake');
    await page.click('[data-act="body"]');
    await page.click('[data-sa="wi-del"][data-date="2026-06-03"]');
    await page.click('[data-sa="cancel"]');
    expect(await app.storage('wt-weighins')).toEqual(W);
  });

  test('an impossible past weigh-in blocks saving, naming the day', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 24 }, 'wt-weighins': W } });
    await app.tab('intake');
    await page.click('[data-act="body"]');
    await page.fill('[data-wi="2026-06-05"]', '9');
    await page.click('[data-sa="body-save"]');
    await expect(page.locator('#intakeSheet .in-err')).toHaveText('The weigh-in on Jun 5 should be between 70 and 700 lbs — fix it or delete it.');
    expect(await app.storage('wt-weighins')).toEqual(W);
  });
});

test.describe('sessions misfiled before v1.3', () => {
  // Dates in June 2026: Fri 5, Sat 6, Mon 8, Tue 9, Wed 10, Fri 12, Sat 13.
  const ex = (id, done, sets = 4, weight = '100 lbs') => ({ id, name: 'Lift ' + id, sets, reps: '5-8', weight, done });
  const session = (date, dayIdx, exercises) => ({ date, dayIdx, type: 'push', label: 'Push Day', dayName: 'X', exercises,
    totalSets: exercises.reduce((a, e) => a + e.sets, 0), doneSets: exercises.reduce((a, e) => a + e.done, 0) });
  const HIST = {
    '2026-06-13': session('2026-06-13', 5, [ex('a', 4), ex('b', 3)]),   // Friday evening, saved on Saturday
    '2026-06-10': session('2026-06-10', 3, [ex('c', 4)]),               // correct
    '2026-06-08': session('2026-06-08', 2, [ex('d', 2)]),               // Tuesday morning east of UTC, saved on Monday
    '2026-06-05': session('2026-06-05', 5, [ex('a', 2), ex('b', 3)]),   // Friday, early sets on the right day…
    '2026-06-06': session('2026-06-06', 5, [ex('a', 4), ex('b', 1)]),   // …the rest after 8 PM, saved on Saturday (b: a stray tap)
  };
  const DONE = { '2026-06-13': { a: 4, b: 3 }, '2026-06-10': { c: 4 }, '2026-06-08': { d: 2 }, '2026-06-05': { a: 2, b: 3 }, '2026-06-06': { a: 4, b: 1 } };

  test('finds exactly the entries whose weekday disagrees with their date', async ({ app, page }) => {
    await app.open();
    const moves = await page.evaluate(h => misdatedSessions(h).map(m => [m.from, m.to, m.mergesInto]), HIST);
    expect(moves).toEqual([
      ['2026-06-06', '2026-06-05', true],
      ['2026-06-08', '2026-06-09', false],
      ['2026-06-13', '2026-06-12', false],
    ]);
  });

  test('moving keeps History and logged sets in step, merging by the most sets', async ({ app, page }) => {
    await app.open();
    const r = await page.evaluate(([h, d]) => applyDateFix(h, d, misdatedSessions(h)), [HIST, DONE]);
    expect(Object.keys(r.history).sort()).toEqual(['2026-06-05', '2026-06-09', '2026-06-10', '2026-06-12']);
    expect(Object.keys(r.done).sort()).toEqual(['2026-06-05', '2026-06-09', '2026-06-10', '2026-06-12']);
    expect(r.history['2026-06-12'].date).toBe('2026-06-12');
    const fri = r.history['2026-06-05'];
    // a: the later record has more (4 > 2). b: a stray tap after 8 PM saved 1 — the 3 done earlier must survive.
    expect(fri.exercises.map(e => [e.id, e.done])).toEqual([['a', 4], ['b', 3]]);
    expect(fri.doneSets).toBe(7);
    expect(r.done['2026-06-05']).toEqual({ a: 4, b: 3 });
    expect(await page.evaluate(h => misdatedSessions(h).length, r.history)).toBe(0);   // nothing left to fix
  });

  test('History offers the fix; Move applies it', async ({ app, page }) => {
    await app.open({ seed: { 'wt-history': HIST, 'wt-done': DONE } });
    await app.tab('history');
    const card = page.locator('.datefix');
    await expect(card.locator('.datefix-hd')).toHaveText('3 sessions look filed under the wrong day');
    await expect(card).toContainText('Sat Jun 13 → Fri Jun 12');
    await expect(card).toContainText('combined with what’s already there');
    await card.getByRole('button', { name: 'MOVE THEM' }).click();
    await expect(page.locator('.datefix')).toHaveCount(0);
    expect(Object.keys(await app.storage('wt-history')).sort()).toEqual(['2026-06-05', '2026-06-09', '2026-06-10', '2026-06-12']);
    expect((await app.storage('wt-done'))['2026-06-12']).toEqual({ a: 4, b: 3 });
    await expect(page.locator('#syncMsg')).toHaveText('✓ Moved 3 sessions to the day they were logged');
  });

  test('Leave them: nothing moves, and it stays dismissed', async ({ app, page }) => {
    await app.open({ seed: { 'wt-history': HIST, 'wt-done': DONE } });
    await app.tab('history');
    await page.getByRole('button', { name: 'Leave them as they are' }).click();
    await expect(page.locator('.datefix')).toHaveCount(0);
    // Nothing moved: same dates, same sets. (Since v1.9 entries also gain a per-set `log`.)
    const kept = await app.storage('wt-history');
    const shape = h => Object.fromEntries(Object.entries(h).map(([d, e]) => [d, [e.date, e.dayIdx, e.exercises.map(x => [x.id, x.done])]]));
    expect(shape(kept)).toEqual(shape(HIST));
    await page.reload();
    await app.tab('history');
    await expect(page.locator('.datefix')).toHaveCount(0);
  });

  test('no card when every session is on its own day', async ({ app, page }) => {
    await app.open();
    await page.locator('.dot').first().click();   // logged today, correctly
    await app.tab('history');
    await expect(page.locator('.datefix')).toHaveCount(0);
  });
});
