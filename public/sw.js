// ホーム画面アプリ（PWA）用の Service Worker。
// 方針: 常にネットワーク優先。オフラインのときだけキャッシュを返す。
// これにより「更新したのに古い画面が出る」事故を防ぎつつ、圏外でも最低限開ける。
const CACHE = 'tsc-cache-v1';

self.addEventListener('install', () => {
  self.skipWaiting(); // 新しい版をすぐ有効化
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // GAS への POST 等はそのまま通す
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 外部ドメイン（GAS等）は介入しない

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      // 正常に取得できたものだけキャッシュへ退避（オフライン用）
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
