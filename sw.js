/* WorkBuddy Service Worker：离线缓存 + 打开即刷新 */
const CACHE = "workbuddy-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/store.js",
  "./js/ai.js",
  "./js/audio.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 策略：本地文件用缓存优先（离线可用）；API 请求（ark.cn-beijing）直接走网络
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.includes("volces.com") || url.hostname.includes("byteintl")) {
    return; // 不拦截 AI 接口
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res.ok && e.request.method === "GET") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
