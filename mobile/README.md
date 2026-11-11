# Habits mobile app (Expo)

Native version of the `web/` PWA: the same screens, behaviour and features on React Native + Expo (SDK 58, expo-router), plus home screen widgets, an offline cache and local reminders.

| PWA | App |
|---|---|
| Today: day strip, progress, one-tap marking, undo, day sheet (counter, skip, clear, note) | `app/(tabs)/index.tsx`, `app/log/[habitId].tsx` |
| Habits: cards with the last week, streak and % | `app/(tabs)/habits.tsx` |
| Detail: stats, monthly calendar (done → skipped → empty), 6-month map | `app/habit/[id].tsx` |
| Habit form: create, edit, frequency, dates, reset stats, archive | `app/habit-form.tsx` |
| Monthly progress | `app/(tabs)/progress.tsx` |
| Settings | `app/(tabs)/settings.tsx` |
| API tokens | `app/tokens.tsx` |

The rules and queries (`src/lib/rules.ts`, `src/lib/data.tsx`) are the PWA's; the theme (`src/theme.ts`) is its dark palette. The UI is in Spanish.

## Authentication

The PWA uses a session cookie, which is fragile on native, so the app signs in with `POST /auth/token` (email and password) and keeps the returned **device token** in the system's secure storage (Keychain / Keystore). It is sent as `Authorization: Bearer`. The token shows up under `/tokens` named `Hábitos · ios|android` and can be revoked from there, or by signing out in the app. The server URL is entered on the login screen; `HABITS_SERVER_URL` pre-fills it.

A device token can also list, create and revoke the account's other tokens (MCP, Home Assistant, …) from the app; ordinary API tokens cannot.

## Development

```sh
cd mobile
npm ci
npx expo start            # Expo Go or a development build; scan the QR code
npm run typecheck
```

Widgets and scheduled notifications need a development build.

The server must be reachable from the device (a LAN IP or a public HTTPS domain). For native builds use `npx expo prebuild` or EAS Build (`eas build`). The icon is the PWA's (512 px); store listings want a 1024 px one.

## Configuration, builds and OTA updates

The repository is public, so **nothing that identifies a deployment goes in the code**. `app.config.ts` reads it from environment variables:

| Variable | Purpose |
|---|---|
| `HABITS_SERVER_URL` | Server pre-filled on the login screen |
| `EAS_PROJECT_ID` | EAS project; enables OTA updates |
| `APP_BUNDLE_ID` | Your own iOS bundle id / Android package (optional; defaults to a generic one) |

Without them the app still builds, just with no default server and no OTA updates. Whatever reaches the config ends up inside the binary: `secret` visibility in EAS keeps a value out of git and build logs, not out of the app.

**Once**, on a machine signed in to Expo:

```sh
npm install --global eas-cli
cd mobile
eas login
eas init --id <project-id>      # if asked to write the id into the config, say no: it is read from EAS_PROJECT_ID
eas env:create --environment production --name EAS_PROJECT_ID --value <project-id> --visibility secret
eas env:create --environment production --name HABITS_SERVER_URL --value https://habits.example.com --visibility secret
# repeat with --environment preview and development if you use them
```

For the CLI to see the values locally too, copy them to `mobile/.env.local` (ignored by git). Then:

```sh
eas build --profile development --platform ios|android   # dev client (widgets, notifications)
eas build --profile production --platform all            # store binaries
eas submit --profile production --platform ios|android
```

### Installing an APK without the Play Store

The `apk` and `preview` profiles produce an **APK** that installs directly; `production` produces an AAB, which is only for uploading to the Play Store. For sideloading, `apk` is the one to use: it uses the `production` environment and channel, so it receives the OTA updates CI publishes. `preview` is for testing against another server or channel.

```sh
cd mobile
eas build --profile apk --platform android
```

It takes a few minutes on EAS. The first time, EAS offers to generate the keystore: accept and EAS stores it. Losing it means new builds cannot be installed over the existing app. When it finishes:

- The terminal prints a URL and a QR code; the build is also under expo.dev → the project → **Builds**.
- Open that link **on the phone** and download the `.apk` (or run `eas build:run --platform android --latest` with the phone on USB or an emulator).
- The first time, Android asks to allow the browser to "install unknown apps".

**From GitHub:** Actions → "🚀 Mobile APK build" → Run workflow (manual only; pick `apk` or `preview`). It queues the build on EAS and links it in the run summary without waiting for it. It needs the `EXPO_TOKEN` and `EAS_PROJECT_ID` secrets in the `production` environment, and an existing keystore: make the first build once from a terminal, since non-interactive builds cannot generate one.

After that, JS changes ship as OTA updates (below). For native changes CI queues the `eas build --profile apk` by itself (see below) and the new APK only needs installing. The `preview` APK receives updates from the `preview` channel (`eas update --channel preview --environment preview`); CI only publishes to `production`.

**OTA updates** (`expo-updates`, channels `development` / `preview` / `production`): `eas update --channel production --environment production`, or automatically through `.github/workflows/mobile-update.yml` on every push to `main` that touches `mobile/`. CI publishes **Android only**, as there is no iOS build; for iOS run it by hand with `--platform ios`. It needs the `EXPO_TOKEN` and `EAS_PROJECT_ID` secrets in the GitHub `production` environment, which is also the place to require a manual approval.

The `runtimeVersion` is a **fingerprint** of the native layer (native dependencies, config plugins, widgets, permissions). An update only reaches compatible binaries, so a native change is never pushed over the air to an app that lacks it. When the fingerprint changes, the next `eas update` waits for a new build with that fingerprint. That is why the OTA workflow, after publishing, looks for an `apk` build with that runtime and, if there is none (not even queued), queues one and links it in the run summary. `fingerprint.config.js` leaves out `extra` (server, project id) so environment variables do not change the hash; `updates.url` does count, so `EAS_PROJECT_ID` must be the same locally, on EAS and on GitHub. To print the hash: `npx fingerprint fingerprint:generate --platform android`. Builds with OTA enabled have a "Buscar actualizaciones" (check for updates) button in Settings.

## Widgets

Built with [`expo-widgets`](https://docs.expo.dev/versions/latest/sdk/widgets/): a single "Hábitos de hoy" (today's habits) widget with its own layout per platform.

- iOS (SwiftUI, `src/widgets/HabitsWidget.tsx`): small, medium, large and lock screen (circular, rectangular, inline).
- Android (Jetpack Compose, `src/widgets/HabitsWidget.android.tsx`): 3×2, resizable.

Widgets run in an isolated runtime (no hooks, no async), so they receive data already prepared. `WidgetSync` (`src/widgets/widget-sync.tsx`) pushes it whenever today's data changes, and a background task (`expo-background-task`, at least ~15 minutes apart, as the OS decides) refreshes it while the app is closed, reading the token from secure storage. Signing out clears them. Tapping the widget opens the app; it cannot mark habits because it cannot call the API.

They need a **development build** and do not work in Expo Go: `npx expo prebuild` and `npx expo run:ios|android`, or EAS Build. On iOS the widget needs an App Group, which the plugin configures; that requires a paid Apple developer account.

## Offline and reminders

- The query cache is persisted to AsyncStorage for 24 hours: the app opens instantly with the last data seen and refreshes in the background, and keeps showing it while offline. Writes made offline fail with a notice (there is no queue).
- Settings → "Recordatorios en este móvil" (reminders on this phone) mirrors each habit's server reminders as repeating local notifications (daily or on given weekdays). Tapping one opens that habit's sheet. With ntfy configured as well, both arrive.

## Not done yet

- Marking habits from the widget (needs an endpoint usable without the app, such as signed links like the ntfy ones).
- An offline write queue and optimistic updates.
- Live Activities (the library supports them on iOS).
