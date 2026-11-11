import { useEffect } from "react"
import { Platform } from "react-native"
import * as Notifications from "expo-notifications"
import { router } from "expo-router"
import { useSession } from "@/lib/data"
import { remindersEnabled, syncReminders } from "@/lib/reminders"

// Re-mirrors the server's reminders whenever the habit list changes.
export function RemindersSync() {
  const { habits } = useSession()
  const key = habits.map((h) => h.id).join(",")

  useEffect(() => {
    void remindersEnabled().then((on) => {
      if (on) void syncReminders(habits).catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return Platform.OS === "web" ? null : <NotificationOpener />
}

// Opens the day sheet of the habit whose notification was tapped (also when it cold-starts the app).
function NotificationOpener() {
  const response = Notifications.useLastNotificationResponse()
  const habitId = response?.notification.request.content.data?.habitId
  useEffect(() => {
    if (habitId) router.push({ pathname: "/log/[habitId]", params: { habitId: String(habitId) } })
  }, [habitId, response?.notification.request.identifier])

  return null
}
