# 🤖 Colega v5 — Asistente Personal

PWA de productividad personal: plan del día por bloques, tareas con recordatorios reales, modo enfoque y sincronización multi-dispositivo.

**App:** https://lisport17-byte.github.io/colega-app

## Novedades v5 — "Comandante"

- **🔔 Notificaciones reales** — motor de recordatorios con Service Worker: briefing matutino, avisos de tareas con hora, eventos con anticipación configurable y aviso al iniciar cada bloque del plan.
- **📋 HOY** — panel principal con progreso del día, bloque en curso con cuenta regresiva en vivo, línea de "ahora" en la agenda y tareas atrasadas destacadas.
- **🕐 Plan del día** — bloques de tiempo (trabajo, aprendizaje, salud, descanso...) repetibles por día de la semana, con plantilla de día productivo en un toque.
- **★ Top 3 del día** — máximo 3 objetivos innegociables diarios.
- **🎯 Modo enfoque** — temporizador Pomodoro (25/50/90 min) vinculado a tareas, con estadísticas de minutos enfocados.
- **↻ Tareas recurrentes** — diarias, Lun–Vie o semanales, con hora de aviso. Ahora también editables.
- **📅 Exportar a calendario (.ics)** — alarmas a nivel de sistema operativo (Google Calendar / iPhone) para recordatorios garantizados aunque la app esté cerrada.
- **☁️ Sync v5 con merge** — los cambios de todos los dispositivos se combinan por elemento (gana el más reciente); ya no se sobreescriben datos.
- **📊 Estadísticas** — gráfico semanal de tareas completadas, racha de días y minutos de enfoque.
- **📱 PWA completa** — manifest real + Service Worker: instalable y funciona offline.

## Tecnologías

- HTML5 + CSS3 + JavaScript puro (sin dependencias)
- Service Worker: offline, notificaciones y Periodic Background Sync
- localStorage + IndexedDB
- GitHub Gist API para sincronización

## Uso

1. Abre la URL en tu teléfono y elige **"Agregar a pantalla de inicio"** (instalar como app).
2. En **Perfil → Notificaciones**, pulsa **Activar notificaciones** y prueba con "Probar".
3. En **HOY → Planificar**, arma tus bloques del día (o usa la plantilla).
4. Marca hasta 3 tareas con ★ como tu Top 3 diario.
5. Para recordatorios 100% fiables con la app cerrada: **Exportar a calendario (.ics)** e impórtalo en Google Calendar.

## Sincronización entre dispositivos

Perfil → Sincronización → crea un token de GitHub con permiso `gist` y conéctalo en cada dispositivo. Los datos se combinan automáticamente.

## Autor

Colega — desarrollado con Claude (Anthropic)
