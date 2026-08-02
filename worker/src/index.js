/**
 * Colega Push — Cloudflare Worker
 *
 * Motor de recordatorios garantizados. Es la pieza que hace que la app
 * te avise aunque esté completamente cerrada.
 *
 * DISEÑO DE PRIVACIDAD — importante:
 * El servidor NUNCA ve el contenido de tus recordatorios. Solo almacena
 * una lista de INSTANTES (marcas de tiempo) y tu suscripción push.
 * Cuando llega el momento envía un push VACÍO; el Service Worker del
 * teléfono lee el texto real desde su IndexedDB local y compone el aviso.
 * Si alguien vulnerase este Worker, obtendría horas, no tu vida.
 */

import { handleChat } from './chat.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Colega-Key'
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });

// ── base64url ────────────────────────────────────────────────────────
const b64url = buf => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// ── VAPID: firma el JWT ES256 que autentica al servidor push ─────────
async function vapidAuth(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:admin@example.com'
  };
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = enc(header) + '.' + enc(payload);

  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = signingInput + '.' + b64url(sig);
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

// Push sin payload: solo despierta al Service Worker.
async function sendPush(subscription, env) {
  const auth = await vapidAuth(subscription.endpoint, env);
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: { TTL: '3600', Authorization: auth, 'Content-Length': '0' }
  });
  return res.status;
}

// ── Rutas ────────────────────────────────────────────────────────────
async function handleRegister(request, env) {
  const body = await request.json();
  const { clientId, subscription, times } = body;

  if (!clientId || !/^[A-Za-z0-9_-]{8,64}$/.test(clientId))
    return json({ error: 'clientId inválido' }, 400);
  if (!subscription || !subscription.endpoint)
    return json({ error: 'subscription requerida' }, 400);

  // Solo instantes futuros, máximo 300, dentro de 7 días.
  const now = Date.now();
  const clean = (Array.isArray(times) ? times : [])
    .map(Number)
    .filter(t => Number.isFinite(t) && t > now - 60000 && t < now + 7 * 86400000)
    .sort((a, b) => a - b)
    .slice(0, 300);

  await env.COLEGA.put(
    'sub:' + clientId,
    JSON.stringify({ subscription, times: clean, sent: [], updated: now }),
    { expirationTtl: 60 * 86400 }
  );
  return json({ ok: true, scheduled: clean.length });
}

async function handleUnregister(request, env) {
  const { clientId } = await request.json();
  if (!clientId) return json({ error: 'clientId requerido' }, 400);
  await env.COLEGA.delete('sub:' + clientId);
  return json({ ok: true });
}

async function handleTest(request, env) {
  const { clientId } = await request.json();
  const raw = await env.COLEGA.get('sub:' + clientId);
  if (!raw) return json({ error: 'No registrado' }, 404);
  const rec = JSON.parse(raw);
  const status = await sendPush(rec.subscription, env);
  return json({ ok: status >= 200 && status < 300, status });
}

// ── Cron: cada minuto revisa quién tiene un aviso vencido ────────────
async function tick(env) {
  const now = Date.now();
  const list = await env.COLEGA.list({ prefix: 'sub:' });

  for (const k of list.keys) {
    const raw = await env.COLEGA.get(k.name);
    if (!raw) continue;
    const rec = JSON.parse(raw);
    const sent = new Set(rec.sent || []);

    // Vencidos en los últimos 5 min y aún no enviados.
    const due = (rec.times || []).filter(t => t <= now && t > now - 300000 && !sent.has(t));
    if (!due.length) continue;

    let status = 0;
    try {
      status = await sendPush(rec.subscription, env);
    } catch (e) {
      status = 0;
    }

    // 404/410 = suscripción muerta (app desinstalada): se limpia.
    if (status === 404 || status === 410) {
      await env.COLEGA.delete(k.name);
      continue;
    }

    due.forEach(t => sent.add(t));
    rec.sent = [...sent].filter(t => t > now - 86400000);
    rec.times = (rec.times || []).filter(t => t > now - 86400000);
    await env.COLEGA.put(k.name, JSON.stringify(rec), { expirationTtl: 60 * 86400 });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    try {
      if (url.pathname === '/health') {
        return json({
          ok: true,
          service: 'colega-push',
          push: !!env.VAPID_PUBLIC_KEY,
          chat: !!env.ANTHROPIC_API_KEY
        });
      }
      if (url.pathname === '/vapid-public') return json({ key: env.VAPID_PUBLIC_KEY || '' });

      if (request.method === 'POST') {
        if (url.pathname === '/register') return await handleRegister(request, env);
        if (url.pathname === '/unregister') return await handleUnregister(request, env);
        if (url.pathname === '/test') return await handleTest(request, env);
        if (url.pathname === '/chat') return await handleChat(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  }
};
