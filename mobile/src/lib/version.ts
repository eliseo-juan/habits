import * as Application from "expo-application"
import Constants from "expo-constants"

export const appVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "–"
export const buildNumber = Application.nativeBuildVersion

export const appVersionLabel = () => (buildNumber ? `${appVersion} (${buildNumber})` : appVersion)

export const shortHash = (value: string | null | undefined) => (value ? value.slice(0, 8) : "–")

export const dateTime = (date: Date | null | undefined) =>
  date ? date.toLocaleString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–"
