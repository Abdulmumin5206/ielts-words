/* Twin Words offline cache. Saves every page file and every audio file on the first open,
   then serves from the phone. Page files update in the background when there is internet.
   Bump V when the files change. */
importScripts('words.js');
const V = 'tw-v1';
const CORE = ['./', 'index.html', 'app.js', 'words.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];
const AUDIO = self.TW_WORDS.flatMap(w => ['audio/w-' + w.id + '.mp3', 'audio/x-' + w.id + '.mp3']);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE).then(() =>
    Promise.all(AUDIO.map(u => c.match(u).then(hit => hit || c.add(u).catch(() => {}))))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tw-') && k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// iOS asks for audio in byte ranges; answer from the cached file
async function ranged(req, resp) {
  const h = req.headers.get('range');
  if (!h || !resp || resp.status !== 200) return resp;
  const buf = await resp.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(h) || [];
  let a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : size - 1;
  if (!m[1] && m[2]) { a = size - +m[2]; b = size - 1; }
  b = Math.min(b, size - 1);
  return new Response(buf.slice(a, b + 1), { status: 206, headers: {
    'Content-Type': resp.headers.get('Content-Type') || 'audio/mpeg', 'Accept-Ranges': 'bytes',
    'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(b - a + 1) } });
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.search.includes('test')) return;
  const isAudio = url.pathname.includes('/audio/');
  e.respondWith(caches.open(V).then(async c => {
    const key = req.mode === 'navigate' ? './' : url.pathname.replace(/^.*?\/(audio\/|[^/]*$)/, (s, p) => p);
    const hit = await c.match(req, { ignoreSearch: true, ignoreVary: true }) || await c.match(key);
    if (isAudio) {
      if (hit) return ranged(req, hit);
      const r = await fetch(url.href);   // no range: store the whole file
      if (r.ok) c.put(url.href, r.clone());
      return ranged(req, r);
    }
    const net = fetch(req).then(r => { if (r.ok) c.put(req.mode === 'navigate' ? './' : req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('Offline', { status: 503 });
  }));
});
