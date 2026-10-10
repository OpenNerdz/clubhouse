// Lets Clubhouse open without a signal (handy for entering a score on the course).
// Always tries the network first so updates show up straight away.
const CACHE = 'clubhouse-v5';
const SHELL = [
  './', 'index.html', 'privacy.html', 'css/styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/contours.svg',
  'fonts/besley.woff2', 'fonts/besley-italic.woff2', 'fonts/libre-franklin.woff2',
  'js/theme-init.js', 'js/app.js', 'js/config.js', 'js/store.js', 'js/google.js', 'js/parser.js',
  'js/golf.js', 'js/ui.js', 'js/chart.js', 'js/demo.js', 'js/microsoft.js', 'js/util.js',
  'js/views/common.js', 'js/views/home.js', 'js/views/mail.js', 'js/views/scores.js',
  'js/views/settings.js', 'js/views/sheets.js', 'js/views/welcome.js', 'js/views/partners.js',
  'js/views/play.js', 'js/weather.js', 'js/gps.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// On a weak signal out on the course the network can take a long time to answer
// or give up, so after this long the saved copy is shown instead.
const SLOW_MS = 3000;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const network = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
    }
    return res;
  });
  const saved = () => caches.match(req, { ignoreSearch: true });
  event.respondWith(new Promise((resolve) => {
    const timer = setTimeout(() => saved().then((hit) => { if (hit) resolve(hit); }), SLOW_MS);
    network
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch(() => {
        clearTimeout(timer);
        saved().then((hit) => resolve(hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
      });
  }));
  // Lets a slow download finish and update the saved copy after the page has opened.
  event.waitUntil(network.catch(() => {}));
});
