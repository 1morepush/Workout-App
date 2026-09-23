// The AI Coach: what it sends Groq, what it shows, and what it is told about the plan.

const { test, expect, chat } = require('./fixtures');

async function ask(app, page, question, reply = 'Sounds good.', extra) {
  app.groq.handler = () => chat(reply, extra);
  await app.tab('coach');
  if (await page.locator('.coach-new-btn').isVisible()) await page.click('.coach-new-btn');
  await page.fill('.coach-inp', question);
  await page.click('.coach-send-btn');
  await expect(page.locator('.coach-msg.ai .coach-bubble').last()).toBeVisible();
}

const KEY = { 'wt-coach-key': 'gsk_test' };

test('uses a live Groq model, keeps reasoning out of the reply', async ({ app, page }) => {
  await app.open({ seed: KEY });
  await ask(app, page, 'hi', 'The answer.', { reasoning: 'PRIVATE CHAIN OF THOUGHT' });
  const req = app.groq.lastRequest();
  expect(req).toMatchObject({ model: 'openai/gpt-oss-20b', reasoning_effort: 'low', include_reasoning: false, max_completion_tokens: 1536 });
  expect(req).not.toHaveProperty('max_tokens');
  await expect(page.locator('.coach-msg.ai .coach-bubble')).toHaveText('The answer.');
  await expect(page.locator('#coachView')).not.toContainText('PRIVATE');
});

test('is told the plan’s targets and reasons, and to explain rather than invent', async ({ app, page }) => {
  await app.open({ seed: { ...KEY, 'wt-calc-week': 6 } });   // Monday, push day
  await ask(app, page, 'what should I bench?');
  const system = app.groq.lastRequest().messages[0].content;
  expect(system).toContain('Do not invent different numbers');
  expect(system).toContain('double progression');
  expect(system).toContain('Barbell Bench Press: 4×5-8 @');
  expect(system).toContain('plan target 100 lbs (Phase 2 (Intensification): the plan’s 95 lbs start + 1 × 5 lbs.)');
  expect(system).toContain('TRAINING WEEK: 6 of 12 — Phase 2 (Intensification');
  expect(system).not.toMatch(/Foundation|Peak\/Deload/);
});

test('model output is shown as text, never run as HTML', async ({ app, page }) => {
  await app.open({ seed: KEY });
  await ask(app, page, 'hi', '<img src=x onerror="window.__pwned=1">bold?');
  await expect(page.locator('.coach-msg.ai .coach-bubble')).toHaveText('<img src=x onerror="window.__pwned=1">bold?');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('a conversation is saved, listed, reopened and deleted', async ({ app, page }) => {
  await app.open({ seed: KEY });
  await ask(app, page, 'Is a deload worth it?', 'Yes.');
  await page.click('.coach-back-btn');
  await expect(page.locator('.coach-session-item')).toHaveCount(1);
  await expect(page.locator('.coach-session-preview')).toHaveText('Is a deload worth it?');
  await page.click('.coach-session-item');
  await expect(page.locator('.coach-msg')).toHaveCount(2);
  await page.click('.coach-back-btn');
  await page.click('.coach-session-del');
  await expect(page.locator('.coach-session-item')).toHaveCount(0);
});

test('a Groq error is shown, and the send button comes back', async ({ app, page }) => {
  await app.open({ seed: KEY });
  await app.tab('coach');
  await page.click('.coach-new-btn');
  app.groq.handler = () => ({ status: 401, json: { error: { message: 'Invalid API Key' } } });
  await page.fill('.coach-inp', 'hi');
  await page.click('.coach-send-btn');
  await expect(page.locator('.coach-msg.ai .coach-bubble')).toContainText('Invalid API Key');
  await expect(page.locator('.coach-send-btn')).toBeEnabled();
});
