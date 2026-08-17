/**
 * Colega — instalador de la Fase 3 (avisos con la app cerrada).
 *
 * Automatiza lo que si no habría que hacer a mano: crear el almacén KV,
 * pegar su id en wrangler.toml, generar las claves VAPID, cargarlas como
 * secretos y publicar. El paso donde más gente se atasca es el id del KV,
 * y aquí se resuelve solo.
 *
 * Uso:  npx wrangler login   (una vez)
 *       npm run setup
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const TOML = 'wrangler.toml';
const b64url = b => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const log  = m => console.log(m);
const paso = (n, m) => console.log(`\n\x1b[1m[${n}/5] ${m}\x1b[0m`);
const ok   = m => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const err  = m => { console.error(`\n\x1b[31m✗ ${m}\x1b[0m\n`); process.exit(1); };

function wrangler(args, opts = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: true, ...opts
  });
}

// ── 0. Comprobaciones previas ────────────────────────────────────────
if (!existsSync(TOML)) err('Ejecuta esto dentro de la carpeta worker/');

log('\n\x1b[1m═══ Instalador de Colega Push ═══\x1b[0m');

try {
  const who = wrangler(['whoami']);
  const m = who.match(/[\w.+-]+@[\w.-]+/);
  ok(`Sesión de Cloudflare iniciada${m ? ` como ${m[0]}` : ''}`);
} catch {
  err('No has iniciado sesión en Cloudflare.\n  Ejecuta primero:  npx wrangler login');
}

// ── 1. Almacén KV ────────────────────────────────────────────────────
paso(1, 'Creando el almacén de datos (KV)');
let toml = readFileSync(TOML, 'utf8');
let kvId = (toml.match(/^\s*id\s*=\s*"([0-9a-f]{32})"/m) || [])[1];

if (kvId) {
  ok(`Ya había uno configurado (${kvId.slice(0, 8)}…)`);
} else {
  let salida = '';
  try {
    salida = wrangler(['kv', 'namespace', 'create', 'COLEGA']);
  } catch (e) {
    salida = (e.stdout || '') + (e.stderr || '');
    // Si ya existe, se recupera su id de la lista en lugar de fallar.
    if (!/already exists|ya existe/i.test(salida)) err('No se pudo crear el KV:\n' + salida);
  }
  kvId = (salida.match(/id\s*=\s*"([0-9a-f]{32})"/) || salida.match(/"id":\s*"([0-9a-f]{32})"/) || [])[1];

  if (!kvId) {
    try {
      const lista = JSON.parse(wrangler(['kv', 'namespace', 'list']));
      kvId = (lista.find(n => /COLEGA/i.test(n.title)) || {}).id;
    } catch { /* se pedirá a mano */ }
  }
  if (!kvId) err('No pude obtener el id del KV.\n  Créalo a mano con:  npx wrangler kv namespace create COLEGA\n  y pega el id en wrangler.toml');

  toml = toml.replace(/^(\s*id\s*=\s*)"[^"]*"/m, `$1"${kvId}"`);
  writeFileSync(TOML, toml);
  ok(`Creado y escrito en wrangler.toml (${kvId.slice(0, 8)}…)`);
}

// ── 2. Email de contacto (lo exige el estándar VAPID) ────────────────
paso(2, 'Email de contacto');
if (/VAPID_SUBJECT\s*=\s*"mailto:TU-EMAIL@ejemplo\.com"/.test(toml)) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question('  Tu email: ')).trim();
  rl.close();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err('Ese email no parece válido.');
  toml = toml.replace(/VAPID_SUBJECT\s*=\s*"[^"]*"/, `VAPID_SUBJECT = "mailto:${email}"`);
  writeFileSync(TOML, toml);
  ok('Guardado');
} else {
  ok('Ya estaba configurado');
}

// ── 3. Claves VAPID ──────────────────────────────────────────────────
paso(3, 'Generando las claves de seguridad');
const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64url(await crypto.subtle.exportKey('raw', par.publicKey));
const priv = JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey));
ok('Par de claves creado');

// ── 4. Carga como secretos (nunca tocan disco ni el repositorio) ─────
paso(4, 'Guardando las claves en Cloudflare');
for (const [nombre, valor] of [['VAPID_PUBLIC_KEY', pub], ['VAPID_PRIVATE_JWK', priv]]) {
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', nombre], {
    input: valor, encoding: 'utf8', shell: true
  });
  if (r.status !== 0) err(`No se pudo guardar ${nombre}:\n${r.stderr || r.stdout}`);
  ok(nombre);
}

// ── 5. Publicación ───────────────────────────────────────────────────
paso(5, 'Publicando el Worker');
let url = '';
try {
  const out = wrangler(['deploy']);
  url = (out.match(/https:\/\/[^\s]+\.workers\.dev/) || [])[0] || '';
  ok('Publicado');
} catch (e) {
  err('Falló la publicación:\n' + ((e.stdout || '') + (e.stderr || '')));
}

// Comprobación real contra el servidor recién publicado
if (url) {
  try {
    const r = await fetch(url + '/health');
    const d = await r.json();
    if (d.ok) ok(`Responde correctamente · push: ${d.push ? 'sí' : 'no'} · asistente: ${d.chat ? 'sí' : 'no'}`);
  } catch { log('  (no pude comprobarlo, puede tardar unos segundos en propagarse)'); }
}

log('\n\x1b[1m═══ LISTO ═══\x1b[0m');
log(`\n  Tu URL:  \x1b[36m${url || 'míralo arriba en la salida de wrangler'}\x1b[0m\n`);
log('  Ahora en el móvil:');
log('    Perfil → Avisos con la app cerrada → pega la URL → Conectar');
log('    Después pulsa "Probar push real", cierra la app del todo y espera.\n');
log('  ¿Quieres también el asistente con Claude? (es de pago)');
log('    npx wrangler secret put ANTHROPIC_API_KEY');
log('    npx wrangler secret put APP_SECRET');
log('    npx wrangler deploy\n');
