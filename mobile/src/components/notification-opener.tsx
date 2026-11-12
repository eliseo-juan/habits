import { useEffect } from "react"
import { Platform } from "react-native"
import * as Notifications from "expo-notifications"
import { router } from "expo-router"
import { refreshPush } from "@/lib/push"

// Keeps this phone's push token registered and opens the day sheet of the habit whose notification was tapped
// (also when it cold-starts the app).
export function NotificationOpener() {
  useEffect(() => void refreshPush(), [])
  return Platform.OS === "web" ? null : <TapHandler />
}

function TapHandler() {
  const response = Notifications.useLastNotificationResponse()
  const habitId = response?.notification.request.content.data?.habitId
  useEffect(() => {
    if (habitId) router.push({ pathname: "/log/[habitId]", params: { habitId: String(habitId) } })
  }, [habitId, response?.notification.request.identifier])

  return null
}
