// TRAIN's service worker: keeps the app working with no signal (a gym basement).
//
// A browser only accepts a service worker from a real file on the site, which is
// why this isn't inside index.html like everything else. It used to be registered
// from a blob: URL, which every browser rejects, so the app never worked offline.
//
// Network first: online, every open gets the newest index.html from GitHub Pages
// (merging is shipping, and a cache-first worker would keep serving an old app).
// Offline, or if the network hangs, the last copy that loaded is used instead.
// Only the app's own files and its fonts are kept. Groq, GitHub and anything else
// go straight to the network and are never stored.

const CACHE = 'train-v1';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_WAIT_MS = 4000;   // a gym's one bar of signal: fall back instead of hanging

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Only this app's own old caches — other apps share the github.io origin.
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('train-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(req, cache) {
  return fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) {
    e.respondWith(caches.open(CACHE).then(cache => {
      const saved = () => cache.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
      const net = fromNetwork(req, cache);
      net.catch(() => {});   // handled below; this only stops a stray "unhandled" warning
      const slow = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT_MS)).then(saved);
      // Whichever comes first: the network, or (after a wait) a saved copy. With no
      // saved copy, keep waiting on the network.
      return Promise.race([net, slow.then(hit => hit || net)])
        .catch(() => saved().then(hit => hit || Response.error()));
    }));
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    // Fonts never change at a given URL: saved copy first.
    e.respondWith(caches.open(CACHE).then(cache =>
      cache.match(req).then(hit => hit || fetch(req).then(res => { cache.put(req, res.clone()); return res; }))));
  }
});
