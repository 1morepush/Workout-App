// v1.10: reps in one tap, and Undo for anything that takes logged sets away.

const { test, expect } = require('./fixtures');

const TODAY = '2026-06-15';   // Monday, push day
const firstCard = page => page.locator('[data-card]').first();
const dot = (page, i) => firstCard(page).locator('.dot').nth(i);
const log = async app => ((await app.storage('wt-history')) || {})[TODAY]?.exercises[0].log;

test.describe('reps in one tap', () => {
  test('a new set opens its reps buttons — the plan’s range and two either side — with nothing picked', async ({ app, page }) => {
    await app.open();
    await dot(page, 0).click();
    const pick = firstCard(page).locator('.rep-pick');
    await expect(pick.locator('.rep-pick-lbl')).toHaveText('Set 1 · reps');
    await expect(pick.locator('.rep-pick-btn')).toHaveText(['3', '4', '5', '6', '7', '8', '9', '10', '#', '✕']);   // bench is 5-8
    expect((await log(app))[0].reps).toBeNull();
    await pick.locator('[data-rep-pick="7"]').click();
    expect((await log(app))[0].reps).toBe(7);
    await expect(firstCard(page).locator('.rep-pick')).toHaveCount(0);
    await expect(firstCard(page).locator('.reps-chip')).toHaveText(['7']);
  });

  test('skipping the buttons leaves the reps not logged, and the next set gets its own', async ({ app, page }) => {
    await app.open();
    await dot(page, 0).click();
    await dot(page, 1).click();
    await expect(firstCard(page).locator('.rep-pick-lbl')).toHaveText('Set 2 · reps');
    expect((await log(app)).map(s => s.reps)).toEqual([null, null]);
  });

  test('a reps chip opens that set’s buttons; tapping it again closes them', async ({ app, page }) => {
    await app.open();
    await dot(page, 0).click();
    await dot(page, 1).click();
    await firstCard(page).locator('[data-rep-pick="close"]').click();
    await firstCard(page).locator('.reps-chip').first().click();
    await expect(firstCard(page).locator('.rep-pick-lbl')).toHaveText('Set 1 · reps');
    await firstCard(page).locator('.reps-chip').first().click();
    await expect(firstCard(page).locator('.rep-pick')).toHaveCount(0);
  });

  test('last time’s reps for the same set are shown, as history', async ({ app, page }) => {
    const hist = { '2026-06-08': { date: '2026-06-08', dayIdx: 1, type: 'push', label: 'Push Day', dayName: 'MONDAY', week: 1, deload: false,
      exercises: [{ id: 'm1', name: 'Barbell Bench Press', sets: 4, reps: '5-8', weight: '100 lbs',
        log: [{ reps: 8, lbs: 100 }, { reps: 7, lbs: 100 }] }] } };
    await app.open({ seed: { 'wt-history': hist } });
    await dot(page, 0).click();
    await expect(firstCard(page).locator('.rep-pick-hd .rep-pick-last')).toHaveText('last time: 8 @ 100 lbs');
    await dot(page, 1).click();
    await expect(firstCard(page).locator('.rep-pick-hd .rep-pick-last')).toHaveText('last time: 7 @ 100 lbs');
  });
});

test.describe('Undo', () => {
  test('tapping an earlier dot clears later sets — Undo brings them back with their reps', async ({ app, page }) => {
    await app.open();
    for (let i = 0; i < 3; i++) { await dot(page, i).click(); await firstCard(page).locator('[data-rep-pick="' + (8 - i) + '"]').click(); }
    await dot(page, 1).click();   // back to one set
    await expect(page.locator('#undoMsg')).toHaveText('2 sets of Barbell Bench Press cleared');
    expect((await log(app)).map(s => s.reps)).toEqual([8]);
    await page.click('#undoBtn');
    expect((await log(app)).map(s => s.reps)).toEqual([8, 7, 6]);
    await expect(firstCard(page).locator('.reps-chip')).toHaveText(['8', '7', '6']);
    await expect(page.locator('#undoBar')).toBeHidden();
  });

  test('the Undo offer goes after a few seconds', async ({ app, page }) => {
    await app.open();
    await dot(page, 0).click();
    await dot(page, 1).click();
    await dot(page, 0).click();
    await expect(page.locator('#undoBar')).toBeVisible();
    await page.clock.runFor(6_100);
    await expect(page.locator('#undoBar')).toBeHidden();
  });

  test('Reset can be undone', async ({ app, page }) => {
    await app.open();
    await dot(page, 0).click();
    await dot(page, 1).click();
    await page.click('#fabReset');
    await page.click('#resetYes');
    await expect(page.locator('#undoMsg')).toHaveText('Today reset');
    expect(await app.storage('wt-history')).toEqual({});
    await page.click('#undoBtn');
    expect(await log(app)).toHaveLength(2);
    await expect(firstCard(page).locator('.dot.done')).toHaveCount(2);
  });

  test('deleting an exercise takes its sets with it, and Undo brings back both', async ({ app, page }) => {
    await app.open();
    await dot(page, 0).click();
    const id = await firstCard(page).getAttribute('data-card');
    await firstCard(page).locator('[data-tog]').click();
    await page.click('[data-del="' + id + '"]');
    await expect(page.locator('#undoMsg')).toHaveText('Barbell Bench Press deleted');
    await expect(page.locator('[data-card="' + id + '"]')).toHaveCount(0);
    await page.click('#undoBtn');
    await expect(page.locator('[data-card="' + id + '"]')).toHaveCount(1);
    expect(await log(app)).toHaveLength(1);
    expect((await app.storage('wt-plans'))[1].exercises[0].id).toBe(id);
  });

  test('lowering Sets below what was logged can be undone', async ({ app, page }) => {
    await app.open();
    for (let i = 0; i < 3; i++) await dot(page, i).click();
    await firstCard(page).locator('[data-tog]').click();
    await page.fill('.edit-form.open [data-f="sets"]', '1');
    await page.click('.edit-form.open [data-sv]');
    await expect(page.locator('#undoMsg')).toHaveText('2 sets of Barbell Bench Press cleared');
    await page.click('#undoBtn');
    expect(await log(app)).toHaveLength(3);
    expect((await app.storage('wt-plans'))[1].exercises[0].sets).toBe(4);
  });

  test('Delete Session in History can be undone', async ({ app, page }) => {
    await app.open();
    await dot(page, 0).click();
    await app.tab('history');
    await page.locator('.hist-card').first().click();
    await page.getByRole('button', { name: 'Delete Session' }).click();
    await expect(page.locator('#undoMsg')).toHaveText('Session on Jun 15 deleted');
    await expect(page.locator('.hist-card')).toHaveCount(0);
    await page.click('#undoBtn');
    await expect(page.locator('.hist-card')).toHaveCount(1);
    expect(await log(app)).toHaveLength(1);
  });
});

test('tapping a dot on and off leaves no empty session behind', async ({ app, page }) => {
  await app.open();
  await dot(page, 0).click();
  await dot(page, 0).click();
  expect(await app.storage('wt-history')).toEqual({});
  await app.tab('history');
  await expect(page.locator('.hist-card')).toHaveCount(0);
});
