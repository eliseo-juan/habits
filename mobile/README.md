# Hábitos — app móvil (Expo)

Versión nativa de la PWA de `web/`: mismas pantallas, misma UX y mismas funciones, sobre React Native + Expo (SDK 58, expo-router).

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

En el móvil, el servidor debe ser alcanzable desde el dispositivo (IP de la LAN o dominio público con HTTPS). Para builds nativas: `npx expo prebuild` o EAS Build (`eas build`). El icono es el de la PWA (512 px); para publicar en tiendas conviene uno de 1024 px.

## Pendiente (siguiente fase)

- Widgets (pantalla de inicio / bloqueo) con los datos de `/today` y `/awtrix/today`.
- Recordatorios locales (en la PWA aparece como «Próximamente»).
- Caché offline y cola de escrituras.
