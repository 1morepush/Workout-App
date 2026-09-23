// v1.9: History is the one record of every set — with reps — and the Train tab
// reads last session's reps to say whether you've earned more weight.

const { test, expect } = require('./fixtures');

const TODAY = '2026-06-15';   // Monday, push day
const LAST = '2026-06-08';    // the Monday before

// The Monday plan's first exercise (bench), as the app defines it.
const bench = page => page.evaluate(() => { const x = workouts[1].exercises[0]; return { id: x.id, name: x.name, sets: x.sets, reps: x.reps }; });
const lastMonday = (b, reps, lbs = 100) => ({ [LAST]: { date: LAST, dayIdx: 1, type: 'push', label: 'Push Day', dayName: 'Monday',
  exercises: [{ id: b.id, name: b.name, sets: b.sets, reps: b.reps, weight: lbs + ' lbs', log: reps.map(r => ({ reps: r, lbs })) }] } });
const firstCard = page => page.locator('[data-card]').first();

test.describe('moving to the set log', () => {
  test('old counts become sets with reps not logged; the dots follow History', async ({ app, page }) => {
    const oldHist = {
      '2026-06-12': { date: '2026-06-12', dayIdx: 5, type: 'push', label: 'Push', exercises: [{ id: 'p1', name: 'Bench', sets: 4, reps: '5-8', weight: '100 lbs', done: 3 }], totalSets: 4, doneSets: 3 },
      '2026-06-14': { date: '2026-06-14', dayIdx: 0, type: 'rest', label: 'Rest', totalRec: 3, doneRec: 2 },
    };
    const oldDone = { '2026-06-12': { p1: 3 }, '2026-06-14': { r1: 1, r2: 1 }, '2026-06-11': { p9: 4 } };   // Jun 11: deleted in History
    await app.open({ seed: { 'wt-history': oldHist, 'wt-done': oldDone } });
    const h = await app.storage('wt-history');
    expect(h['2026-06-12'].exercises[0].log).toEqual([{ reps: null, lbs: 100 }, { reps: null, lbs: 100 }, { reps: null, lbs: 100 }]);
    expect(h['2026-06-12'].exercises[0].done).toBe(3);
    expect(h['2026-06-14'].recDone).toEqual(['r1', 'r2']);
    // A session deleted in History no longer lingers in the dot counts.
    expect(await app.storage('wt-done')).toEqual({ '2026-06-12': { p1: 3 }, '2026-06-14': { r1: 1, r2: 1 } });
  });

  test('already-migrated data is left alone on load', async ({ app, page }) => {
    await app.open();
    await page.locator('.dot').first().click();
    const before = await page.evaluate(() => localStorage.getItem('wt-history'));
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem('wt-history'))).toBe(before);
  });
});

test.describe('History and Train stay in step', () => {
  test('Delete Session sticks — the next tap doesn’t bring the old sets back', async ({ app, page }) => {
    await app.open();
    const cards = page.locator('[data-card]');
    for (let i = 0; i < 3; i++) await cards.nth(0).locator('.dot').nth(i).click();
    await app.tab('history');
    await page.locator('.hist-card').first().click();
    await page.getByRole('button', { name: 'Delete Session' }).click();
    await app.tab('train');
    await expect(page.locator('#setsCount')).toHaveText(/^0 \//);
    await cards.nth(1).locator('.dot').first().click();
    const s = (await app.storage('wt-history'))[TODAY];
    expect(s.doneSets).toBe(1);
    expect(s.exercises[0].done).toBe(0);
  });

  test('a set count changed in History isn’t undone by the next tap on Train', async ({ app, page }) => {
    await app.open();
    const cards = page.locator('[data-card]');
    for (let i = 0; i < 4; i++) await cards.nth(0).locator('.dot').nth(i).click();
    await app.tab('history');
    await page.locator('.hist-card').first().click();
    await page.getByRole('button', { name: 'Edit Session' }).click();
    await page.locator('.hist-ex-sets-inp').first().fill('2');
    await page.locator('.hist-ex-sets-inp').first().dispatchEvent('change');
    await app.tab('train');
    await expect(cards.nth(0).locator('.dot.done')).toHaveCount(2);
    await cards.nth(1).locator('.dot').first().click();
    expect((await app.storage('wt-history'))[TODAY].exercises[0].done).toBe(2);
    expect((await app.storage('wt-done'))[TODAY]).toMatchObject({ [(await bench(page)).id]: 2 });
  });

  test('reps typed in History are kept and shown', async ({ app, page }) => {
    await app.open();
    const b = await bench(page);
    await page.evaluate(h => { localStorage.setItem('wt-history', JSON.stringify(h)); }, lastMonday(b, [null, null, null, null]));
    await page.reload();
    await app.tab('history');
    await page.locator('.hist-card').first().click();
    await page.getByRole('button', { name: 'Edit Session' }).click();
    await page.locator('.hist-ex-reps').first().fill('8 8 7 6');
    await page.locator('.hist-ex-reps').first().dispatchEvent('change');
    expect((await app.storage('wt-history'))[LAST].exercises[0].log.map(s => s.reps)).toEqual([8, 8, 7, 6]);
    await page.getByRole('button', { name: 'Done Editing' }).click();
    await expect(page.locator('.hist-card').first()).toContainText('8·8·7·6 reps');
  });
});

test.describe('logging reps on Train', () => {
  test('sets start as “not logged”; type reps, Enter moves to the next set', async ({ app, page }) => {
    await app.open();
    const card = firstCard(page);
    await card.locator('.dot').nth(0).click();
    await card.locator('.dot').nth(1).click();
    await expect(firstCard(page).locator('.reps-chip.is-empty')).toHaveCount(2);
    await expect(firstCard(page).locator('.reps-hint')).toHaveText('tap to log');
    await firstCard(page).locator('.reps-chip').first().click();
    await page.keyboard.type('8'); await page.keyboard.press('Enter');
    await expect(page.locator('.reps-input')).toBeFocused();          // moved on to set 2
    await page.keyboard.type('7'); await page.keyboard.press('Enter');
    await expect(firstCard(page).locator('.reps-chip')).toHaveText(['8', '7']);
    const x = (await app.storage('wt-history'))[TODAY].exercises[0];
    expect(x.log.map(s => s.reps)).toEqual([8, 7]);
    expect(x.log[0].lbs).toBe(await page.evaluate(() => parseLbs(workouts[1].exercises[0].weight)));
  });

  test('untapping a set drops its reps with it', async ({ app, page }) => {
    await app.open();
    for (let i = 0; i < 3; i++) await firstCard(page).locator('.dot').nth(i).click();
    await firstCard(page).locator('.reps-chip').nth(2).click();
    await page.keyboard.type('6'); await page.keyboard.press('Enter');
    await firstCard(page).locator('.dot').nth(2).click();   // tapping the 3rd done dot takes it back
    expect((await app.storage('wt-history'))[TODAY].exercises[0].log).toHaveLength(2);
  });
});

test.describe('double progression', () => {
  test('rules, by case', async ({ app, page }) => {
    await app.open();
    const b = await bench(page);
    const verdict = (reps, week = 6, ex = b) => page.evaluate(([ex, h, w]) => {
      const p = progressionFor(ex, lastSessionFor(h, ex, '2026-06-15'), w); return p && [p.verdict, p.next || null, p.text];
    }, [ex, lastMonday(b, reps), week]);
    expect(await verdict([8, 8, 8, 8])).toEqual(['add', 105, 'Last time (Jun 8): 8·8·8·8 at 100 lbs — the top of 5–8 on every set. Add 5 lbs → 105 lbs.']);
    expect(await verdict([8, 7, 6, 6])).toEqual(['stay', null, 'Last time (Jun 8): 8·7·6·6 at 100 lbs. Stay at 100 lbs until every set reaches 8.']);
    expect((await verdict([8, 8, 8]))[0]).toBe('finish');
    expect((await verdict([8, 8, null, 8]))[2]).toContain('reps not logged');
    expect(await verdict([8, 8, 8, 8], 8)).toBeNull();                                  // deload week: the deload rules
    expect(await verdict([8, 8, 8, 8], 6, { ...b, reps: 'AMRAP' })).toBeNull();          // no numeric range, no call
    expect(await page.evaluate(() => [repRange('5-8'), repRange('10 – 12'), repRange('8'), repRange('30s'), repRange('8-5')]))
      .toEqual([[5, 8], [10, 12], [8, 8], null, null]);
  });

  test('earned: the Next line says add 5, and Use takes it', async ({ app, page }) => {
    await app.open();
    const b = await bench(page);
    await page.evaluate(h => localStorage.setItem('wt-history', JSON.stringify(h)), lastMonday(b, [8, 8, 8, 8]));
    await page.reload();
    const next = firstCard(page).locator('.next-row');
    await expect(next).toHaveClass(/is-add/);
    await expect(next.locator('.plan-val')).toHaveText('105 lbs');
    await expect(firstCard(page).locator('.prev-wt-row')).toHaveCount(0);   // "Last session" isn't repeated
    await next.locator('.plan-use').click();
    await expect(firstCard(page).locator('[data-wt]')).toHaveText('105 lbs');
    await expect(firstCard(page).locator('.next-row .plan-use')).toHaveCount(0);
  });

  test('not yet: stay, and say so when the schedule is ahead', async ({ app, page }) => {
    await app.open({ seed: { 'wt-calc-week': 9 } });   // schedule: 105 this week
    const b = await bench(page);
    await page.evaluate(h => localStorage.setItem('wt-history', JSON.stringify(h)), lastMonday(b, [8, 7, 6, 6]));
    await page.reload();
    const next = firstCard(page).locator('.next-row');
    await expect(next).toHaveClass(/is-stay/);
    await expect(next.locator('.plan-use')).toHaveCount(0);
    await expect(next).toContainText('Stay at 100 lbs until every set reaches 8. The schedule says 105 lbs this week — double progression says earn it first.');
  });

  test('the Coach hears the same verdict', async ({ app, page, groq }) => {
    await app.open({ seed: { 'wt-coach-key': 'gsk_test' } });
    const b = await bench(page);
    await page.evaluate(h => localStorage.setItem('wt-history', JSON.stringify(h)), lastMonday(b, [8, 8, 8, 8]));
    await page.reload();
    groq.handler = () => ({ json: { choices: [{ message: { content: 'ok' } }] } });
    await app.tab('coach'); await page.click('.coach-new-btn');
    await page.fill('.coach-inp', 'go up on bench?'); await page.click('.coach-send-btn');
    await expect(page.locator('.coach-msg.ai .coach-bubble')).toHaveText('ok');
    const sys = groq.lastRequest().messages[0].content;
    expect(sys).toContain('Last time (Jun 8): 8·8·8·8 at 100 lbs — the top of 5–8 on every set. Add 5 lbs → 105 lbs.');
    expect(sys).toContain('add weight only once every set reached the top of the range');
  });
});
