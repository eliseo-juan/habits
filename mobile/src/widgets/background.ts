import { Platform } from "react-native"
import * as BackgroundTask from "expo-background-task"
import * as TaskManager from "expo-task-manager"
import { storage } from "@/lib/storage"
import type { HabitStats, Reminder } from "@/lib/data"
import type { DayEntry, Habit } from "@/lib/rules"
import { buildWidgetProps, localTime, widgetDates } from "@/widgets/props"
import { pushWidget } from "@/widgets/sync"

export const WIDGET_TASK = "habits-widget-refresh"

// Defined at module scope so the OS can run it while the app is not open. It cannot use React state or the
// auth context, so it reads the stored credentials itself and talks to the API directly.
TaskManager.defineTask(WIDGET_TASK, async () => {
  try {
    const [baseUrl, token] = await Promise.all([storage.get("habits.baseUrl"), storage.get("habits.token")])
    if (!baseUrl || !token) return BackgroundTask.BackgroundTaskResult.Success
    const get = async <T>(path: string): Promise<T> => {
      const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error(String(response.status))
      return response.json()
    }
    const [today, habits, me] = await Promise.all([get<{ date: string; items: DayEntry[] }>("/today"), get<Habit[]>("/habits"), get<{ timezone: string }>("/me")])
    // Reminders only matter for the habits still on the list; a failed request just hides that habit's bell.
    const due = today.items.map((item) => item.habit_id)
    const reminders = Object.fromEntries(await Promise.all(due.map(async (id) => [id, await get<Reminder[]>(`/habits/${id}/reminders`).catch(() => undefined)] as const)))
    // The earlier days for the widget's day switcher; one that fails to load is just left out.
    const earlier = await Promise.all(
      widgetDates(today.date).slice(0, -1).map(async (date) => {
        const day = await get<{ items: DayEntry[] }>(`/today?date=${date}`).catch(() => null)
        return day ? [{ date, items: day.items }] : []
      }),
    )
    const streaks = Object.fromEntries(await Promise.all(due.map(async (id) => [id, await get<HabitStats>(`/habits/${id}/stats`).then((s) => s.current_streak, () => undefined)] as const)))
    pushWidget(buildWidgetProps(today.date, habits, [...earlier.flat(), { date: today.date, items: today.items }], reminders, localTime(me.timezone), today.date, streaks))
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function registerWidgetRefresh() {
  if (Platform.OS === "web") return
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(WIDGET_TASK))) await BackgroundTask.registerTaskAsync(WIDGET_TASK, { minimumInterval: 15 })
  } catch {
    // background tasks are unavailable in Expo Go and simulators
  }
}
