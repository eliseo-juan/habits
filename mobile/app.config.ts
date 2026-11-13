import type { ConfigContext, ExpoConfig } from "expo/config"

// Everything that identifies *your* deployment comes from the environment, never from this (public) repo:
//   HABITS_SERVER_URL  default server shown on the login screen
//   EAS_PROJECT_ID     EAS project, enables OTA updates (`eas init` / dashboard)
//   GOOGLE_SERVICES_FILE  path (or EAS file env var) of Firebase's google-services.json, needed for Android pushes
//   APP_BUNDLE_ID      iOS bundle id / Android package (defaults to a generic id)
// In EAS they are environment variables (`eas env:create`, visibility "secret"); locally put them in `mobile/.env.local`
// (git-ignored). Without them the app still builds, it just has no default server and no OTA updates.
// Note: values that reach the app config end up inside the shipped binary, so "secret" keeps them out of git
// and build logs, not out of the app.
export default ({ config }: ConfigContext): ExpoConfig => {
  const bundleId = process.env.APP_BUNDLE_ID ?? "dev.habits.app"
  const projectId = process.env.EAS_PROJECT_ID

  return {
    ...config,
    name: "Hábitos",
    slug: "habits",
    scheme: "habits",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    backgroundColor: "#0b0d12",
    ios: { supportsTablet: false, bundleIdentifier: bundleId, config: { usesNonExemptEncryption: false } },
    android: {
      package: bundleId,
      // FCM credentials for native pushes: download google-services.json from your Firebase project (see README).
      ...(process.env.GOOGLE_SERVICES_FILE ? { googleServicesFile: process.env.GOOGLE_SERVICES_FILE } : {}),
      adaptiveIcon: {
        backgroundColor: "#0b0d12",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: { bundler: "metro", output: "single" },
    // OTA: JS-only changes ship through `eas update`. The runtime version is a fingerprint of the native layer
    // (native deps, config plugins, widgets), so an update only reaches binaries it is compatible with and a native
    // change can never be pushed over the air to an app that lacks it.
    runtimeVersion: { policy: "fingerprint" },
    ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}`, checkAutomatically: "ON_LOAD", fallbackToCacheTimeout: 0 } } : {}),
    extra: {
      ...config.extra,
      serverUrl: process.env.HABITS_SERVER_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "",
      ...(projectId ? { eas: { projectId } } : {}),
    },
    plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        "icon": "./assets/notification-icon.png",
        "color": "#4ddba5"
      }
    ],
    [
      "expo-splash-screen",
      {
        "backgroundColor": "#0b0d12",
        "image": "./assets/icon.png",
        "imageWidth": 120
      }
    ],
    [
      "expo-widgets",
      {
        "enableAndroid": true,
        "widgets": [
          {
            "name": "HabitsToday",
            "displayName": "Hábitos de hoy",
            "description": "Progreso del día y lo que te queda por hacer",
            "ios": {
              "supportedFamilies": [
                "systemSmall",
                "systemMedium",
                "systemLarge",
                "accessoryCircular",
                "accessoryRectangular",
                "accessoryInline"
              ],
              "initialLayout": "src/widgets/HabitsWidget.tsx"
            },
            "android": {
              "targetCellWidth": 3,
              "targetCellHeight": 2,
              "initialLayout": "src/widgets/HabitsWidget.android.tsx"
            }
          }
        ]
      }
    ]
  ],
  }
}
