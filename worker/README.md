# Colega Server — recordatorios push + asistente conversacional

Un solo Worker con dos funciones independientes. Puedes activar una, la otra, o
ambas:

| Función | Qué te da | Coste |
|---|---|---|
| **Push** (Fase 3) | Recordatorios garantizados con la app cerrada | Gratis |
| **Chat** (Fase 4) | Colega conversacional que crea tareas y objetivos por ti | Lo que consumas en Anthropic |

El plan free de Cloudflare cubre de sobra el uso de una persona.

## Privacidad por diseño

El servidor **no ve el contenido de tus recordatorios**. Solo almacena:

- Tu suscripción push (un identificador que da el navegador).
- Una lista de **marcas de tiempo**: los instantes en que quieres un aviso.

Cuando llega el momento, envía un push **vacío**. El Service Worker de tu
teléfono lo recibe, lee el texto real desde su base de datos local y compone la
notificación. Si alguien vulnerase este Worker, obtendría horas — no tu agenda,
ni tus objetivos, ni tu salud.

---

## Despliegue en 6 pasos (~10 min)

### 1. Requisitos

Node.js instalado y una cuenta de Cloudflare (gratuita).

```bash
cd worker
npm install
npm install -g wrangler
npx wrangler login
```

### 2. Crear el almacén KV

```bash
npx wrangler kv namespace create COLEGA
```

Copia el `id` que imprime y pégalo en `wrangler.toml`, sustituyendo
`PEGA_AQUI_TU_KV_ID`.

### 3. Generar las claves VAPID

```bash
node genkeys.mjs
```

Guarda las dos claves que imprime. **No se pueden recuperar**: si las pierdes
tendrás que volver a generar y reconectar cada dispositivo.

### 4. Cargar las claves como secretos

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
# pega la clave pública

npx wrangler secret put VAPID_PRIVATE_JWK
# pega el JSON completo de la clave privada
```

### 5. Publicar

```bash
npx wrangler deploy
```

Te dará una URL del tipo `https://colega-push.TU-CUENTA.workers.dev`.
Compruébala:

```bash
curl https://colega-push.TU-CUENTA.workers.dev/health
# {"ok":true,"service":"colega-push"}
```

### 6. Conectar la app

En Colega: **Perfil → Avisos con la app cerrada** → pega la URL → **Conectar**.

Luego pulsa **Probar push real**, cierra completamente la app y espera unos
segundos. Si llega la notificación, ya está funcionando.

---

## Fase 4 — activar el asistente conversacional

Independiente del push. Si solo quieres recordatorios, sáltate esta sección.

### 1. Consigue una clave de Anthropic

En [console.anthropic.com](https://console.anthropic.com) → **API Keys** →
crea una clave y carga saldo. Empieza con poco: verás el consumo real en el
dashboard antes de decidir cuánto quieres gastar.

### 2. Inventa una clave de acceso propia

Cualquier cadena larga y aleatoria. Protege tu Worker para que nadie más gaste
tu saldo si descubre la URL:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 3. Carga ambas como secretos

```bash
npx wrangler secret put ANTHROPIC_API_KEY
# pega la clave sk-ant-...

npx wrangler secret put APP_SECRET
# pega la cadena aleatoria del paso anterior

npx wrangler deploy
```

### 4. Conecta la app

En Colega: **Perfil → Asistente conversacional** → pega la URL del Worker y la
clave de acceso → **Conectar**. Aparecerá un botón dorado flotante: ese es
Colega.

### Qué sabe el asistente

Cada mensaje envía a Anthropic **solo un resumen de tu día**: cuántas tareas
tienes, tu Top 3, los eventos de hoy, el bloque en curso, tus objetivos con su
porcentaje, y tus minutos de foco/meditación/ejercicio. **No** se envía tu base
de datos, ni tus notas, ni tu historial de salud, ni tus proyectos.

Es el único punto de todo el sistema donde tus datos salen del teléfono sin
cifrado de extremo a extremo. Por eso viene desactivado y hay que activarlo a
propósito.

### Qué puede hacer

Entiende lenguaje natural y **propone acciones** que tú confirmas en pantalla:
crear tareas con hora, montar objetivos con hitos, añadir bloques al plan,
registrar entrenamientos, crear tarjetas de repaso. Nada se guarda sin tu
confirmación — el servidor no tiene acceso de escritura a tus datos porque tus
datos no están ahí.

### Coste orientativo

Cada intercambio ronda 1.500–3.000 tokens de entrada. Con uso diario normal
hablamos de céntimos al día, pero **fíjate tú mismo un límite de gasto en la
consola de Anthropic** — es tu clave y tu factura.

---

## Importante en iPhone

Web Push en iOS exige **iOS 16.4 o superior** y que la app esté **añadida a la
pantalla de inicio** (Compartir → Añadir a pantalla de inicio). Desde Safari,
sin instalar, no llegará nada. Es una restricción de Apple, no de esta app.

En Android funciona tanto instalada como desde Chrome.

---

## Cómo funciona por dentro

| Momento | Qué pasa |
|---|---|
| Cambias una tarea | La app recalcula sus recordatorios y sube **solo las horas** a `/register` |
| Cada minuto | El cron del Worker busca instantes vencidos en los últimos 5 min |
| Hay uno vencido | Envía un push vacío firmado con VAPID |
| Llega al teléfono | El Service Worker despierta, lee IndexedDB y muestra el aviso real |
| Pulsas "Hecho" | La orden se guarda en IndexedDB y la app la aplica al abrirse |

## Endpoints

| Ruta | Método | Para qué |
|---|---|---|
| `/health` | GET | Comprobar que está vivo |
| `/vapid-public` | GET | La app pide la clave pública |
| `/register` | POST | Guardar suscripción + horas |
| `/unregister` | POST | Borrar todo lo de este dispositivo |
| `/test` | POST | Forzar un push inmediato |
| `/chat` | POST | Conversación con Claude (requiere `X-Colega-Key`) |

## Costes

Plan free de Cloudflare Workers: 100.000 peticiones/día y cron triggers
incluidos. Un uso personal consume del orden de 1.500 invocaciones de cron al
día. No deberías pagar nada.
