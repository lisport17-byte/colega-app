// Colega v5 — Service Worker: offline + notificaciones en background
const CACHE = 'colega-v5-1';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API calls (GitHub) van directo a red
  if (e.request.mode === 'navigate') {
    // network-first para tener siempre la última versión, cache si no hay red
    e.respondWith(
      fetch(e.request)
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(rr => {
        const cp = rr.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return rr;
      }))
    );
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('./');
    })
  );
});

// ── Recordatorios en background (Periodic Background Sync, Android PWA instalada) ──
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('colega-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbGet(db, key) {
  return new Promise((res, rej) => {
    const rq = db.transaction('kv').objectStore('kv').get(key);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
function idbSet(db, key, val) {
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

async function fireDueReminders() {
  try {
    const db = await idbOpen();
    const queue = (await idbGet(db, 'queue')) || [];
    const fired = (await idbGet(db, 'fired')) || {};
    const now = Date.now();
    let dirty = false;
    for (const r of queue) {
      // dispara lo vencido en las últimas 2h que aún no se notificó
      if (r.at <= now && r.at > now - 7200000 && !fired[r.id]) {
        fired[r.id] = now;
        dirty = true;
        await self.registration.showNotification(r.title, {
          body: r.body, tag: r.id, icon: 'icon-192.png', badge: 'icon-192.png',
          vibrate: [200, 100, 200], data: { url: './' }
        });
      }
    }
    if (dirty) await idbSet(db, 'fired', fired);
    db.close();
  } catch (e) { /* sin datos aún */ }
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'colega-reminders') e.waitUntil(fireDueReminders());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'check-reminders') e.waitUntil(fireDueReminders());
});
