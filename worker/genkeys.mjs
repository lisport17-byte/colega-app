/**
 * Genera el par de claves VAPID que necesita el Worker.
 * Uso:  node genkeys.mjs
 */
import { webcrypto as crypto } from 'node:crypto';

const b64url = buf =>
  Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const pubRaw = await crypto.subtle.exportKey('raw', pair.publicKey);

console.log('\n═══ CLAVES VAPID — guárdalas, no se pueden recuperar ═══\n');
console.log('1) VAPID_PUBLIC_KEY  (va al Worker Y a la app):\n');
console.log(b64url(pubRaw));
console.log('\n2) VAPID_PRIVATE_JWK (SOLO al Worker, nunca a la app):\n');
console.log(JSON.stringify(privJwk));
console.log('\n═══ Configúralas así ═══\n');
console.log('  npx wrangler secret put VAPID_PUBLIC_KEY');
console.log('  npx wrangler secret put VAPID_PRIVATE_JWK\n');
