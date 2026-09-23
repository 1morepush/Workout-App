// The Train tab: logging sets, the rest timer, reset, and the controls around them.

const { test, expect } = require('./fixtures');

const dot = (page, card, i) => page.locator('[data-card]').nth(card).locator('.dot').nth(i);

test('tapping dots logs sets, and tapping a done dot takes it back', async ({ app, page }) => {
  await app.open();
  for (let i = 0; i < 3; i++) await dot(page, 0, i).click();
  await expect(page.locator('#setsCount')).toHaveText(/^3 \/ \d+$/);
  await dot(page, 0, 2).click();
  await expect(page.locator('#setsCount')).toHaveText(/^2 \/ \d+$/);
  const exId = await page.locator('[data-card]').first().getAttribute('data-card');
  expect((await app.storage('wt-done'))['2026-06-15'][exId]).toBe(2);
  expect((await app.storage('wt-history'))['2026-06-15'].doneSets).toBe(2);
});

test('sets can be logged on an earlier day, under that day’s date', async ({ app, page }) => {
  await app.open({ time: '2026-06-17T10:00:00-04:00' });   // Wednesday
  await page.click('.day-pill[data-day="1"]');              // Monday
  await expect(page.locator('#heroLabel')).toHaveText('MONDAY');
  await dot(page, 0, 0).click();
  expect(Object.keys(await app.storage('wt-done'))).toEqual(['2026-06-15']);
  expect(Object.keys(await app.storage('wt-history'))).toEqual(['2026-06-15']);
});

test('reset clears the day from both logged sets and History', async ({ app, page }) => {
  await app.open();
  await dot(page, 0, 0).click();
  await dot(page, 0, 1).click();
  await page.click('#fabReset');
  await page.click('#resetYes');
  expect(await app.storage('wt-done')).toEqual({});
  expect(await app.storage('wt-history')).toEqual({});
  await expect(page.locator('#setsCount')).toHaveText(/^0 \/ /);
});

test('the rest timer keeps wall-clock time when the phone sleeps', async ({ app, page }) => {
  await app.open();
  await page.clock.pauseAt(new Date('2026-06-15T10:00:05-04:00'));
  await dot(page, 0, 0).click();                                   // logging today starts the timer
  expect(await page.evaluate(() => timer.active)).toBe(true);
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => timer.secs)).toBe(88);
  // Screen locked for a minute: the page's intervals don't run, but the clock moves.
  await page.clock.setSystemTime(new Date('2026-06-15T10:01:07-04:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(await page.evaluate(() => timer.secs)).toBe(28);          // a counter would still say ~88
  await page.clock.runFor(29_000);
  expect(await page.evaluate(() => ({ active: timer.active, iv: timer.iv }))).toEqual({ active: false, iv: null });
});

test('the rest timer does not start when logging a past day', async ({ app, page }) => {
  await app.open({ time: '2026-06-17T10:00:00-04:00' });
  await page.click('.day-pill[data-day="1"]');
  await dot(page, 0, 0).click();
  expect(await page.evaluate(() => timer.active)).toBe(false);
});

test('editing a weight twice opens one editor each time', async ({ app, page }) => {
  await app.open();
  const chip = () => page.locator('[data-card]').first().locator('[data-wt]');
  await chip().click();
  await page.locator('.wt-input').fill('105 lbs');
  await page.locator('.wt-input').press('Enter');
  await expect(chip()).toHaveText('105 lbs');
  await chip().click();
  await expect(page.locator('.wt-input')).toHaveCount(1);
});

async function swipe(page, dx) {
  await page.evaluate(dx => {
    const app = document.getElementById('app');
    const mk = x => new Touch({ identifier: 1, target: app, clientX: x, clientY: 400 });
    app.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(300)], changedTouches: [mk(300)], bubbles: true }));
    app.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(300 + dx)], bubbles: true }));
  }, dx);
}

test('swiping changes day on Train, and nowhere else', async ({ app, page }) => {
  await app.open();
  await swipe(page, -120);
  expect(await page.evaluate(() => viewDay)).toBe(2);
  for (const t of ['coach', 'meal', 'history', 'intake']) {
    await app.tab(t);
    await swipe(page, -120);
    expect(await page.evaluate(() => viewDay), `swipe on ${t}`).toBe(2);
  }
});

test('the last card on every training day scrolls clear of the floating buttons', async ({ app, page }) => {
  await app.open();
  for (const day of [1, 2, 3, 5, 6]) {
    const r = await page.evaluate(d => {
      goDay(d); window.scrollTo(0, document.body.scrollHeight);
      const cards = document.querySelectorAll('[data-card]');
      return { last: cards[cards.length - 1].getBoundingClientRect().bottom,
               fab: document.getElementById('fabWrap').getBoundingClientRect().top };
    }, day);
    expect(r.last, `day ${day}`).toBeLessThanOrEqual(r.fab);
  }
});
