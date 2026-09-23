// Shared setup for every spec.
//
//   app   — opens index.html at a fixed moment, fails the test on any page error
//   groq  — a fake Groq API: records what the app sends, answers with what the test says
//
// Nothing here talks to the real network. Groq and GitHub are intercepted, and
// Google Fonts are blocked so layout is the same locally and in CI.

const path = require('path');
const fs = require('fs');
const base = require('@playwright/test');

const INDEX = path.resolve(__dirname, '../../index.html');
const APP_URL = 'file://' + INDEX;

// Monday 15 June 2026, 10:00 in New York — a push day, so the Train tab has cards.
const DEFAULT_TIME = '2026-06-15T10:00:00-04:00';

const test = base.test.extend({
  groq: async ({ page }, use) => {
    const groq = {
      requests: [],
      // (body) => { status?, json } — set per test; unset means the test didn't expect a call
      handler: null,
      lastRequest() { return this.requests[this.requests.length - 1]; },
    };
    await page.route('https://api.groq.com/**', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      groq.requests.push(body);
      const reply = groq.handler
        ? groq.handler(body)
        : { status: 500, json: { error: { message: 'Test did not expect a Groq call' } } };
      await route.fulfill({ status: reply.status || 200, contentType: 'application/json', body: JSON.stringify(reply.json) });
    });
    await use(groq);
  },

  app: async ({ page, groq }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.route('https://api.github.com/**', r => r.abort());
    page.on('dialog', d => d.accept());   // confirm() prompts answer "yes"

    const app = {
      page, groq, errors,
      // Open the app at `time` (natural time flow from there). `seed` is written
      // to localStorage first, the way a returning user's phone would have it.
      async open({ time = DEFAULT_TIME, seed } = {}) {
        await page.clock.install({ time: new Date(time) });
        await page.goto(APP_URL);
        if (seed) {
          await page.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seed);
          await page.reload();
        }
        await page.waitForFunction(() => typeof renderMain === 'function' && document.getElementById('main'));
        return app;
      },
      tab(name) { return page.click(`.nav-tab[data-tab="${name}"]`); },
      storage(key) { return page.evaluate(k => JSON.parse(localStorage.getItem(k)), key); },
    };
    await use(app);
    base.expect(errors, 'the page threw').toEqual([]);
  },
});

// A Groq chat-completions reply carrying `content` (an object is sent as JSON text).
function chat(content, extra = {}) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return { json: { choices: [{ message: Object.assign({ role: 'assistant', content: text }, extra) }] } };
}

const source = () => fs.readFileSync(INDEX, 'utf8');

module.exports = { test, expect: base.expect, chat, source, APP_URL, DEFAULT_TIME };
