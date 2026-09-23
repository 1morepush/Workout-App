// Every tab opens and renders, on a first launch and for a returning user.

const { test, expect } = require('./fixtures');

const TABS = { train: '#main', meal: '#mealView', intake: '#intakeView', history: '#historyView', coach: '#coachView' };

test('every tab opens on a first launch', async ({ app, page }) => {
  await app.open();
  for (const [tab, view] of Object.entries(TABS)) {
    await app.tab(tab);
    await expect(page.locator(view), tab).toBeVisible();
    for (const [other, v] of Object.entries(TABS)) if (other !== tab) await expect(page.locator(v), `${other} hidden on ${tab}`).toBeHidden();
  }
});

test('every tab opens with a key set and data logged', async ({ app, page }) => {
  await app.open({ seed: { 'wt-coach-key': 'gsk_test' } });
  await page.locator('.dot').first().click();
  for (const tab of Object.keys(TABS)) {
    await app.tab(tab);
    await expect(page.locator(TABS[tab])).toBeVisible();
  }
  await expect(page.locator('#historyView')).toContainText('1 session logged');
});
