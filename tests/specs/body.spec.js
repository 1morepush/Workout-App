// Body-based intake targets: weight + body fat → calories and macros aimed at a
// body-fat goal. Expected numbers are worked by hand from the published formulas.

const { test, expect } = require('./fixtures');

// A Targets row by its own label — "calories"/"protein" also appear in other rows' reasons.
const tgtRow = (page, label) => page.locator('.in-tgt-row').filter({ has: page.locator('.ef-lbl', { hasText: new RegExp('^' + label) }) });

const plan = (page, profile, lbs) => page.evaluate(([p, l]) => bodyPlanFor(p, l), [profile, lbs]);

test.describe('the calculation', () => {
  test.beforeEach(async ({ app }) => { await app.open(); });

  test('190 lbs at 24% → 15%: Katch-McArdle, steady cut', async ({ page }) => {
    const p = await plan(page, { bodyFat: 24, goalBf: 15, activity: 'moderate', pace: 'steady' }, 190);
    // lean 144.4 lbs = 65.50 kg → BMR 370 + 21.6×65.50 = 1,784.8 → ×1.55 = 2,766.4
    expect(Math.round(p.bmr)).toBe(1785);
    expect(Math.round(p.tdee)).toBe(2766);
    // −0.5% × 190 lbs × 3,500 / 7 = −475 → 2,291 → nearest 10
    expect(p.targets.kcal).toBe(2290);
    expect(p.goalLbs).toBeCloseTo(169.88, 1);   // 144.4 / 0.85
    expect(p.weeks).toBe(22);                    // 20.1 lbs at ~0.95 lb/week
    expect(p.targets).toMatchObject({ protein: 170, fat: 64, carbs: 259, fiber: 32, addedSugar: 57, satFat: 25, sodium: 2300 });
    expect(p.why.kcal).toContain('Katch-McArdle, from 144.4 lbs of lean mass');
    expect(p.why.kcal).toContain('Minus 476 a day to lose about 1 lb a week (0.5% of your weight).');
    expect(p.why.protein).toBe('1 g per lb of your 15% goal weight (~170 lbs).');
  });

  test('without body fat: Mifflin-St Jeor from height, age and sex', async ({ page }) => {
    const p = await plan(page, { heightIn: 70, age: 30, sex: 'm' }, 190);
    // 10×86.18 + 6.25×177.8 − 5×30 + 5 = 1,828.1 → ×1.55 = 2,833.5 → −475 → 2,358.5
    expect(Math.round(p.bmr)).toBe(1828);
    expect(p.targets.kcal).toBe(2360);
    expect(p.goalLbs).toBeNull();
    expect(p.targets.protein).toBe(152);   // 0.8 g × 190 lbs
    expect(p.why.protein).toContain('Add your body fat %');
  });

  test('women’s formula differs by 166 kcal of resting burn', async ({ page }) => {
    const [m, f] = await Promise.all(['m', 'f'].map(sex => plan(page, { heightIn: 65, age: 30, sex }, 150)));
    expect(Math.round(m.bmr - f.bmr)).toBe(166);
  });

  test('not enough to go on: weight alone', async ({ page }) => {
    expect(await plan(page, {}, 190)).toEqual({ missing: true });
  });

  test('already at the goal: holds at maintenance', async ({ page }) => {
    const p = await plan(page, { bodyFat: 14, goalBf: 15 }, 170);
    expect(p.phase).toBe('hold');
    expect(p.targets.kcal).toBe(Math.round(p.tdee / 10) * 10);
    expect(p.why.kcal).toContain('holds you there');
    expect(p.targets.protein).toBe(170);   // 1 g per lb of current weight once at goal
  });

  test('a fast cut on a small body is held at the floor', async ({ page }) => {
    const p = await plan(page, { bodyFat: 30, pace: 'faster', activity: 'light' }, 120);
    const floor = Math.max(p.bmr, p.tdee * 0.75);
    expect(p.targets.kcal).toBe(Math.round(floor / 10) * 10);
    expect(p.capped).toBeTruthy();
    expect(p.why.kcal).toMatch(/held at .* so the cut doesn’t cost muscle/);
  });

  test('pace changes the deficit; activity changes maintenance', async ({ page }) => {
    const base = { bodyFat: 24 };
    const [slow, steady, faster] = await Promise.all(['slow', 'steady', 'faster'].map(pace => plan(page, { ...base, pace }, 190)));
    expect(slow.targets.kcal).toBeGreaterThan(steady.targets.kcal);
    expect(steady.targets.kcal).toBeGreaterThan(faster.targets.kcal);
    const [light, high] = await Promise.all(['light', 'high'].map(activity => plan(page, { ...base, activity }, 190)));
    expect(high.tdee / light.tdee).toBeCloseTo(1.725 / 1.375, 5);
  });

  test('a different goal moves the goal weight', async ({ page }) => {
    const p = await plan(page, { bodyFat: 24, goalBf: 12 }, 190);
    expect(p.goalLbs).toBeCloseTo(144.4 / 0.88, 1);
  });
});

test.describe('on the Intake tab', () => {
  test('with no weight, targets stay on the meal plan and invite a weigh-in', async ({ app, page }) => {
    await app.open();
    await app.tab('intake');
    await expect(page.locator('.in-hero-num')).toContainText('/ 1,905');
    await expect(page.locator('.in-body')).toContainText('Set targets from your body');
    await expect(page.locator('.in-body')).toContainText('15% body fat');
  });

  test('entering weight and body fat sets the targets, shows the goal, and backs up', async ({ app, page }) => {
    await app.open();
    await app.tab('intake');
    await page.click('[data-act="body"]');
    await page.fill('[data-bf="lbs"]', '190');
    await expect(page.locator('#bodyPreview')).toContainText('Add body fat %');
    await page.fill('[data-bf="bodyFat"]', '24');
    await expect(page.locator('#bodyPreview')).toHaveText('→ 2,290 kcal · 170 g protein a day · about 22 weeks to ~170 lbs');
    await page.click('[data-sa="body-save"]');

    await expect(page.locator('.in-hero-num')).toContainText('/ 2,290');
    await expect(page.locator('.in-body-head')).toHaveText('190 lbs · 24% → 15% body fat');
    await expect(page.locator('.in-body-sub')).toHaveText('About 22 weeks to ~170 lbs, losing ~1 lb a week.');
    await expect(page.locator('.in-row', { hasText: 'Protein' })).toContainText('/ 170g');

    expect(await app.storage('wt-weighins')).toEqual({ '2026-06-15': 190 });
    expect(await app.storage('wt-body')).toMatchObject({ bodyFat: 24, goalBf: 15, activity: 'moderate', pace: 'steady' });
    expect(await page.evaluate(() => SYNC_KEYS.includes('wt-body') && SYNC_KEYS.includes('wt-weighins'))).toBe(true);
  });

  test('every target says where it came from', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 24 }, 'wt-weighins': { '2026-06-15': 190 } } });
    await app.tab('intake');
    await page.click('.in-body [data-act="targets"]');
    const why = tgtRow(page, 'Calories').locator('.in-tgt-why');
    await expect(why).toContainText('Maintenance ≈ 2,766: resting burn 1,785 (Katch-McArdle');
    await expect(tgtRow(page, 'Fiber')).toContainText('14 g per 1,000 calories');
    await expect(page.locator('#intakeSheet')).toContainText('Reset all to your calculated targets');
  });

  test('a number you set still wins, and says so', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 24 }, 'wt-weighins': { '2026-06-15': 190 }, 'wt-intake-targets': { protein: 200 } } });
    await app.tab('intake');
    await expect(page.locator('.in-row', { hasText: 'Protein' })).toContainText('/ 200g');
    await page.click('[data-act="targets"]');
    await expect(tgtRow(page, 'Protein').locator('.in-tgt-why')).toContainText('Your number. Calculated: 170');
  });

  test('weight alone falls back to the meal plan and says what’s missing', async ({ app, page }) => {
    await app.open({ seed: { 'wt-weighins': { '2026-06-15': 190 } } });
    await app.tab('intake');
    await expect(page.locator('.in-hero-num')).toContainText('/ 1,905');
    await expect(page.locator('.in-body-sub')).toContainText('Add your body fat % — or height, age and sex');
  });

  test('weigh-ins over time show the trend, and the newest one drives the targets', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 24 }, 'wt-weighins': { '2026-06-01': 192.6, '2026-06-08': 191.2 } } });
    await app.tab('intake');
    await page.click('[data-act="body"]');
    await expect(page.locator('[data-bf="lbs"]')).toHaveValue('191.2');
    await page.fill('[data-bf="lbs"]', '190.2');
    await page.click('[data-sa="body-save"]');
    await expect(page.locator('.in-body-trend')).toHaveText('Down 2.4 lbs since Jun 1 · 3 weigh-ins');
    await expect(page.locator('.in-body-head')).toContainText('190.2 lbs');
  });

  test('bad input is refused with a reason', async ({ app, page }) => {
    await app.open();
    await app.tab('intake');
    await page.click('[data-act="body"]');
    await page.fill('[data-bf="lbs"]', '19');
    await page.click('[data-sa="body-save"]');
    await expect(page.locator('#intakeSheet .in-err')).toHaveText('Enter your weight in pounds (70–700).');
    expect(await app.storage('wt-weighins')).toBeNull();
  });

  test('height in feet and inches, and the choice buttons, are kept', async ({ app, page }) => {
    await app.open();
    await app.tab('intake');
    await page.click('[data-act="body"]');
    await page.fill('[data-bf="lbs"]', '190');
    await page.fill('[data-bf="age"]', '30');
    await page.fill('[data-bf="heightFt"]', '5');
    await page.fill('[data-bf="heightInch"]', '10');
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await page.getByRole('button', { name: 'High', exact: true }).click();
    await expect(page.locator('#bodyPreview')).toContainText('kcal');
    await page.click('[data-sa="body-save"]');
    expect(await app.storage('wt-body')).toMatchObject({ heightIn: 70, age: 30, sex: 'm', activity: 'high' });
  });
});
