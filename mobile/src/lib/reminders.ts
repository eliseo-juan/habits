import { Platform } from "react-native"
import * as Notifications from "expo-notifications"
import { api } from "@/lib/api"
import type { Reminder } from "@/lib/data"
import { emojiOf, type Habit } from "@/lib/rules"
import { storage } from "@/lib/storage"

const FLAG = "habits.localReminders"
const CHANNEL = "reminders"

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
})

export const remindersEnabled = async () => (await storage.get(FLAG)) === "1"

export async function setRemindersEnabled(enabled: boolean, habits: Habit[]): Promise<boolean> {
  if (!enabled) {
    await storage.set(FLAG, "0")
    await Notifications.cancelAllScheduledNotificationsAsync()
    return false
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: "Recordatorios", importance: Notifications.AndroidImportance.DEFAULT })
  }
  const current = await Notifications.getPermissionsAsync()
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted
  if (!granted) return false
  await storage.set(FLAG, "1")
  await syncReminders(habits)
  return true
}

// The reminders live on the server (and drive ntfy); this mirrors them as local, repeating notifications.
// Server weekdays run 0 = Monday … 6 = Sunday, Expo's run 1 = Sunday … 7 = Saturday.
export async function syncReminders(habits: Habit[]) {
  const lists = await Promise.all(
    habits.filter((h) => h.kind === "build").map(async (habit) => ({ habit, reminders: await api<Reminder[]>(`/habits/${habit.id}/reminders`).catch(() => [] as Reminder[]) })),
  )
  await Notifications.cancelAllScheduledNotificationsAsync()
  for (const { habit, reminders } of lists) {
    for (const reminder of reminders.filter((r) => r.enabled)) {
      const [hour, minute] = reminder.time_local.split(":").map(Number)
      const content = { title: `${emojiOf(habit)} ${habit.name}`, body: "Toca para marcarlo", data: { habitId: habit.id } }
      const base = { hour, minute, channelId: CHANNEL }
      if (reminder.weekdays === null) {
        await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...base } })
      } else {
        for (const day of reminder.weekdays) {
          await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: ((day + 1) % 7) + 1, ...base } })
        }
      }
    }
  }
}
