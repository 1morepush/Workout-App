// The Intake tab: scanning labels, describing meals, and flagging what to cut back on.

const { test, expect, chat } = require('./fixtures');

const KEY = { 'wt-coach-key': 'gsk_test' };

const RAMEN = { readable: true, name: 'Maruchan Ramen Noodle Soup', serving: '1/2 block (43g)',
  per_serving: { kcal: 190, protein: 4, carbs: 26, fat: 7, satFat: 3.5, transFat: 0, sugar: 1, addedSugar: 0, fiber: 1, sodium: 880, cholesterol: 0 } };
const BURGER_AND_FRIES = { items: [
  { name: 'Double cheeseburger', serving: '1 burger', per_serving: { kcal: 450, protein: 25, carbs: 34, fat: 24, satFat: 11, transFat: 1.5, sugar: 7, addedSugar: 6, fiber: 2, sodium: 1150, cholesterol: 80 } },
  { name: 'Large fries', serving: '1 large', per_serving: { kcal: 480, protein: 7, carbs: 65, fat: 23, satFat: 3, transFat: 0, sugar: 0, addedSugar: 0, fiber: 6, sodium: 400, cholesterol: 0 } },
] };

// A "phone photo": 3000×2000, well over the 1600px the app should shrink it to.
async function photo(page) {
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 3000, 2000);
    return c.toDataURL('image/png').split(',')[1]; });
  return { name: 'label.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

async function scan(app, page, reply) {
  app.groq.handler = () => reply;
  const file = await photo(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="scan"]')]);
  await chooser.setFiles(file);
}

async function describe(app, page, text, reply) {
  app.groq.handler = () => reply;
  await page.click('[data-act="describe"]');
  await page.fill('#inDescribe', text);
  await page.click('[data-sa="estimate"]');
}

async function manual(page, fields) {
  await page.click('[data-act="manual"]');
  for (const [k, v] of Object.entries(fields)) {
    await page.fill(k === 'name' ? '#intakeSheet [data-f="name"]' : `#intakeSheet [data-n="${k}"]`, String(v));
  }
  await page.click('[data-sa="commit"]');
}

test.describe('without a Groq key', () => {
  test('scanning explains the key, and manual entry still works', async ({ app, page }) => {
    await app.open();
    await app.tab('intake');
    await expect(page.locator('.in-hero-num')).toContainText('/ 1,905');   // summed from the meal plan
    await expect(page.locator('.in-add-btn.locked')).toHaveCount(2);
    await page.click('[data-act="scan"]');
    await expect(page.locator('#intakeSheet')).toContainText('Groq API key');
    await page.click('[data-sa="manual"]');
    await page.fill('#intakeSheet [data-f="name"]', 'Greek yogurt');
    await page.fill('#intakeSheet [data-n="kcal"]', '100');
    await expect(page.locator('#intakeSheet .in-live')).toContainText('100 kcal');
    await page.click('[data-sa="commit"]');
    await expect(page.locator('.in-entry')).toHaveCount(1);
    await expect(page.locator('.in-ok')).toBeVisible();
    expect(app.groq.requests).toHaveLength(0);
  });
});

test.describe('with a key', () => {
  test.beforeEach(async ({ app }) => { await app.open({ seed: KEY }); await app.tab('intake'); });

  test('a label photo is shrunk, read, reviewed and logged', async ({ app, page }) => {
    await scan(app, page, chat(RAMEN));
    await expect(page.locator('#intakeSheet [data-f="name"]')).toHaveValue('Maruchan Ramen Noodle Soup');
    const req = app.groq.lastRequest();
    expect(req).toMatchObject({ model: 'qwen/qwen3.8-27b', response_format: { type: 'json_object' }, reasoning_effort: 'none' });
    const url = req.messages[0].content.find(p => p.type === 'image_url').image_url.url;
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    const dims = await page.evaluate(u => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = u; }), url);
    expect(dims).toEqual([1600, 1067]);
    await expect(page.locator('#intakeSheet [data-n="sodium"]')).toHaveValue('880');
    await page.click('#intakeSheet [data-sa="step+"]');
    await page.click('#intakeSheet [data-sa="step+"]');
    await expect(page.locator('#intakeSheet [data-f="servings"]')).toHaveValue('2');
    await expect(page.locator('#intakeSheet .in-live')).toContainText('380 kcal');
    await page.click('[data-sa="commit"]');
    const row = page.locator('.in-entry').first();
    await expect(row).toContainText('LABEL');
    await expect(row).toContainText('2 × 1/2 block (43g)');
    await expect(row).toContainText('Sodium 77%');   // 1,760 of 2,300 mg
  });

  test('a described meal becomes one entry per food', async ({ app, page }) => {
    await describe(app, page, 'double cheeseburger and large fries', chat(BURGER_AND_FRIES));
    await expect(page.locator('#intakeSheet .in-item')).toHaveCount(2);
    await expect(page.locator('[data-sa="commit"]')).toHaveText('Add 2 foods');
    await page.click('[data-sa="commit"]');
    await expect(page.locator('.in-entry')).toHaveCount(2);
    await expect(page.locator('.in-entry').first()).toContainText('EST.');
    await expect(page.locator('.in-entry').first()).toContainText('1 large');
    await expect(page.locator('.in-entry').first()).not.toContainText('1 × 1 large');
  });

  test('flags: worst overage first with its sources, and foods to cut back on', async ({ app, page }) => {
    await manual(page, { name: 'Greek yogurt', kcal: 100, protein: 17, sodium: 60 });
    await scan(app, page, chat(RAMEN));
    await page.click('#intakeSheet [data-sa="step+"]'); await page.click('#intakeSheet [data-sa="step+"]');
    await page.click('[data-sa="commit"]');
    await describe(app, page, 'burger and fries', chat(BURGER_AND_FRIES));
    await page.click('[data-sa="commit"]');

    const tooMuch = page.locator('.in-alert', { hasText: 'Too much today' });
    await expect(tooMuch.locator('.in-over-row').first()).toContainText('Sodium');   // 147% beats fat's 127%
    await expect(tooMuch).toContainText('3,370mg / 2,300mg');
    await expect(tooMuch).toContainText('Mostly from Maruchan Ramen Noodle Soup 1,760mg');

    const avoid = page.locator('.in-alert', { hasText: 'Eat less of / avoid' });
    const burger = avoid.locator('.in-avoid-row', { hasText: 'Double cheeseburger' });
    await expect(burger).toContainText('Trans fat · avoid');
    await expect(burger).toContainText('Sat. fat 55%');
    await expect(avoid).not.toContainText('Greek yogurt');
    // names stay whole — three chips once squeezed this to "Doub…"
    const truncated = await avoid.locator('.in-avoid-name').evaluateAll(xs => xs.some(x => x.scrollWidth > x.clientWidth + 1));
    expect(truncated).toBe(false);
    await expect(page.locator('.in-row.state-over', { hasText: 'Sodium' })).toContainText('Over limit');
  });

  test('an entry can be edited and deleted', async ({ app, page }) => {
    await describe(app, page, 'burger and fries', chat(BURGER_AND_FRIES));
    await page.click('[data-sa="commit"]');
    await page.locator('.in-entry').first().click();
    await expect(page.locator('#intakeSheet .sheet-title')).toHaveText('Edit food');
    await page.click('#intakeSheet [data-sa="step-"]');
    await page.click('[data-sa="commit"]');
    await expect(page.locator('.in-entry').first()).toContainText('0.5 ×');
    await page.locator('.in-entry').first().click();
    await page.click('[data-sa="delete"]');
    await expect(page.locator('.in-entry')).toHaveCount(1);
  });

  test('a photo that isn’t a label says so, and offers another', async ({ app, page }) => {
    await scan(app, page, chat({ readable: false }));
    await expect(page.locator('.in-err')).toContainText('Couldn’t read a nutrition label');
    await expect(page.locator('[data-sa="rescan"]')).toBeVisible();
  });

  test('a rejected key says where to fix it', async ({ app, page }) => {
    await scan(app, page, { status: 401, json: { error: { message: 'Invalid API Key' } } });
    await expect(page.locator('.in-err')).toContainText('Update it in the Coach tab');
  });

  test('a label name from the model is shown as text, never run as HTML', async ({ app, page }) => {
    await scan(app, page, chat({ ...RAMEN, name: '<img src=x onerror="window.__pwned=1">Soup' }));
    await page.click('[data-sa="commit"]');
    await expect(page.locator('.in-entry-name').first()).toHaveText('<img src=x onerror="window.__pwned=1">Soup');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('targets: only what you change is stored, and the bars use it', async ({ app, page }) => {
    await page.click('[data-act="targets"]');
    await page.fill('[data-tgt="sodium"]', '1500');
    await page.click('[data-sa="tgt-save"]');
    expect(await app.storage('wt-intake-targets')).toEqual({ sodium: 1500 });
    await expect(page.locator('.in-row', { hasText: 'Sodium' })).toContainText('/ 1,500mg');
  });

  test('a forgotten food can be logged to yesterday; reopening lands on today', async ({ app, page }) => {
    await expect(page.locator('[data-act="next"]')).toBeDisabled();
    await page.click('[data-act="prev"]');
    await expect(page.locator('.in-date-lbl')).toContainText('Yesterday');
    await manual(page, { name: 'Protein bar', kcal: 200 });
    expect(Object.keys(await app.storage('wt-intake'))).toEqual(['2026-06-14']);
    await app.tab('history');
    await app.tab('intake');
    await expect(page.locator('.in-date-lbl')).toContainText('Today');
    await expect(page.locator('.in-chip', { hasText: 'Protein bar' })).toBeVisible();
  });
});

test('the review sheet’s Add button isn’t the rust warning colour on leg day', async ({ app, page }) => {
  await app.open({ time: '2026-06-17T10:00:00-04:00', seed: KEY });   // Wednesday = legs
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--day-color').trim())).toBe('#C8552A');
  await app.tab('intake');
  await page.click('[data-act="manual"]');
  await expect(page.locator('#intakeSheet .btn-confirm')).toHaveCSS('background-color', 'rgb(201, 168, 76)');
});
