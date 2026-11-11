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

La PWA usa una cookie de sesión; en nativo es frágil, así que la app inicia sesión con `POST /auth/token` (email + contraseña) y guarda un **token de API con escritura** en el almacén seguro del sistema (Keychain / Keystore). Se envía como `Authorization: Bearer`. El token aparece en `/tokens` de la web con el nombre `Hábitos · ios|android` y se revoca desde ahí, o al cerrar sesión en la app. El servidor se escribe en la pantalla de login (`EXPO_PUBLIC_API_URL` la rellena por defecto).

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
