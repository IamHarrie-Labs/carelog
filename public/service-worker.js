// Network-only: never cache health records, account responses or private pages.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CareLog — reconnect</title><body style="background:#ffffeb;color:#193c34;font:18px/1.6 system-ui;max-width:36rem;margin:15vh auto;padding:24px"><h1>Let’s reconnect.</h1><p>CareLog needs an internet connection to load and save care records. Reconnect before relying on the latest information.</p><button onclick="location.reload()" style="font:inherit;padding:10px 20px">Try again</button></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});
