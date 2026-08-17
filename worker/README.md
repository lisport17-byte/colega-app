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

## Costes reales

### Cloudflare — gratis, con margen de sobra

| Recurso | Tu consumo real | Límite gratuito | Uso |
|---|---|---|---|
| Peticiones Worker | ~1.500/día (el cron) | 100.000/día | 1,5 % |
| Lecturas KV | 1.440/día (una por minuto) | 100.000/día | 1,4 % |
| Escrituras KV | unas pocas al día | 1.000/día | <5 % |
| Cron Triggers | 1 cada minuto | incluidos | — |

> **Nota de diseño:** la primera versión usaba `KV.list()` en cada ejecución del
> cron. El plan gratuito permite **1.000 operaciones LIST al día** y el cron corre
> **1.440 veces**, así que la cuota se agotaba a las 16 horas y el resto del día
> no llegaba ningún aviso. Ahora todos los dispositivos viven en **una sola
> clave**, que se lee con `get()` — y las lecturas tienen 100.000 diarias.

### Anthropic — esto sí se paga

El asistente conversacional usa tu propia clave de API. No hay plan gratuito:
se carga saldo por adelantado (el mínimo suele ser 5 USD).

Coste aproximado por intercambio con `claude-opus-5`:

| Concepto | Tokens | Coste |
|---|---|---|
| Entrada (prompt + tu contexto + historial) | ~2.000 | ~0,01 USD |
| Salida (respuesta + acciones) | ~400 | ~0,01 USD |
| **Total por mensaje** | | **~0,02 USD** |

Es decir: **10 mensajes al día ≈ 6 USD al mes**. Si te parece mucho, en
`src/chat.js` puedes cambiar `model: 'claude-opus-5'` por `'claude-sonnet-5'`
y baja bastante, a cambio de algo de criterio en las respuestas.

**Pon un límite de gasto en la consola de Anthropic** (Settings → Limits) antes
de empezar. Es tu clave y tu factura.

> El push **no consume nada de Anthropic**: son dos cosas independientes. Puedes
> desplegar solo la Fase 3 y dejar el asistente para más adelante.
