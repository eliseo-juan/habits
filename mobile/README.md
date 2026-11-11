# SmartHabits mobile app

Android and iOS app for SmartHabits, built with Expo (SDK 58) and expo-router. It has the same screens as the [web app](../web/README.md), plus home screen and lock screen widgets, an offline cache and local reminders. The UI is in Spanish.

## Run it

Start the [server](../backend/README.md) somewhere the phone can reach (a LAN IP or an HTTPS domain), then:

```sh
cd mobile
npm ci
npx expo start        # scan the QR code with Expo Go or a development build
```

Enter the server URL, email and password on the login screen.

```sh
npm run lint
npm run typecheck
```

Expo Go is enough for the screens. Widgets and scheduled notifications need a development build: `npx expo run:ios|android`, or `eas build --profile development` (see [Builds](#builds-and-updates)).

## How it works

```
app/                     routes (expo-router)
  (tabs)/                Today, Habits, Progress, Settings
  log/[habitId].tsx      day sheet: counter, skip, clear, note
  habit/[id].tsx         habit detail: stats, monthly calendar, 6-month map
  habit-form.tsx         create and edit: schedule, dates, reminders, archive
  tokens.tsx             list, create and revoke API tokens
  login.tsx
src/
  lib/                   API client, auth, queries (data.tsx), schedule rules, local reminders
  components/            week strip, rows, rings, toasts, shared UI
  widgets/               widget layouts and the code that feeds them
  theme.ts
```

`src/lib/rules.ts` and `src/lib/data.tsx` mirror the web app's, so both clients behave the same.

### Signing in

The app calls `POST /auth/token` with email, password and device name, and keeps the returned device token in secure storage (Keychain / Keystore). Every request sends it as `Authorization: Bearer`. The token appears in the account's token list as `Hábitos · ios|android` and is revoked by signing out or from any client. A device token can also manage the account's other tokens, which is what the Tokens screen uses.

### Offline

The query cache is persisted to AsyncStorage for 24 hours, so the app opens at once with the last data it saw, refreshes in the background, and keeps showing it while offline. Writes made offline fail with a notice; there is no queue.

### Reminders

Reminders are edited in the habit form and stored on the server, so ntfy delivers them too if it is set up. Settings → "Recordatorios en este móvil" mirrors them on this phone as repeating local notifications, daily or on given weekdays; tapping one opens that habit's day sheet.

### Widgets

Built with [`expo-widgets`](https://docs.expo.dev/versions/v58.0.0/sdk/widgets/): one "today's habits" widget with a layout per platform.

- iOS (SwiftUI, `src/widgets/HabitsWidget.tsx`): small, medium, large and lock screen (circular, rectangular, inline). Needs an App Group, which the config plugin sets up and which requires a paid Apple developer account.
- Android (Jetpack Compose, `src/widgets/HabitsWidget.android.tsx`): 3×2, resizable.

Widgets run in an isolated runtime with no hooks or network, so they receive data already prepared. `widget-sync.tsx` pushes it whenever today's data changes, and a background task (`expo-background-task`, at most every ~15 minutes, as the OS decides) refreshes it while the app is closed, reading the token from secure storage. Signing out clears them. Tapping a widget opens the app; it cannot mark habits yet.

## Builds and updates

### Configuration

The repository is public, so nothing that identifies a deployment lives in the code. `app.config.ts` reads it from the environment:

| Variable | Purpose |
|---|---|
| `HABITS_SERVER_URL` | Server pre-filled on the login screen |
| `EAS_PROJECT_ID` | EAS project; enables OTA updates |
| `APP_BUNDLE_ID` | Your own iOS bundle id and Android package (optional) |

Without them the app still builds, with no default server and no OTA updates. Whatever reaches the config ends up inside the binary: `secret` visibility in EAS keeps a value out of git and build logs, not out of the app.

Once, signed in to Expo:

```sh
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init --id <project-id>   # decline writing the id into the config; it comes from EAS_PROJECT_ID
npx eas-cli@latest env:create --environment production --name EAS_PROJECT_ID --value <project-id> --visibility secret
npx eas-cli@latest env:create --environment production --name HABITS_SERVER_URL --value https://habits.example.com --visibility secret
```

Repeat for the `preview` and `development` environments if you use them, and copy the values to `mobile/.env.local` (git-ignored) so local commands see them too.

### Builds

| Profile | Output | Use |
|---|---|---|
| `development` | dev client | local development with widgets and notifications |
| `apk` | APK, `production` environment and channel | sideloading on Android; receives the OTA updates CI publishes |
| `preview` | APK, `preview` channel | testing against another server or channel |
| `production` | AAB / IPA | the stores (`eas submit`) |

```sh
npx eas-cli@latest build --profile apk --platform android
```

The first Android build offers to generate a keystore; accept and EAS keeps it. Losing it means new builds can't be installed over the existing app. When the build finishes, open its link on the phone and install the `.apk` (Android asks once to allow installs from the browser), or run `eas build:run --platform android --latest` with a device connected.

From GitHub: Actions → **🚀 Mobile APK build** → Run workflow. It queues the build on EAS and links it in the run summary. It needs `EXPO_TOKEN` and `EAS_PROJECT_ID` in the `production` environment and an existing keystore, since non-interactive builds can't create one.

### OTA updates

JavaScript changes ship over the air with `expo-updates`. **🚀 Mobile OTA update** publishes to the `production` channel, Android only, on every push to `main` that touches `mobile/`. For iOS or other channels, run `eas update --channel <channel> --environment <environment>` by hand.

The `runtimeVersion` is a fingerprint of the native layer (native dependencies, config plugins, widgets, permissions), so an update only reaches binaries that have the same native code. When a change alters the fingerprint, the workflow looks for an `apk` build with that runtime and queues one if there is none; installing it is the only manual step. `fingerprint.config.js` leaves out `extra` (server, project id) so the environment does not change the hash, but `updates.url` counts, so `EAS_PROJECT_ID` must match locally, on EAS and on GitHub. To print the hash: `npx fingerprint fingerprint:generate --platform android`. Builds with OTA enabled have a "Buscar actualizaciones" (check for updates) button in Settings.

## Not done yet

- Marking habits from a widget (it needs an endpoint usable without the app, such as signed links like the reminder ones).
- An offline write queue and optimistic updates.
- Live Activities.
