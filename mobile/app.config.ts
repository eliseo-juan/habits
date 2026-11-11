import type { ConfigContext, ExpoConfig } from "expo/config"

// Everything that identifies *your* deployment comes from the environment, never from this (public) repo:
//   HABITS_SERVER_URL  default server shown on the login screen
//   EAS_PROJECT_ID     EAS project, enables OTA updates (`eas init` / dashboard)
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
    ios: { supportsTablet: false, bundleIdentifier: bundleId },
    android: {
      package: bundleId,
      adaptiveIcon: {
        backgroundColor: "#0b0d12",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: { bundler: "metro", output: "single" },
    // OTA: JS-only changes ship through `eas update`; a new binary is needed when native code or the widgets change.
    runtimeVersion: { policy: "appVersion" },
    ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : {}),
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
