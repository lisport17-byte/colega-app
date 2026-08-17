// Colega v6 — Service Worker: offline + notificaciones y acciones en background
const CACHE = 'colega-v6-4';
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

// ── IndexedDB: canal de datos compartido con la página ──────────────
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

const ACTIONS = {
  task:  [{ action: 'done', title: '✓ Hecho' }, { action: 'snooze', title: '⏰ +10 min' }],
  event: [{ action: 'snooze', title: '⏰ +10 min' }],
  block: [{ action: 'snooze', title: '⏰ +10 min' }]
};

async function notify(r) {
  const opts = {
    body: r.body, tag: r.id, icon: 'icon-192.png', badge: 'icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: './', kind: r.kind, entityId: r.entityId, remId: r.id }
  };
  const acts = ACTIONS[r.kind];
  if (acts && self.registration.showNotification) opts.actions = acts;
  await self.registration.showNotification(r.title, opts);
}

// ── Recordatorios en background (Periodic Background Sync, Android PWA instalada) ──
// `ahead` amplía la ventana hacia delante: el push del servidor puede
// llegar unos segundos antes del instante exacto del recordatorio.
async function fireDueReminders(ahead) {
  let db;
  let count = 0;
  try {
    db = await idbOpen();
    const queue = (await idbGet(db, 'queue')) || [];
    const snooze = (await idbGet(db, 'snooze')) || [];
    const fired = (await idbGet(db, 'fired')) || {};
    const now = Date.now();
    const limit = now + (ahead || 0);
    let dirty = false;

    for (const r of queue.concat(snooze)) {
      // dispara lo vencido en las últimas 2h que aún no se notificó
      if (r.at <= limit && r.at > now - 7200000 && !fired[r.id]) {
        fired[r.id] = now;
        dirty = true;
        count++;
        await notify(r);
      }
    }

    // poda: recordatorios pospuestos ya disparados o caducados
    const keep = snooze.filter(r => !fired[r.id] && r.at > now - 7200000);
    if (keep.length !== snooze.length) await idbSet(db, 'snooze', keep);

    if (dirty) await idbSet(db, 'fired', fired);
  } catch (e) { /* sin datos aún */ }
  finally { if (db) db.close(); }
  return count;
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'colega-reminders') e.waitUntil(fireDueReminders());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'check-reminders') e.waitUntil(fireDueReminders());
});

// ── WEB PUSH ────────────────────────────────────────────────────────
// El servidor envía un push VACÍO: no conoce el contenido de tus avisos.
// Aquí se recupera el texto real desde IndexedDB y se compone la notificación.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const n = await fireDueReminders(90000);
    // El navegador exige que todo push produzca algo visible. Si el aviso
    // llegó adelantado o ya se había mostrado, dejamos un resumen mínimo.
    if (n === 0) {
      await self.registration.showNotification('Colega', {
        body: 'Toca para ver tu plan de ahora.',
        tag: 'colega-generic', icon: 'icon-192.png', badge: 'icon-192.png',
        data: { url: './' }
      });
    }
  })());
});

// Los navegadores rotan la suscripción cada cierto tiempo: hay que reenviarla.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ type: 'push-resubscribe' }));
    let db;
    try {
      db = await idbOpen();
      await idbSet(db, 'pushStale', Date.now());
    } catch (err) { /* la app lo reintentará al abrirse */ }
    finally { if (db) db.close(); }
  })());
});

// ── Clic y acciones en la notificación ──────────────────────────────
async function openApp() {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of list) { if ('focus' in c) return c.focus(); }
  return self.clients.openWindow('./');
}

async function ack(title, body) {
  const tag = 'colega-ack';
  await self.registration.showNotification(title, {
    body, tag, icon: 'icon-192.png', badge: 'icon-192.png', silent: true
  });
  // desaparece sola: es solo un acuse de recibo
  await new Promise(r => setTimeout(r, 4000));
  const ns = await self.registration.getNotifications({ tag });
  ns.forEach(n => n.close());
}

async function handleAction(action, d) {
  let db;
  try {
    db = await idbOpen();

    if (action === 'done' && d.entityId) {
      // El SW no puede escribir en localStorage: deja la orden en cola
      // y la página la aplica en cuanto se abre.
      const ops = (await idbGet(db, 'ops')) || [];
      ops.push({ kind: d.kind, action: 'done', entityId: d.entityId, at: Date.now() });
      await idbSet(db, 'ops', ops);
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cs.forEach(c => c.postMessage({ type: 'ops-updated' }));
      await ack('✓ Hecho', 'Se marcará como completada.');
    }

    if (action === 'snooze' && d.remId) {
      const queue = (await idbGet(db, 'queue')) || [];
      const snooze = (await idbGet(db, 'snooze')) || [];
      const base = queue.concat(snooze).find(r => r.id === d.remId);
      snooze.push({
        id: d.remId + '_s' + Date.now(),
        at: Date.now() + 600000,
        title: base ? base.title : '⏰ Recordatorio',
        body: 'Pospuesto — aquí lo tienes de nuevo',
        kind: d.kind, entityId: d.entityId
      });
      await idbSet(db, 'snooze', snooze);
      await ack('⏰ Pospuesto', 'Te aviso otra vez en 10 minutos.');
    }
  } catch (e) { /* nada que hacer en background */ }
  finally { if (db) db.close(); }
}

self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {};
  e.notification.close();
  if (e.action === 'done' || e.action === 'snooze') {
    e.waitUntil(handleAction(e.action, d));
    return;
  }
  e.waitUntil(openApp());
});
