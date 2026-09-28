// v1.9.3: things that were wrong on the phone — buttons where they don't
// belong, lost taps, silent timers, blank rows and replies in the wrong chat.

const { test, expect, source } = require('./fixtures');

const dot = (page, card, i) => page.locator('[data-card]').nth(card).locator('.dot').nth(i);
const KEY = { 'wt-coach-key': 'gsk_test' };

test.describe('Train', () => {
  test('the add/reset buttons stay off History after a session is deleted there', async ({ app, page }) => {
    await app.open();
    await dot(page, 0, 0).click();
    await app.tab('history');
    await page.locator('.hist-card').first().click();
    await page.getByRole('button', { name: 'Delete Session' }).click();
    await expect(page.locator('#fabWrap')).toBeHidden();
    await app.tab('train');
    await expect(page.locator('#fabWrap')).toBeVisible();
  });

  test('Reset names the day it will clear', async ({ app, page }) => {
    await app.open({ time: '2026-06-17T10:00:00-04:00' });   // Wednesday
    await page.click('#fabReset');
    await expect(page.locator('#resetSub')).toHaveText('Clear all logged sets for today?');
    await page.click('#resetNo');
    await page.click('.day-pill[data-day="1"]');
    await page.click('#fabReset');
    await expect(page.locator('#resetSub')).toHaveText('Clear all logged sets for MON, JUN 15?');
  });

  test('the end of a rest beeps and says so, not just a vibration iPhones ignore', async ({ app, page }) => {
    await app.open();
    await page.evaluate(() => {
      window.__beeps = 0;
      const make = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () { window.__beeps++; return make.call(this); };
    });
    await dot(page, 0, 0).click();
    await page.clock.runFor(91_000);
    const btn = page.locator('[data-card]').first().locator('.rest-btn');
    await expect(btn).toHaveText(/REST OVER/);
    expect(await page.evaluate(() => window.__beeps)).toBe(3);
    await page.clock.runFor(4_500);
    await expect(btn).toHaveText(/REST 90S/);
  });

  test('all seven day pills fit on the phone', async ({ app, page }) => {
    await app.open();
    const boxes = await page.locator('.day-pill').evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
    expect(boxes).toHaveLength(7);
    for (const right of boxes) expect(right).toBeLessThanOrEqual(390);
  });

  test('the rest button’s ⏱ is its small size, not the rest day’s 🌿', async ({ app, page }) => {
    await app.open();
    expect(await page.locator('.rest-btn .rest-icon').first().evaluate(e => getComputedStyle(e).fontSize)).toBe('13px');
  });
});

test.describe('History', () => {
  test('a past session can be edited by touch without the card closing', async ({ app, page }) => {
    await app.open();
    await dot(page, 0, 0).click();
    await app.tab('history');
    const card = page.locator('.hist-card').first();
    await card.click();
    await expect(card).toHaveClass(/expanded/);
    await card.getByRole('button', { name: 'Edit Session' }).click();
    await card.locator('.hist-ex-reps').first().click();
    await expect(card).toHaveClass(/expanded/);
    await card.locator('.hist-add-ex-inp').fill('Farmer Carry');
    await card.getByRole('button', { name: '+ Add' }).click();
    await expect(card).toHaveClass(/expanded/);
    await expect(card).toContainText('Farmer Carry');
  });

  test('“Last backed up” shows when it was', async ({ app, page }) => {
    await app.open({ seed: { 'wt-gh-token': 'ghp_test', 'wt-gh-gist-id': 'g1', 'wt-gh-last-sync': '2026-06-15T13:30:00.000Z' } });
    await app.tab('history');
    await expect(page.locator('#gistStatusVal')).toContainText('6/15/2026');
  });

  test('after a restore, History shows the restored sessions straight away', async ({ app, page }) => {
    const hist = { '2026-06-12': { date: '2026-06-12', dayIdx: 5, type: 'push', label: 'Push Day', dayName: 'FRIDAY',
      exercises: [{ id: 'f1', name: 'Barbell Bench Press', sets: 4, reps: '5-8', weight: '100 lbs', log: [{ reps: 8, lbs: 100 }] }] } };
    await app.open({ seed: { 'wt-gh-token': 'ghp_test', 'wt-gh-gist-id': 'g1', 'wt-gh-remote-at': 'T0' } });
    await page.route('https://api.github.com/**', r => r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ id: 'g1', updated_at: 'T0', files: { 'workout-data.json': { content: JSON.stringify({ 'wt-history': hist }) } } }) }));
    await app.tab('history');
    await expect(page.locator('.hist-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'RESTORE', exact: true }).click();
    await expect(page.locator('#syncMsg')).toHaveText('✓ Restored from GitHub');
    await expect(page.locator('.hist-card')).toHaveCount(1);
  });
});

test.describe('Intake', () => {
  test('Reset all in Targets shows the reset targets behind the sheet', async ({ app, page }) => {
    await app.open({ seed: { 'wt-intake-targets': { sodium: 1500 } } });
    await app.tab('intake');
    await expect(page.locator('.in-row', { hasText: 'Sodium' })).toContainText('/ 1,500mg');
    await page.click('[data-act="targets"]');
    await page.click('[data-sa="tgt-reset"]');
    await page.click('[data-sa="cancel"]');
    await expect(page.locator('.in-row', { hasText: 'Sodium' })).toContainText('/ 2,300mg');
  });

  test('a past weigh-in being retyped shows blank, not “null”', async ({ app, page }) => {
    await app.open({ seed: { 'wt-body': { bodyFat: 24 }, 'wt-weighins': { '2026-06-01': 190, '2026-06-03': 189.6, '2026-06-08': 189 } } });
    await app.tab('intake');
    await page.click('[data-act="body"]');
    await page.fill('[data-wi="2026-06-03"]', '');
    await page.locator('.in-seg-btn[data-key="pace"]:not(.on)').first().click();   // redraws the sheet
    await expect(page.locator('[data-wi="2026-06-03"]')).toHaveValue('');
    await expect(page.locator('.in-wi-row.is-odd')).toHaveCount(0);
  });
});

test.describe('Coach', () => {
  // Groq, answering only when the test says so.
  async function heldGroq(page) {
    const held = { release: null, sent: [] };
    const gate = new Promise(r => { held.release = r; });
    await page.route('https://api.groq.com/**', async route => {
      held.sent.push(JSON.parse(route.request().postData()));
      await gate;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Late answer.' } }] }) });
    });
    return held;
  }
  const OLD = { id: 'session_A', createdAt: '2026-06-10T12:00:00.000Z', preview: 'old question',
    messages: [{ role: 'user', text: 'old question' }, { role: 'ai', text: 'old answer' }] };

  test('a reply that arrives after you’ve switched chats goes to its own chat', async ({ app, page }) => {
    await app.open({ seed: { ...KEY, 'wt-coach-sessions': [OLD] } });
    const groq = await heldGroq(page);
    await app.tab('coach');
    await page.click('.coach-new-btn');
    await page.fill('.coach-inp', 'new question');
    await page.click('.coach-send-btn');
    await expect.poll(() => groq.sent.length).toBe(1);
    await page.click('.coach-back-btn');
    await page.locator('.coach-session-item', { hasText: 'old question' }).click();
    groq.release();
    await page.waitForTimeout(300);
    const sessions = await app.storage('wt-coach-sessions');
    expect(sessions.find(x => x.id === 'session_A').messages).toEqual(OLD.messages);
    const fresh = sessions.find(x => x.id !== 'session_A');
    expect(fresh.messages).toEqual([{ role: 'user', text: 'new question' }, { role: 'ai', text: 'Late answer.' }]);
    await expect(page.locator('.coach-msgs')).not.toContainText('Late answer.');
  });

  test('Clear while a reply is on its way leaves the chat empty', async ({ app, page }) => {
    await app.open({ seed: KEY });
    const groq = await heldGroq(page);
    await app.tab('coach');
    await page.click('.coach-new-btn');
    await page.fill('.coach-inp', 'question');
    await page.click('.coach-send-btn');
    await expect.poll(() => groq.sent.length).toBe(1);
    await page.click('.coach-clear-btn');
    groq.release();
    await page.waitForTimeout(300);
    const [only] = await app.storage('wt-coach-sessions');
    expect(only.messages).toEqual([]);
    await expect(page.locator('.coach-msgs')).not.toContainText('Late answer.');
  });

  test('replies keep their line breaks, and long links wrap inside the bubble', async ({ app, page }) => {
    await app.open({ seed: KEY });
    app.groq.handler = () => ({ json: { choices: [{ finish_reason: 'stop', message: { role: 'assistant',
      content: 'Day 1\nDay 2\nhttps://example.com/' + 'a'.repeat(120) } }] } });
    await app.tab('coach');
    await page.click('.coach-new-btn');
    await page.fill('.coach-inp', 'plan?');
    await page.click('.coach-send-btn');
    const bubble = page.locator('.coach-msg.ai .coach-bubble').last();
    await expect(bubble).toContainText('Day 2');
    const b = await bubble.evaluate(e => ({ ws: getComputedStyle(e).whiteSpace, over: e.scrollWidth > e.clientWidth + 1, lines: e.getClientRects()[0].height / parseFloat(getComputedStyle(e).lineHeight) }));
    expect(b.ws).toBe('pre-wrap');
    expect(b.over).toBe(false);
    expect(b.lines).toBeGreaterThan(3);
  });
});

test('the iPhone status bar and tap-to-zoom are allowed for in the stylesheet', () => {
  // Neither can be seen in desktop Chromium (no notch, no iOS zoom), so check the rules themselves.
  const css = source();
  for (const view of ['#historyView', '#mealView', '#intakeView']) {
    expect(css).toMatch(new RegExp(view + ' \\{[^}]*padding: calc\\(var\\(--safe-t\\)'));
  }
  expect(css).toMatch(/#coachView \{[^}]*padding-top: var\(--safe-t\)/);
  expect(css).toMatch(/@supports \(-webkit-touch-callout: none\) \{\s*input, textarea, select \{ font-size: 16px !important; \}/);
});
