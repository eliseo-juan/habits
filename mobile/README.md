# Hábitos — app móvil (Expo)

Versión nativa de la PWA de `web/`: mismas pantallas, misma UX y mismas funciones, sobre React Native + Expo (SDK 58, expo-router), más widgets, caché offline y recordatorios locales.

| PWA | App |
|---|---|
| Hoy: tira de días, progreso, marcar con un toque, deshacer, hoja del día (contador, saltar, borrar, nota) | `app/(tabs)/index.tsx`, `app/log/[habitId].tsx` |
| Hábitos: tarjetas con la última semana, racha y % | `app/(tabs)/habits.tsx` |
| Detalle: estadísticas, calendario mensual (hecho → saltado → vacío), mapa de 6 meses | `app/habit/[id].tsx` |
| Formulario de hábito: crear, editar, frecuencia, fechas, reiniciar estadísticas, archivar | `app/habit-form.tsx` |
| Progreso mensual | `app/(tabs)/progress.tsx` |
| Ajustes | `app/(tabs)/settings.tsx` |

La lógica de reglas y las consultas (`src/lib/rules.ts`, `src/lib/data.tsx`) son las de la PWA; el tema (`src/theme.ts`) es su paleta oscura.

## Autenticación

La PWA usa una cookie de sesión; en nativo es frágil, así que la app inicia sesión con `POST /auth/token` (email + contraseña) y guarda un **token de API con escritura** en el almacén seguro del sistema (Keychain / Keystore). Se envía como `Authorization: Bearer`. El token aparece en `/tokens` de la web con el nombre `Hábitos · ios|android` y se revoca desde ahí, o al cerrar sesión en la app. El servidor se escribe en la pantalla de login (`HABITS_SERVER_URL` la rellena por defecto).

La gestión de tokens (MCP, Home Assistant) sigue siendo solo de la web: los tokens de API no pueden crear otros tokens.

## Desarrollo

```sh
cd mobile
npm ci
npx expo start            # Expo Go o un dev build; escanea el QR
npm run typecheck
```

Los widgets y las notificaciones programadas necesitan un development build.

En el móvil, el servidor debe ser alcanzable desde el dispositivo (IP de la LAN o dominio público con HTTPS). Para builds nativas: `npx expo prebuild` o EAS Build (`eas build`). El icono es el de la PWA (512 px); para publicar en tiendas conviene uno de 1024 px.

## Configuración privada, builds y OTA

El repo es público: **nada que identifique tu despliegue va en el código**. `app.config.ts` lee de variables de entorno:

| Variable | Para qué |
|---|---|
| `HABITS_SERVER_URL` | Servidor que aparece por defecto en el login |
| `EAS_PROJECT_ID` | Proyecto de EAS; activa las actualizaciones OTA |
| `APP_BUNDLE_ID` | Bundle id / package propio (opcional; por defecto uno genérico) |

Sin ellas la app compila igual, solo sin servidor por defecto ni OTA. Ojo: lo que llega al config acaba dentro del binario, así que `secret` en EAS lo mantiene fuera de git y de los logs de build, no fuera de la app.

**Una vez** (en tu máquina, con sesión de Expo):

```sh
npm install --global eas-cli
cd mobile
eas login
eas init --id <tu-project-id>      # si pregunta por escribir el id en la config, di que no: lo lee de EAS_PROJECT_ID
eas env:create --environment production --name EAS_PROJECT_ID --value <tu-project-id> --visibility secret
eas env:create --environment production --name HABITS_SERVER_URL --value https://tu-servidor --visibility secret
# repite con --environment preview y development si los usas
```

Para que el CLI también lo vea en local, copia los valores a `mobile/.env.local` (ignorado por git). Después:

```sh
eas build --profile development --platform ios|android   # dev client (widgets, notificaciones)
eas build --profile production --platform all            # binarios de tienda
eas submit --profile production --platform ios|android
```

### Instalar el APK sin pasar por Play Store

Los perfiles `apk` y `preview` generan un **APK** (instalable directamente); `production` genera un AAB, que solo sirve para subir a Play Store. Para uso propio, `apk` es el recomendado: usa el entorno y el canal `production`, así recibe las OTAs que publica el CI. `preview` es para probar con otro servidor/canal.

```sh
cd mobile
eas build --profile apk --platform android
```

Tarda unos minutos en la nube de EAS (la primera vez pregunta si genera el keystore: di que sí y EAS lo guarda; no lo pierdas, o no podrás actualizar encima de la app instalada). Al terminar:

- En la terminal sale una URL y un QR; también está en expo.dev → tu proyecto → **Builds**.
- Abre ese enlace **en el móvil** y descarga el `.apk` (o `eas build:run --platform android --latest` con el móvil por USB/emulador).
- Android pedirá permitir «instalar apps desconocidas» para el navegador la primera vez.

**Desde GitHub:** Actions → «Mobile build (APK)» → Run workflow (solo manual; elige `apk` o `preview`). Encola el build en EAS y deja el enlace en el resumen de la ejecución; no espera a que termine. Necesita los secretos `EXPO_TOKEN` y `EAS_PROJECT_ID` del entorno `production`, y que el keystore ya exista: haz el primer build una vez desde tu terminal (los builds no interactivos no pueden generarlo).

Las siguientes versiones: otro `eas build --profile apk` para cambios nativos, y las OTAs (abajo) para cambios de JS. El APK `preview` recibe OTAs del canal `preview` (`eas update --channel preview --environment preview`); el CI publica solo en `production`.

**OTA** (`expo-updates`, canales `development` / `preview` / `production`): `eas update --channel production --environment production`, o automático con `.github/workflows/mobile-update.yml` al hacer push a `main` que toque `mobile/` (secretos `EXPO_TOKEN` y `EAS_PROJECT_ID` en el entorno `production` de GitHub; conviene exigir aprobación manual ahí).

La `runtimeVersion` es un **fingerprint** de la capa nativa (dependencias nativas, config plugins, widgets, permisos): una OTA solo llega a binarios compatibles, así que un cambio nativo nunca se empuja por aire a una app que no lo tiene. Si lo cambias, el siguiente `eas update` queda esperando a un build nuevo con ese fingerprint. `fingerprint.config.js` excluye `extra` (servidor, project id) para que las variables de entorno no cambien el hash; `updates.url` sí cuenta, así que el `EAS_PROJECT_ID` debe ser el mismo en tu máquina, en EAS y en GitHub. Para ver el hash: `npx fingerprint fingerprint:generate --platform ios`. En Ajustes hay un botón «Buscar actualizaciones» (en builds con OTA activo).

## Widgets

Con [`expo-widgets`](https://docs.expo.dev/versions/latest/sdk/widgets/) (oficial de Expo): un solo widget, «Hábitos de hoy», con layout propio por plataforma.

- iOS (SwiftUI, `src/widgets/HabitsWidget.tsx`): pequeño, mediano, grande y de pantalla de bloqueo (circular, rectangular, en línea).
- Android (Jetpack Compose, `src/widgets/HabitsWidget.android.tsx`): 3×2, redimensionable.

Los widgets corren en un runtime aislado (sin hooks ni async), así que reciben los datos ya preparados: `WidgetSync` (`src/widgets/widget-sync.tsx`) los empuja cada vez que cambia el día de hoy, y una tarea en segundo plano (`expo-background-task`, ~15 min como mínimo, lo decide el SO) los refresca con la app cerrada leyendo el token del almacén seguro. Al cerrar sesión se vacían. Tocar el widget abre la app; no marca hábitos desde el widget porque no puede llamar a la API.

Requieren **development build** (no funcionan en Expo Go): `npx expo prebuild` y `npx expo run:ios|android`, o EAS Build. Tras añadir el widget en iOS hace falta un App Group (`group.dev.habits.app`, lo configura el plugin; con cuenta de pago de Apple).

## Offline y recordatorios

- La caché de consultas se persiste en AsyncStorage (24 h): la app abre al instante con lo último visto y refresca en segundo plano; sin conexión sigue mostrándolo. Las escrituras sin conexión fallan con un aviso (no hay cola).
- Ajustes → «Recordatorios en este móvil» replica como notificaciones locales repetidas los recordatorios de cada hábito del servidor (diarios o por días de la semana). Tocar una abre la hoja de ese hábito. Si además tienes ntfy configurado recibirás ambos.

## Pendiente

- Marcar hábitos desde el widget (requiere un endpoint accesible sin la app, p. ej. enlaces firmados como los de ntfy).
- Cola de escrituras offline y actualizaciones optimistas.
- Live Activities (la librería lo soporta en iOS).
