// What's new: the version you're running, and whether you've seen its notes.

const { test, expect } = require('./fixtures');

test('a new release is flagged until you open its notes, then stays read', async ({ app, page }) => {
  await app.open();
  const version = await page.evaluate(() => APP_VERSION);
  await expect(page.locator('.nav-tab[data-tab="history"]')).toHaveClass(/has-new/);
  await app.tab('history');
  await expect(page.locator('.ver-btn')).toHaveText(version + ' · NEW');
  await page.click('.ver-btn');
  await expect(page.locator('#notesOverlay')).toHaveClass(/open/);
  await expect(page.locator('#notesBody .rel').first()).toContainText('This phone');
  await expect(page.locator('.nav-tab[data-tab="history"]')).not.toHaveClass(/has-new/);
  await expect(page.locator('.ver-btn')).toHaveText(version);
  await page.reload();
  await expect(page.locator('.nav-tab[data-tab="history"]')).not.toHaveClass(/has-new/);
});

test('every release is listed, and the App Updates card names the one running', async ({ app, page }) => {
  await app.open();
  const r = await page.evaluate(() => ({ n: RELEASES.length, v: APP_VERSION, name: RELEASES[0].name }));
  await app.tab('history');
  await expect(page.locator('#historyView')).toContainText(`Running ${r.v} · ${r.name} ·`);
  await page.getByRole('button', { name: 'WHAT’S NEW', exact: true }).click();
  await expect(page.locator('#notesBody .rel')).toHaveCount(r.n);
});

test('an older phone that saw the previous release gets the dot', async ({ app, page }) => {
  await app.open({ seed: { 'wt-seen-version': '1.0' } });
  await expect(page.locator('.nav-tab[data-tab="history"]')).toHaveClass(/has-new/);
});
