# Colega en Supabase — avisos con la app cerrada

Alternativa a `worker/` (Cloudflare). Hablan **el mismo protocolo**, así que la
app funciona con cualquiera de los dos: solo cambia la URL que pegas en
*Perfil → Avisos con la app cerrada*.

## Estado: desplegado y funcionando

| Pieza | Estado |
|---|---|
| Tabla `colega_push` | ✅ creada, RLS activo sin políticas (solo la función la toca) |
| Tabla `colega_config` | ✅ guarda el secreto del cron |
| Edge Function `colega-push` | ✅ activa, `verify_jwt: false` |
| Cron `colega-recordatorios` | ✅ cada minuto |
| Claves VAPID | ✅ reutilizadas del proyecto (las mismas de FinanzasPro) |

**URL:** `https://qrevajldlzskbigjebmo.supabase.co/functions/v1/colega-push`

## Privacidad

El servidor guarda **solo marcas de tiempo** y la suscripción push. Nunca el
contenido de los recordatorios. Al llegar la hora envía un push **vacío**; el
Service Worker del teléfono lee el texto desde su IndexedDB local y compone la
notificación.

Efecto secundario: aunque alguien descubriera la URL y registrase su
dispositivo, solo recibiría impulsos vacíos sin ningún significado.

## Endpoints

| Ruta | Método | Para qué |
|---|---|---|
| `/health` | GET | Comprobar que está vivo |
| `/vapid-public` | GET | La app pide la clave pública |
| `/register` | POST | Guardar suscripción + horas |
| `/unregister` | POST | Borrar este dispositivo |
| `/test` | POST | Forzar un push inmediato |
| `/tick` | POST | Solo el cron (exige `x-cron-secret`) |

## Consumo frente al plan gratuito

| Recurso | Uso real | Límite gratuito |
|---|---|---|
| Invocaciones Edge Function | ~43.200/mes | 500.000/mes (8,6 %) |
| Filas en base de datos | ≤ 20 | — |

## Mantenimiento

```sql
-- Ver el cron
SELECT jobid, jobname, schedule, active FROM cron.job;

-- Ver las últimas ejecuciones
SELECT status_code, content, created FROM net._http_response
ORDER BY created DESC LIMIT 5;

-- Dispositivos registrados (sin exponer la suscripción)
SELECT client_id, array_length(times,1) AS avisos, updated_at FROM colega_push;

-- Desactivar temporalmente
SELECT cron.unschedule('colega-recordatorios');
```

## Nota

No comparte nada con FinanzasPro salvo el proyecto y las claves VAPID. Sus
tablas, su función y su cron (`recordatorios-diarios`, 1 vez al día) siguen
intactos.
