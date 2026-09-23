// The weekly Groq model check (.github/scripts/check-groq-models.js). Plain
// functions, no browser: the text below is how Groq's pages read once tags are
// stripped, including the trap — the current Coach model listed as a replacement.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const check = require('../../.github/scripts/check-groq-models.js');

const DEP = check.pageText(`
  <h2>Deprecations</h2><table>
  <tr><th>Model</th><th>Shutdown Date</th><th>Recommended Replacement Model ID</th></tr>
  <tr><td>llama-3.1-8b-instant</td><td>08/16/26</td><td>openai/gpt-oss-20b</td></tr>
  <tr><td>llama-3.3-70b-versatile</td><td>08/16/26</td><td>openai/gpt-oss-120b or qwen/qwen3.6-27b</td></tr>
  </table>`);
const MODELS = check.pageText('<table><tr><th>Model ID</th></tr><tr><td>openai/gpt-oss-20b</td></tr><tr><td>qwen/qwen3.8-27b</td></tr></table>');

test('a retiring model is found with its date and replacement', () => {
  expect(check.findDeprecation(DEP, 'llama-3.1-8b-instant')).toEqual({ shutdown: '08/16/26', replacement: 'openai/gpt-oss-20b' });
  expect(check.findDeprecation(DEP, 'llama-3.3-70b-versatile')).toEqual({ shutdown: '08/16/26', replacement: 'openai/gpt-oss-120b or qwen/qwen3.6-27b' });
});

test('a model that is only someone else’s replacement is not retiring', () => {
  expect(check.findDeprecation(DEP, 'openai/gpt-oss-20b')).toBeNull();
  expect(check.findDeprecation(DEP, 'openai/gpt-oss-120b')).toBeNull();
  // a longer id containing ours is a different model
  expect(check.findDeprecation(check.pageText('<td>xopenai/gpt-oss-20b</td><td>09/01/26</td><td>y</td>'), 'openai/gpt-oss-20b')).toBeNull();
});

test('reads the app’s real model constants, and finds nothing wrong with them today', () => {
  const models = check.appModels(fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8'));
  expect(Object.keys(models)).toEqual(['COACH_MODEL', 'INTAKE_MODEL']);
  expect(check.findings(models, DEP, MODELS)).toEqual([]);
});

test('a model gone from the models page is reported even with no deprecation entry', () => {
  const f = check.findings({ INTAKE_MODEL: 'qwen/qwen3.8-27b' }, DEP, check.pageText('<td>Model ID</td><td>openai/gpt-oss-20b</td>'));
  expect(f).toEqual([{ name: 'INTAKE_MODEL', id: 'qwen/qwen3.8-27b', kind: 'unlisted' }]);
  expect(check.issueFor(f[0]).title).toBe('Groq no longer lists qwen/qwen3.8-27b — used by label scanning and meal estimates on the Intake tab');
});

test('the issue names the date, the replacement, the constant and the guard list', () => {
  const [f] = check.findings({ COACH_MODEL: 'llama-3.1-8b-instant' }, DEP, MODELS);
  const { title, body } = check.issueFor(f);
  expect(title).toBe('Groq is shutting down llama-3.1-8b-instant (08/16/26) — used by the AI Coach');
  expect(body).toContain('Groq recommends **openai/gpt-oss-20b** instead');
  expect(body).toContain('`COACH_MODEL` in `index.html`');
  expect(body).toContain('tests/specs/guards.spec.js');
});

test('a missing constant is an error, not an all-clear', () => {
  expect(() => check.appModels('const COACH_MODEL = "x";')).toThrow('INTAKE_MODEL not found');
});
