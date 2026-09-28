// Offline support (sw.js) and installing the app (manifest.json + icons).
//
// Service workers don't run on file://, so these tests serve the repo over
// http under /Workout-App/ — the same path GitHub Pages uses — and "lose signal"
// by shutting the server down.

const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BASE = '/Workout-App/';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/manifest+json', '.png': 'image/png' };

function serve(override = {}) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith(BASE)) { res.writeHead(404); return res.end(); }
      p = p.slice(BASE.length) || 'index.html';
      if (override[p] != null) { res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'text/plain' }); return res.end(override[p]); }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: 'http://127.0.0.1:' + srv.address().port + BASE, override }));
  });
}
const stop = s => new Promise(r => { s.srv.closeAllConnections(); s.srv.close(r); });

async function openServed(page, url) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(url);
  await page.waitForFunction(() => typeof renderMain === 'function');
  // Ready, and in control of the page (clients.claim on activate).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  return errors;
}

test('once opened, the app opens again with no signal', async ({ page }) => {
  const s = await serve();
  const errors = await openServed(page, s.url);
  await stop(s);                                    // no signal
  await page.reload();
  await page.waitForFunction(() => typeof renderMain === 'function');
  await expect(page.locator('#heroDayType')).not.toBeEmpty();
  await expect(page.locator('[data-card]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('online, a new version is picked up on the next open — no stale app', async ({ page }) => {
  const s = await serve();
  await openServed(page, s.url);
  s.override['index.html'] = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('<title>TRAIN</title>', '<title>TRAIN NEXT</title>');
  await page.reload();
  await expect(page).toHaveTitle('TRAIN NEXT');
  await stop(s);
  await page.reload();                              // offline: the newest copy it saw
  await expect(page).toHaveTitle('TRAIN NEXT');
});

test('only the app’s own files are kept — Groq and GitHub go straight to the network', async ({ page }) => {
  const s = await serve();
  await openServed(page, s.url);
  await page.route(/api\.(groq|github)\.com/, r => r.fulfill({ contentType: 'application/json', body: '{"secret":"reply"}' }));
  await page.evaluate(() => Promise.all(['https://api.groq.com/openai/v1/models', 'https://api.github.com/gists'].map(u => fetch(u).then(r => r.text()))));
  const saved = await page.evaluate(async () => {
    const c = await caches.open('train-v1');
    return (await c.keys()).map(r => new URL(r.url).pathname);
  });
  expect(saved.every(p => p.startsWith('/Workout-App/'))).toBe(true);
  expect(saved).toEqual(expect.arrayContaining(['/Workout-App/', '/Workout-App/index.html', '/Workout-App/manifest.json']));
  await stop(s);
});

test('Check for Updates clears only this app’s saved copy, not other apps on github.io', async ({ page }) => {
  const s = await serve();
  await openServed(page, s.url);
  await page.evaluate(() => caches.open('other-app').then(c => c.put('/other', new Response('x'))));
  await page.click('.nav-tab[data-tab="history"]');
  await page.getByRole('button', { name: 'CHECK FOR UPDATES' }).click();
  await page.waitForFunction(() => typeof renderMain === 'function');
  expect(await page.evaluate(() => caches.keys())).toContain('other-app');
  await stop(s);
});

test('the app can be installed: a manifest with real icons, linked from the page', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  expect(html).toContain('<link rel="manifest" href="manifest.json">');
  expect(html).toContain('<link rel="apple-touch-icon" href="apple-touch-icon.png">');
  expect(html).not.toMatch(/createObjectURL\(new Blob\(\[sw\]/);   // the blob: worker browsers always rejected
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  expect(m).toMatchObject({ name: 'TRAIN', start_url: './', scope: './', display: 'standalone' });
  const png = f => { const b = fs.readFileSync(path.join(ROOT, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const icon of m.icons) {
    const [w, h] = png(icon.src);
    expect(icon.sizes).toBe(w + 'x' + h);
    expect(icon.type).toBe('image/png');
  }
  expect(m.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(png('apple-touch-icon.png')).toEqual([180, 180]);
  // Everything the worker saves on install must exist, or installing it fails.
  const core = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const CORE = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(x => x.slice(1, -1));
  for (const f of core) if (f !== './') expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true);
});
