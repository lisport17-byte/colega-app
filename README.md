# 🤖 Colega v6 — Asistente Personal

Asistente personal completo para móvil: objetivos con hitos, plan del día,
recordatorios garantizados, meditación, salud, aprendizaje con repaso espaciado,
bloqueo con huella, sincronización cifrada y un asistente conversacional por voz.

**App:** https://lisport17-byte.github.io/colega-app

---

## Novedades v6

### 🔒 Seguridad
- **Bloqueo con huella / Face ID** vía WebAuthn, con PIN de respaldo de 6 dígitos y re-bloqueo configurable al volver a la app.
- **Sincronización cifrada de extremo a extremo** — AES-256-GCM con clave derivada por PBKDF2 (210.000 iteraciones). GitHub solo almacena bytes ilegibles.
- **Validación de todo dato entrante** — backups y datos del cloud pasan por un saneador estricto antes de tocar la app.

### 🎯 Objetivos y proyectos
- **Objetivos** con área, horizonte, fecha límite, el *porqué* que te recuerda por qué empezaste, e hitos verificables marcables uno a uno.
- Franja de objetivos en HOY: lo que persigues, siempre delante.

### 🧘 Bienestar
- **Meditación guiada** con círculo de respiración y tres patrones (cuadrada 4-4-4-4, relajante 4-7-8, coherente 5-5).
- **Salud**: sueño, agua, ánimo y energía diarios; registro de ejercicio con gráfico semanal.
- **Aprendizaje**: cursos, libros y habilidades con progreso, más **repaso espaciado** tipo Leitner (1 → 3 → 7 → 16 → 35 días).

### 🔔 Recordatorios que sí llegan
- **Web Push real** con servidor propio: te avisa aunque la app esté cerrada.
- **Acciones en la notificación**: "✓ Hecho" y "⏰ +10 min" sin abrir la app.
- Recordatorios de hábitos que solo suenan si aún no cumpliste ese día.

### 🧠 Asistente conversacional
- Habla o escribe: *"recuérdame llamar al banco mañana a las 10"* y lo crea.
- Propone acciones concretas que **tú confirmas** — nunca guarda nada solo.
- Dictado por voz y lectura en alto de las respuestas.

### 📊 Otros
- **Racha real**: cuenta días con actividad verificable (tareas, foco, meditación, ejercicio, repasos), no días en que abriste la app.

---

## Arquitectura

```
index.html          La app entera — sin dependencias, sin build
sw.js               Service Worker: offline, notificaciones, acciones, push
manifest.json       PWA instalable
worker/             Servidor opcional (Cloudflare) — push + asistente
native/             Envoltorio opcional (Capacitor) — datos del reloj
```

**Tecnologías:** HTML + CSS + JavaScript puro · Web Crypto · WebAuthn ·
IndexedDB + localStorage · Web Push (VAPID) · Web Speech API · GitHub Gist API ·
Cloudflare Workers · Claude API

---

## Puesta en marcha

### Nivel 1 — solo la app (2 minutos)

1. Abre la URL en el móvil y elige **"Agregar a pantalla de inicio"**.
2. **Perfil → Notificaciones → Activar notificaciones**.
3. **Perfil → Seguridad → Activar huella**.
4. **HOY → Planificar** para montar tus bloques del día.

Ya tienes objetivos, tareas, agenda, foco, meditación, salud y aprendizaje.
Los recordatorios funcionan mientras la app esté abierta o en segundo plano
reciente.

### Nivel 2 — sincronizar entre dispositivos (5 minutos)

**Perfil → Sincronización** → crea un token de GitHub con permiso `gist`,
elige una **frase de cifrado** y conéctalo. Usa la misma frase en cada
dispositivo.

> Sin frase de cifrado tus datos quedan legibles en GitHub: un Gist "secreto"
> no está protegido, cualquiera con el enlace lo lee. La app te lo advierte.

### Nivel 3 — avisos con la app cerrada (10 minutos)

Despliega el Worker siguiendo [`worker/README.md`](worker/README.md) y conéctalo
en **Perfil → Avisos con la app cerrada**. Es gratis.

> En iPhone requiere iOS 16.4+ **y la app añadida a la pantalla de inicio**.

### Nivel 4 — asistente conversacional (10 minutos)

Añade tu clave de Anthropic al mismo Worker
([`worker/README.md`](worker/README.md), Fase 4) y conéctalo en
**Perfil → Asistente conversacional**.

### Nivel 5 — datos del reloj (opcional, avanzado)

Solo si necesitas pasos, pulso y sueño reales. Ver
[`native/README.md`](native/README.md). Requiere Android Studio o un Mac.

---

## Privacidad — dónde está cada dato

| Dato | Dónde vive | Quién puede leerlo |
|---|---|---|
| Todo (tareas, objetivos, salud…) | Tu teléfono | Tú |
| Copia sincronizada | GitHub Gist | Solo tú, **cifrado** si pusiste frase |
| Horas de tus recordatorios | Tu Worker | Tú — solo instantes, sin contenido |
| Mensajes del chat + resumen del día | Tu Worker → Anthropic | Necesario para responder |

El bloqueo con huella impide que alguien que tome tu teléfono abra la app, pero
**no cifra el almacenamiento local**. La app te lo dice en su propia pantalla de
seguridad en vez de dejarte creer lo contrario.

---

## Autor

Colega — desarrollado con Claude (Anthropic)
