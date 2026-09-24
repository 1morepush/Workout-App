// v1.9.2: numbers are read as written — never by gluing digits together — and
// the Coach is told what the sets and targets really are.

const { test, expect, chat } = require('./fixtures');

const KEY = { 'wt-coach-key': 'gsk_test' };

test.describe('reading numbers', () => {
  test('weights: one number with an optional lbs; anything else is no number', async ({ app, page }) => {
    await app.open();
    const read = await page.evaluate(() => ['135', '135 lbs', '135lb', '22,5 lbs', '2x30 lbs', '135-145', '45+10', 'BW+25', '20 kg', 'BW', '0', '']
      .map(w => [w, parseLbs(w)]));
    expect(Object.fromEntries(read)).toEqual({
      '135': 135, '135 lbs': 135, '135lb': 135, '22,5 lbs': 22.5,
      '2x30 lbs': null, '135-145': null, '45+10': null, 'BW+25': null, '20 kg': null, 'BW': null, '0': null, '': null,
    });
  });

  test('typed amounts: thousands, decimal commas and fractions', async ({ app, page }) => {
    await app.open();
    const read = await page.evaluate(() => ['2,300', '1,200.5', '3,5', '1/2', '1 1/2', '185 lbs', '140 mg', '-5', '1,2,3', '12abc']
      .map(w => [w, parseNum(w)]));
    expect(Object.fromEntries(read)).toEqual({
      '2,300': 2300, '1,200.5': 1200.5, '3,5': 3.5, '1/2': 0.5, '1 1/2': 1.5, '185 lbs': 185, '140 mg': 140,
      '-5': null, '1,2,3': null, '12abc': null,
    });
  });

  test('a lift logged at "2x30 lbs" gets no made-up next weight', async ({ app, page }) => {
    await app.open();
    const p = await page.evaluate(() => {
      const x = workouts[1].exercises[0], top = +x.reps.split('-').pop();
      const log = Array.from({ length: x.sets }, () => ({ reps: top, lbs: parseLbs('2x30 lbs') }));
      return progressionFor(x, { date: '2026-06-08', x: { weight: '2x30 lbs', log } }, 5);
    });
    expect([p.verdict, p.lbs, p.next]).toEqual(['add', null, null]);
    expect(p.text).toContain('Add weight.');
    expect(p.text).not.toMatch(/230|232/);
  });

  test('a target typed as "2,300" is stored as 2,300', async ({ app, page }) => {
    await app.open();
    await app.tab('intake');
    await page.click('[data-act="targets"]');
    await page.fill('[data-tgt="sodium"]', '2,000');
    await page.click('[data-sa="tgt-save"]');
    expect(await app.storage('wt-intake-targets')).toEqual({ sodium: 2000 });
  });

  test('nutrients the model sends as text keep their own number, not the %DV or kJ glued on', async ({ app, page }) => {
    await app.open({ seed: KEY });
    await app.tab('intake');
    app.groq.handler = () => chat({ items: [{ name: 'Granola bar', serving: '1 bar', per_serving: {
      kcal: '1046 kJ / 250 kcal', protein: '4g', carbs: '20-25g', fat: '3,5 g', satFat: '1g (5%)',
      transFat: 0, sugar: '12 g', addedSugar: '10g (20% DV)', fiber: '<1g', sodium: '140mg (6%)' } }, null] });
    await page.click('[data-act="describe"]');
    await page.fill('#inDescribe', 'a granola bar');
    await page.click('[data-sa="estimate"]');
    const val = k => page.locator(`#intakeSheet [data-n="${k}"]`);
    await expect(val('kcal')).toHaveValue('250');
    await expect(val('sodium')).toHaveValue('140');
    await expect(val('addedSugar')).toHaveValue('10');
    await expect(val('satFat')).toHaveValue('1');
    await expect(val('fat')).toHaveValue('3.5');
    await expect(val('fiber')).toHaveValue('0');
    await expect(val('carbs')).toHaveValue('');         // a range: left blank, not guessed
    await expect(val('cholesterol')).toHaveValue('');   // left out by the model: blank, not a confident 0
    await expect(page.locator('#intakeSheet .in-item')).toHaveCount(1);   // the null item is skipped, not a crash
  });
});

test.describe('what the Coach is told', () => {
  test('a barbell lift with no card weight isn’t called bodyweight', async ({ app, page }) => {
    await app.open();
    const prompt = await page.evaluate(() => buildCoachSystemPrompt());
    expect(prompt).toContain('Barbell Bench Press: 4×5-8 @ weight not set on the card');
    expect(prompt).not.toMatch(/Bench Press[^\n]*@ (bodyweight|bw)\b/);
    expect(prompt).toMatch(/Dead Bug[^\n]*@ bodyweight/);
  });

  test('recent sessions list the sets as logged, and mark a deload', async ({ app, page }) => {
    const hist = { '2026-06-08': { date: '2026-06-08', dayIdx: 1, type: 'push', label: 'Push Day', dayName: 'MONDAY', week: 4, deload: true,
      exercises: [{ id: 'm1', name: 'Barbell Bench Press', sets: 4, reps: '5-8', weight: '65 lbs',
        log: [{ reps: 8, lbs: 65 }, { reps: 8, lbs: 65 }, { reps: 7, lbs: 65 }, { reps: null, lbs: 65 }] }] } };
    await app.open({ seed: { 'wt-history': hist } });
    const prompt = await page.evaluate(() => buildCoachSystemPrompt());
    expect(prompt).toContain('2026-06-08 — PUSH — 4/');
    expect(prompt).toContain('deload week (65%, lighter on purpose)');
    expect(prompt).toContain('Barbell Bench Press: 8·8·7·? reps at 65 lbs (4/4 sets)');
  });

  test('a calorie target the user typed isn’t explained with the formula', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 25, goalBf: 15 }, 'wt-weighins': { '2026-06-15': 200 }, 'wt-intake-targets': { kcal: 1500 } } });
    const prompt = await page.evaluate(() => buildCoachSystemPrompt());
    expect(prompt).toContain('DAILY TARGETS: 1,500 kcal');
    expect(prompt).toContain('1,500 kcal is the user\'s own number, not calculated. The app calculated');
    expect(prompt).toContain('SET BY THE USER: calories.');
    expect(prompt).not.toContain('WHY THESE CALORIES');
    expect(prompt).not.toMatch(/weeks at ~/);
  });

  test('without typed targets, the formula’s reason is given as before', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 25, goalBf: 15 }, 'wt-weighins': { '2026-06-15': 200 } } });
    const prompt = await page.evaluate(() => buildCoachSystemPrompt());
    expect(prompt).toContain('WHY THESE CALORIES');
    expect(prompt).toMatch(/weeks at ~/);
    expect(prompt).not.toContain('SET BY THE USER');
  });
});

test.describe('Coach replies that stop early', () => {
  const reply = (content, finish_reason) => ({ json: { choices: [{ finish_reason, message: { role: 'assistant', content } }] } });
  async function send(app, page, r) {
    app.groq.handler = () => r;
    await app.tab('coach');
    if (await page.locator('.coach-new-btn').isVisible()) await page.click('.coach-new-btn');
    await page.fill('.coach-inp', 'write me a full meal plan');
    await page.click('.coach-send-btn');
    const bubble = page.locator('.coach-msg.ai .coach-bubble').last();
    await expect(bubble).toBeVisible();
    return bubble;
  }

  test('a cut-off answer is kept and marked as cut off', async ({ app, page }) => {
    await app.open({ seed: KEY });
    const bubble = await send(app, page, reply('| Meal | kcal |\n| Breakfast | 50', 'length'));
    await expect(bubble).toContainText('Cut off — ask it to continue.');
  });

  test('an empty answer says it ran out of room, not that the key is wrong', async ({ app, page }) => {
    await app.open({ seed: KEY });
    const bubble = await send(app, page, reply('', 'length'));
    await expect(bubble).toContainText('ran out of room');
    await expect(bubble).not.toContainText('API key');
  });

  test('a rejected key still says so', async ({ app, page }) => {
    await app.open({ seed: KEY });
    const bubble = await send(app, page, { status: 401, json: {} });
    await expect(bubble).toContainText('Groq rejected your API key');
  });
});
