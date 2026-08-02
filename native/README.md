# Fase 5 — envoltorio nativo (Capacitor)

Esta fase es **opcional** y solo tiene sentido si quieres una cosa que la web no
puede darte: **los datos reales de tu reloj**.

## Qué añade y qué no

| Capacidad | PWA (lo que ya tienes) | Con Capacitor |
|---|---|---|
| Recordatorios con la app cerrada | ✅ vía Web Push | ✅ además notificaciones locales nativas, sin servidor |
| Notificaciones en el reloj | ✅ (espejo del teléfono) | ✅ igual |
| Huella / Face ID | ✅ WebAuthn | ✅ además biometría nativa |
| **Pasos, pulso, sueño, calorías** | ❌ imposible | ✅ Health Connect / HealthKit |
| **Escribir entrenamientos al reloj** | ❌ imposible | ✅ |
| Publicar en App Store / Play Store | ❌ | ✅ |
| Instalación | Abrir una URL | Compilar e instalar |

Si no necesitas las filas en negrita, **quédate con la PWA**. Es más simple de
mantener y se actualiza sola.

## Requisitos

- Node.js
- **Android:** Android Studio
- **iPhone:** un Mac con Xcode (no hay forma de evitarlo)

## Montaje

Desde la raíz del proyecto:

```bash
mkdir -p native/www
cp index.html manifest.json sw.js icon-192.png icon-512.png native/www/
cd native

npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init Colega app.colega.asistente --web-dir=www

npm install @capacitor/local-notifications @capacitor/haptics @capacitor/preferences
npm install capacitor-native-biometric
npm install @perfood/capacitor-health-connect     # Android
npm install @perfood/capacitor-healthkit          # iOS

npx cap add android
npx cap add ios        # solo en Mac

npx cap sync
npx cap open android   # o: npx cap open ios
```

`capacitor.config.json` de esta carpeta ya trae la configuración correcta
(colores, icono de notificación, splash) — cópialo sobre el que genere
`cap init`.

**Cada vez que cambies `index.html`**, repite el `cp` y ejecuta `npx cap sync`.

## Permisos que hay que declarar

**Android** — `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>
<uses-permission android:name="android.permission.USE_BIOMETRIC"/>
<uses-permission android:name="android.permission.health.READ_STEPS"/>
<uses-permission android:name="android.permission.health.READ_HEART_RATE"/>
<uses-permission android:name="android.permission.health.READ_SLEEP"/>
<uses-permission android:name="android.permission.health.READ_EXERCISE"/>
<uses-permission android:name="android.permission.health.WRITE_EXERCISE"/>
```

**iOS** — `ios/App/App/Info.plist`:

```xml
<key>NSHealthShareUsageDescription</key>
<string>Colega usa tus datos de salud para hacer seguimiento de tu ejercicio y descanso.</string>
<key>NSHealthUpdateUsageDescription</key>
<string>Colega registra tus entrenamientos en la app Salud.</string>
<key>NSFaceIDUsageDescription</key>
<string>Colega usa Face ID para proteger tus datos personales.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Colega usa el micrófono para que puedas dictarle por voz.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>Colega convierte tu voz en texto para entender lo que le pides.</string>
```

## Puente con el código existente

La app detecta si corre dentro de Capacitor y usa lo nativo cuando está
disponible, cayendo a la implementación web si no. Añade esto **antes** del
`</script>` de `index.html` cuando montes la versión nativa:

```js
// ── PUENTE NATIVO (solo activo dentro de Capacitor) ───────────
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform &&
                  window.Capacitor.isNativePlatform());

// Notificaciones locales: no necesitan servidor ni Web Push.
async function nativeSchedule(queue){
  if(!NATIVE) return false;
  const { LocalNotifications } = window.Capacitor.Plugins;
  const perm = await LocalNotifications.requestPermissions();
  if(perm.display !== 'granted') return false;

  const pend = await LocalNotifications.getPending();
  if(pend.notifications.length)
    await LocalNotifications.cancel({ notifications: pend.notifications });

  await LocalNotifications.schedule({
    notifications: queue.slice(0, 60).map((r, i) => ({
      id: i + 1,
      title: r.title,
      body: r.body,
      schedule: { at: new Date(r.at), allowWhileIdle: true },
      extra: { kind: r.kind, entityId: r.entityId }
    }))
  });
  return true;
}

// Salud: lee del reloj y rellena el registro diario.
async function nativeHealthSync(){
  if(!NATIVE) return;
  try{
    const { HealthConnect } = window.Capacitor.Plugins;   // Android
    const today = todayStr();
    const res = await HealthConnect.readRecords({
      type: 'Steps',
      timeRangeFilter: {
        type: 'between',
        startTime: new Date(today + 'T00:00:00'),
        endTime: new Date()
      }
    });
    const steps = res.records.reduce((s, r) => s + (r.count || 0), 0);
    if(steps > 0){
      const h = ensureHealth(today);
      h.steps = steps; touch(h); saveAll(); renderActive();
    }
  }catch(e){ /* sin permiso o sin datos */ }
}

if(NATIVE){
  document.addEventListener('deviceready', nativeHealthSync);
  setInterval(nativeHealthSync, 900000);   // cada 15 min
}
```

Con `nativeSchedule()` disponible, la Fase 3 (Web Push + Worker) deja de ser
necesaria **en el móvil nativo** — pero sigue haciendo falta si además usas la
app desde el navegador de otro dispositivo.

## Advertencia honesta

Mantener tres superficies (PWA, Android, iOS) triplica el trabajo de cada
cambio. La ruta sensata es: **quedarte en PWA hasta que los datos del reloj te
hagan falta de verdad**, y solo entonces montar esto.
