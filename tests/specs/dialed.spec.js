// v1.7: calibration from weigh-ins, tape-measure body fat, the Meal tab gap,
// and the Coach seeing intake. Expected numbers are worked by hand.

const { test, expect } = require('./fixtures');

const TODAY = '2026-06-15';
const BODY = { bodyFat: 24 };   // 190 lbs at 24% → formula maintenance 2,766, target 2,290

// Four weigh-ins on a straight line, 0.5 lb a week down, ending at 190.0 today.
const STEADY_HALF_LB = { '2026-06-01': 191.0, '2026-06-05': 190.714, '2026-06-10': 190.357, '2026-06-15': 190.0 };

// Intake logged at `kcal` every day from Jun 1 to Jun 15.
function loggedDays(kcal, from = 1, to = 15) {
  const out = {};
  for (let d = from; d <= to; d++) {
    const ds = '2026-06-' + String(d).padStart(2, '0');
    out[ds] = [{ id: 'x' + d, t: ds + 'T12:00:00', src: 'manual', name: 'Day total', serving: '', servings: 1, n: { kcal } }];
  }
  return out;
}

const calib = (page, args) => page.evaluate(a => {
  const plan = bodyPlanFor(a.profile, a.lbs, a.calib);
  return calibrationFor({ weighIns: a.weighIns, intake: a.intake || {}, plan, targetKcal: a.targetKcal, calib: a.calib, today: a.today });
}, args);

test.describe('calibration math', () => {
  test.beforeEach(async ({ app }) => { await app.open(); });

  test('losing 0.5 lb/wk on 2,290 logged → burn ~2,540, 227 under the formula', async ({ page }) => {
    const c = await calib(page, { profile: BODY, lbs: 190, weighIns: STEADY_HALF_LB, intake: loggedDays(2290), targetKcal: 2290, today: TODAY });
    expect(c.status).toBe('suggest');
    expect(c.basis).toBe('logged');
    expect(c.lossPerWk).toBeCloseTo(0.5, 2);
    expect(c.factor).toBe(0.918);                       // 2,540 / 2,766.4
    expect(Math.round(c.maintenance)).toBe(2540);
    expect(c.why).toContain('you lost 0.5 lb a week, eating about 2,290 a day (logged on 15 of 15 days)');
    expect(c.why).toContain('227 less than the formula’s 2,766');
    const next = await page.evaluate(f => bodyPlanFor({ bodyFat: 24 }, 190, { factor: f, date: '2026-06-15' }).targets.kcal, c.factor);
    expect(next).toBe(2060);                            // 2,539.6 − 475 = 2,064.6 → 2,060
  });

  test('without logged meals it assumes the target, and says so', async ({ page }) => {
    const c = await calib(page, { profile: BODY, lbs: 190, weighIns: STEADY_HALF_LB, targetKcal: 2290, today: TODAY });
    expect(c.basis).toBe('assumed');
    expect(c.factor).toBe(0.918);
    expect(c.why).toContain('meals weren’t logged on most days, so that’s assumed');
  });

  test('losing at the planned rate → on track, no change suggested', async ({ page }) => {
    // 2,290 eaten + 0.95 lb/wk × 500 ≈ 2,766 = the formula
    const w = { '2026-06-01': 191.9, '2026-06-08': 190.95, '2026-06-12': 190.407, '2026-06-15': 190.0 };
    const c = await calib(page, { profile: BODY, lbs: 190, weighIns: w, intake: loggedDays(2290), targetKcal: 2290, today: TODAY });
    expect(c.status).toBe('onTrack');
  });

  test('too little data → says exactly what’s missing', async ({ page }) => {
    const c = await calib(page, { profile: BODY, lbs: 190, weighIns: { '2026-06-08': 191, '2026-06-15': 190 }, targetKcal: 2290, today: TODAY });
    expect(c).toMatchObject({ status: 'waiting', weighInsNeeded: 2, daysNeeded: 7 });
  });

  test('weigh-ins older than 4 weeks are ignored', async ({ page }) => {
    const w = { '2026-05-01': 200, '2026-05-10': 199, '2026-06-08': 191, '2026-06-15': 190 };
    const c = await calib(page, { profile: BODY, lbs: 190, weighIns: w, targetKcal: 2290, today: TODAY });
    expect(c).toMatchObject({ status: 'waiting', count: 2 });
  });

  test('implausible data is capped at ±25% and flagged', async ({ page }) => {
    const crash = { '2026-06-01': 200, '2026-06-05': 197, '2026-06-10': 193, '2026-06-15': 190 };   // 5 lb/wk
    const c = await calib(page, { profile: BODY, lbs: 190, weighIns: crash, targetKcal: 2290, today: TODAY });
    expect(c.factor).toBe(1.25);
    expect(c.clamped).toBe(true);
    expect(c.why).toContain('capped at 125% of the formula');
  });

  test('after calibrating, only weigh-ins since then count (no ratchet)', async ({ page }) => {
    const c = await calib(page, { profile: BODY, lbs: 190, weighIns: STEADY_HALF_LB, targetKcal: 2060,
                                  calib: { factor: 0.918, date: '2026-06-15' }, today: TODAY });
    expect(c).toMatchObject({ status: 'waiting', since: '2026-06-15', count: 1 });
  });
});

test.describe('calibration on the Intake tab', () => {
  const SEED = { 'wt-body': BODY, 'wt-weighins': STEADY_HALF_LB };

  test('before enough weigh-ins, it says what it needs', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': BODY, 'wt-weighins': { '2026-06-15': 190 } } });
    await app.tab('intake');
    await expect(page.locator('.in-calib')).toHaveText('These are formula estimates. After 3 more weigh-ins and 14 more days, the app checks them against how fast you’re actually losing.');
  });

  test('Use applies the suggestion; the next check waits for new weigh-ins', async ({ app, page }) => {
    await app.open({ seed: { ...SEED, 'wt-intake': loggedDays(2290) } });
    await app.tab('intake');
    await expect(page.locator('.in-hero-num')).toContainText('/ 2,290');
    await expect(page.locator('.in-calib-head')).toHaveText('Your weigh-ins suggest 2,060 kcal a day, not 2,290');
    await page.click('[data-act="calib-use"]');
    await expect(page.locator('.in-hero-num')).toContainText('/ 2,060');
    expect(await app.storage('wt-calibration')).toMatchObject({ factor: 0.918, date: TODAY });
    await expect(page.locator('.in-calib')).toContainText('Calibrated Jun 15 from your weigh-ins. The app checks again after');
    await expect(page.locator('.in-calib-use')).toHaveCount(0);
    await page.click('.in-body [data-act="targets"]');
    await expect(page.locator('#intakeSheet')).toContainText('calibrated from your weigh-ins on Jun 15 (the formula said 2,766');
  });

  test('assumed intake doesn’t ratchet: Use once, then no new suggestion', async ({ app, page }) => {
    await app.open({ seed: SEED });   // nothing logged → intake assumed
    await app.tab('intake');
    await page.click('[data-act="calib-use"]');
    const first = await app.storage('wt-calibration');
    await page.reload();
    await app.tab('intake');
    await expect(page.locator('.in-calib-use')).toHaveCount(0);
    expect(await app.storage('wt-calibration')).toEqual(first);
  });

  test('a calibration can be cleared back to the formula', async ({ app, page }) => {
    await app.open({ seed: { ...SEED, 'wt-calibration': { factor: 0.918, date: TODAY } } });
    await app.tab('intake');
    await expect(page.locator('.in-hero-num')).toContainText('/ 2,060');
    await page.click('[data-act="targets"]');
    await page.click('[data-sa="calib-clear"]');
    await page.click('[data-sa="cancel"]');
    await expect(page.locator('.in-hero-num')).toContainText('/ 2,290');
  });

  test('the weigh-in trend says "1 lb", not "1 lbs"', async ({ app, page }) => {
    await app.open({ seed: SEED });
    await app.tab('intake');
    await expect(page.locator('.in-body-trend')).toHaveText('Down 1 lb since Jun 1 · 4 weigh-ins');
  });

  test('the calibration is backed up', async ({ app, page }) => {
    await app.open();
    expect(await page.evaluate(() => SYNC_KEYS.includes('wt-calibration'))).toBe(true);
  });
});

test.describe('tape-measure body fat', () => {
  test('US Navy formula, by hand', async ({ app, page }) => {
    await app.open();
    const r = await page.evaluate(() => [
      navyBodyFat({ sex: 'm', heightIn: 70, waistIn: 34, neckIn: 15 }),
      navyBodyFat({ sex: 'f', heightIn: 65, waistIn: 30, hipIn: 38, neckIn: 13 }),
      navyBodyFat({ sex: 'm', heightIn: 70, waistIn: 15, neckIn: 15 }),
      navyBodyFat({ sex: 'f', heightIn: 65, waistIn: 30, neckIn: 13 }),
      navyBodyFat({ heightIn: 70, waistIn: 34, neckIn: 15 }),
    ]);
    // 86.010·log(19) − 70.041·log(70) + 36.76 = 17.51 · 163.205·log(55) − 97.684·log(65) − 78.387 = 28.56
    expect(r).toEqual([17.5, 28.6, null, null, null]);
  });

  test('estimate in the body sheet, then Use fills body fat', async ({ app, page }) => {
    await app.open();
    await app.tab('intake');
    await page.click('[data-act="body"]');
    await page.fill('[data-bf="lbs"]', '190');
    await page.click('[data-sa="tape-open"]');
    await expect(page.locator('#tapeEst')).toContainText('Pick your sex');
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await expect(page.locator('#tapeEst')).toContainText('Add your height');
    await page.fill('[data-bf="heightFt"]', '5');
    await page.fill('[data-bf="heightInch"]', '10');
    await page.fill('[data-bf="waistIn"]', '34');
    await page.fill('[data-bf="neckIn"]', '15');
    await expect(page.locator('#tapeEst')).toContainText('Estimate: 17.5%');
    await page.click('[data-sa="tape-use"]');
    await expect(page.locator('[data-bf="bodyFat"]')).toHaveValue('17.5');
    await expect(page.locator('#bodyPreview')).toContainText('kcal');
    await page.click('[data-sa="body-save"]');
    expect(await app.storage('wt-body')).toMatchObject({ bodyFat: 17.5, waistIn: 34, neckIn: 15, heightIn: 70, sex: 'm' });
  });
});

test.describe('Meal tab', () => {
  test('chips are the plan’s real totals, and no gap card without a body target', async ({ app, page }) => {
    await app.open();
    await app.tab('meal');
    await expect(page.locator('.macro-chip').first()).toContainText('1,905');
    await expect(page.locator('.meal-sub')).toHaveText('~1,905 KCAL · 181G PROTEIN · DAILY');
    await expect(page.locator('.meal-gap')).toHaveCount(0);
  });

  test('shows the gap to your body-based target and how to close it', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': BODY, 'wt-weighins': { [TODAY]: 190 } } });
    await app.tab('meal');
    const gap = page.locator('.meal-gap');
    await expect(gap.locator('.meal-gap-row', { hasText: 'Calories' })).toContainText('2,290 target · plan 1,905 · 385 short');
    await expect(gap.locator('.meal-gap-row', { hasText: 'Protein' })).toContainText('170g target · plan 181g · 11g over');
    await expect(gap).toContainText('Eat about 385 kcal more a day: roughly 20% bigger portions');
    await expect(gap).toContainText('Targets come from your body on the Intake tab.');
  });
});

test.describe('Coach and food', () => {
  test('knows the body goal, targets, and today’s food — label vs estimate', async ({ app, page, groq }) => {
    const intake = { [TODAY]: [
      { id: 'a', t: TODAY + 'T08:00:00', src: 'label', name: 'Ramen', serving: '', servings: 1, n: { kcal: 380, protein: 8, sodium: 1760 } },
      { id: 'b', t: TODAY + 'T13:00:00', src: 'ai', name: 'Burrito bowl', serving: '', servings: 1, n: { kcal: 700, protein: 40 } },
    ] };
    await app.open({ seed: { 'wt-coach-key': 'gsk_test', 'wt-body': BODY, 'wt-weighins': { '2026-06-01': 192.6, [TODAY]: 190 }, 'wt-intake': intake } });
    groq.handler = () => ({ json: { choices: [{ message: { content: 'ok' } }] } });
    await app.tab('coach');
    await page.click('.coach-new-btn');
    await page.fill('.coach-inp', 'what should I eat for dinner?');
    await page.click('.coach-send-btn');
    await expect(page.locator('.coach-msg.ai .coach-bubble')).toHaveText('ok');
    const sys = groq.lastRequest().messages[0].content;
    expect(sys).toContain('do not invent different targets');
    expect(sys).toContain('BODY: 190 lbs (weighed 2026-06-15), 24% body fat, goal 15%');
    expect(sys).toContain('WEIGH-INS: Down 2.6 lbs since Jun 1');
    expect(sys).toContain('DAILY TARGETS: 2,290 kcal, protein 170 g');
    expect(sys).toContain('TODAY\'S INTAKE (logged so far): 1,080 kcal, protein 48 g');
    expect(sys).toContain('remaining: 1,210 kcal, 122 g protein');
    expect(sys).toContain('• Ramen (label): 380 kcal');
    expect(sys).toContain('• Burrito bowl (estimate): 700 kcal');
  });

  test('with nothing entered, says targets come from the meal plan', async ({ app, page, groq }) => {
    await app.open({ seed: { 'wt-coach-key': 'gsk_test' } });
    groq.handler = () => ({ json: { choices: [{ message: { content: 'ok' } }] } });
    await app.tab('coach');
    await page.click('.coach-new-btn');
    await page.fill('.coach-inp', 'hi');
    await page.click('.coach-send-btn');
    await expect(page.locator('.coach-msg.ai .coach-bubble')).toHaveText('ok');
    const sys = groq.lastRequest().messages[0].content;
    expect(sys).toContain('BODY: no weight entered; targets come from the fixed meal plan.');
    expect(sys).toContain("TODAY'S INTAKE: nothing logged yet.");
  });
});
