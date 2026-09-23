// Weekly check: is Groq retiring a model this app uses?
//
// Groq shut down llama-3.1-8b-instant on 2026-08-16 and the Coach failed for
// weeks before anyone noticed. This reads the model ids out of index.html and
// checks them against Groq's own pages. If one is listed for shutdown, or has
// vanished from the models list, it opens an issue naming the date and Groq's
// recommended replacement. It never swaps the model itself: a replacement can
// need different request settings (gpt-oss needed reasoning params), and that
// wants a person and the test suite, not a find-and-replace.
//
// If Groq's pages can't be fetched or no longer look the way this expects, the
// run fails, so GitHub emails the owner instead of reporting a false all-clear.

const fs = require('fs');
const path = require('path');

const DEPRECATIONS = 'https://console.groq.com/docs/deprecations';
const MODELS = 'https://console.groq.com/docs/models';

// Which constant in index.html holds which model, and what uses it.
const USES = {
  COACH_MODEL:  'the AI Coach',
  INTAKE_MODEL: 'label scanning and meal estimates on the Intake tab',
};

function appModels(html) {
  const out = {};
  for (const name of Object.keys(USES)) {
    const m = html.match(new RegExp('const\\s+' + name + '\\s*=\\s*[\'"]([^\'"]+)[\'"]'));
    if (!m) throw new Error(name + ' not found in index.html — the check needs updating');
    out[name] = m[1];
  }
  return out;
}

function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/\\n|\s+/g, ' ');
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Groq's tables read "<deprecated model> <shutdown date> <replacement>". A model
// that only appears as someone else's replacement is not being retired — the
// current Coach model is listed that way today — so match the model followed
// by a date, never the name alone.
function findDeprecation(text, model) {
  const m = text.match(new RegExp('(?:^|\\s)' + esc(model) + '\\s+(\\d{2}/\\d{2}/\\d{2,4})\\s+(\\S+(?:\\s+or\\s+\\S+)?)'));
  return m ? { shutdown: m[1], replacement: m[2] } : null;
}

function isListed(text, model) {
  return new RegExp('(?:^|\\s)' + esc(model) + '(?:\\s|$)').test(text);
}

async function fetchText(url) {
  let res;
  try { res = await fetch(url, { headers: { 'user-agent': 'Workout-App model check (GitHub Actions)' } }); }
  catch (e) { throw new Error('Could not reach ' + url + ': ' + e.message); }
  if (!res.ok) throw new Error(url + ' returned HTTP ' + res.status);
  return pageText(await res.text());
}

function findings(models, depText, modelsText) {
  const out = [];
  for (const [name, id] of Object.entries(models)) {
    const dep = findDeprecation(depText, id);
    if (dep) out.push({ name, id, kind: 'retiring', ...dep });
    else if (!isListed(modelsText, id)) out.push({ name, id, kind: 'unlisted' });
  }
  return out;
}

function issueFor(f) {
  const title = f.kind === 'retiring'
    ? 'Groq is shutting down ' + f.id + ' (' + f.shutdown + ') — used by ' + USES[f.name]
    : 'Groq no longer lists ' + f.id + ' — used by ' + USES[f.name];
  const body = [
    f.kind === 'retiring'
      ? '**' + f.id + '** is on [Groq\'s deprecation list](' + DEPRECATIONS + ') with a shutdown date of **' + f.shutdown + '**. Groq recommends **' + f.replacement + '** instead.'
      : '**' + f.id + '** no longer appears on [Groq\'s models page](' + MODELS + '). It may already be shut down, or renamed.',
    '',
    'It is `' + f.name + '` in `index.html` and powers ' + USES[f.name] + '. When Groq shuts it down, that feature stops working.',
    '',
    '**To fix:** ask Claude Code something like *"Groq is retiring ' + f.id + (f.replacement ? '; switch ' + f.name + ' to ' + f.replacement : '; find its replacement') + ' and verify it."* Check the new model\'s docs for different request settings — the move to `openai/gpt-oss-20b` needed reasoning parameters or replies came back empty. Then update the retired-model list in `tests/specs/guards.spec.js`.',
    '',
    '_Opened by the weekly Groq model check (`.github/workflows/groq-models.yml`)._',
  ].join('\n');
  return { title, body };
}

async function openIssue(repo, token, issue) {
  const api = 'https://api.github.com/repos/' + repo + '/issues';
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'groq-model-check' };
  const open = await (await fetch(api + '?state=open&per_page=100', { headers })).json();
  if (Array.isArray(open) && open.some(i => i.title === issue.title)) { console.log('Already open: ' + issue.title); return; }
  const res = await fetch(api, { method: 'POST', headers, body: JSON.stringify(issue) });
  if (!res.ok) throw new Error('Could not open issue: HTTP ' + res.status + ' ' + await res.text());
  console.log('Opened: ' + (await res.json()).html_url);
}

async function main() {
  const models = appModels(fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8'));
  console.log('App uses: ' + Object.entries(models).map(([k, v]) => k + '=' + v).join(', '));
  const [depText, modelsText] = await Promise.all([fetchText(DEPRECATIONS), fetchText(MODELS)]);
  // If Groq reshapes these pages, a silent "all clear" would be worse than a failure.
  if (!/Shutdown Date/i.test(depText)) throw new Error('Deprecations page no longer has a "Shutdown Date" column — the check needs updating');
  if (!/Model ID/i.test(modelsText)) throw new Error('Models page no longer has a "Model ID" column — the check needs updating');

  const found = findings(models, depText, modelsText);
  if (!found.length) { console.log('All clear: neither model is being retired.'); return; }
  for (const f of found) {
    const issue = issueFor(f);
    console.log('FOUND: ' + issue.title);
    if (process.env.GITHUB_TOKEN && process.env.REPO) await openIssue(process.env.REPO, process.env.GITHUB_TOKEN, issue);
    else console.log('(dry run — no GITHUB_TOKEN)\n\n' + issue.body);
  }
}

module.exports = { appModels, pageText, findDeprecation, isListed, findings, issueFor };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
