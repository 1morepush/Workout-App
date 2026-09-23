// Plan targets: planFor() decides every weight and explains it. These tests
// re-derive each target from the written rule instead of trusting planFor().

const { test, expect } = require('./fixtures');

// The rule, as the overload rules card states it: a phase every 4 weeks, one
// increment per phase, deload weeks (4, 8, 12) at 65% of that phase's weight.
function expected(start, incr, week) {
  const plate = v => Math.round(v / 2.5) * 2.5;
  const working = plate(start + incr * Math.floor((week - 1) / 4));
  return [4, 8, 12].includes(week) ? plate(working * 0.65) : working;
}

test('every lift, every week, matches the written rule', async ({ app, page }) => {
  await app.open();
  const lifts = await page.evaluate(() => ALL_EXERCISES_CALC.filter(e => !e.bw)
    .map(e => ({ name: e.name, start: e.start, incr: e.incr,
                 targets: [...Array(12)].map((_, i) => planFor(e.name, i + 1).target) })));
  expect(lifts.length).toBe(20);
  for (const l of lifts) {
    expect(l.targets, l.name).toEqual([...Array(12)].map((_, i) => expected(l.start, l.incr, i + 1)));
  }
});

test('known values: bench across the block', async ({ app, page }) => {
  await app.open();
  const bench = await page.evaluate(() => [1, 4, 5, 8, 9, 12].map(w => planFor('Barbell Bench Press', w).target));
  // wk1 95 · wk4 deload of 95 · wk5 100 · wk8 deload of 100 · wk9 105 · wk12 deload of 105
  expect(bench).toEqual([95, 62.5, 100, 65, 105, 67.5]);
});

test('a deload belongs to the phase it closes', async ({ app, page }) => {
  await app.open();
  const w = await page.evaluate(() => [4, 8, 12].map(n => { const i = weekInfo(n); return [i.phase.name, i.deload]; }));
  expect(w).toEqual([['Accumulation', true], ['Intensification', true], ['Peak', true]]);
});

test('the reason names the start, the phase and the steps', async ({ app, page }) => {
  await app.open({ seed: { 'wt-calc-week': 6 } });
  const why = await page.evaluate(() => [planFor('Barbell Bench Press').why, planFor('Barbell Bench Press', 8).why]);
  expect(why[0]).toBe('Phase 2 (Intensification): the plan’s 95 lbs start + 1 × 5 lbs.');
  expect(why[1]).toBe('Deload: 65% of your 100 lbs Intensification weight. Same reps, focus on form.');
});

test('a start weight you set is used, and credited to you', async ({ app, page }) => {
  await app.open({ seed: { 'wt-calc-week': 5, 'wt-calc-starts': { 'Barbell Bench Press': 135 } } });
  const p = await page.evaluate(() => planFor('Barbell Bench Press'));
  expect(p.target).toBe(140);
  expect(p.why).toContain('your 135 lbs start');
});

test('a card shows the target and reason, and Use sets it', async ({ app, page }) => {
  await app.open({ seed: { 'wt-calc-week': 6 } });
  const card = page.locator('[data-card]').first();
  await expect(card.locator('.plan-lbl')).toHaveText('Plan · wk 6');
  await expect(card.locator('.plan-val')).toHaveText('100 lbs');
  await expect(card.locator('.plan-why')).toHaveText('Phase 2 (Intensification): the plan’s 95 lbs start + 1 × 5 lbs.');
  await card.locator('.plan-use').click();
  const fresh = page.locator('[data-card]').first();
  await expect(fresh.locator('[data-wt]')).toHaveText('100 lbs');
  await expect(fresh.locator('.plan-use')).toHaveCount(0);   // nothing left to apply
  const id = await fresh.getAttribute('data-card');
  expect((await app.storage('wt-plans')).flatMap(d => d.exercises || []).find(e => e.id === id).weight).toBe('100 lbs');
});

test('changing the week in the calculator updates the cards behind it', async ({ app, page }) => {
  await app.open({ seed: { 'wt-calc-week': 6 } });
  await page.evaluate(() => { renderCalcSheet(); document.getElementById('calcOverlay').classList.add('open'); });
  await page.locator('.calc-wk-btn', { hasText: /^8$/ }).click();
  await expect(page.locator('.calc-phase-banner')).toHaveText('DELOAD — WEEK 8 — 65% of your Phase 2 weight, focus on form');
  await expect(page.locator('#calcBody')).toContainText('log your reps, and the Next line');
  await page.click('#calcClose');
  const row = page.locator('[data-card]').first().locator('.plan-row');
  await expect(row).toHaveClass(/is-deload/);
  await expect(row.locator('.plan-lbl')).toHaveText('Deload · wk 8');
  await expect(row.locator('.plan-val')).toHaveText('65 lbs');
});

test('every weighted card gets a plan line, bodyweight moves don’t', async ({ app, page }) => {
  await app.open();
  for (const day of [1, 2, 3, 5, 6]) {
    const rows = await page.evaluate(d => { goDay(d); return [...document.querySelectorAll('[data-card]')]
      .map(c => ({ name: c.querySelector('.card-name').textContent, plan: !!c.querySelector('.plan-row') })); }, day);
    for (const r of rows) expect(r.plan, r.name).toBe(!/Dead Bug/.test(r.name));
  }
});
