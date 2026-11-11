import { Platform } from "react-native"
import * as BackgroundTask from "expo-background-task"
import * as TaskManager from "expo-task-manager"
import { storage } from "@/lib/storage"
import type { DayEntry, Habit } from "@/lib/rules"
import { buildWidgetProps } from "@/widgets/props"
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
    const [today, habits] = await Promise.all([get<{ date: string; items: DayEntry[] }>("/today"), get<Habit[]>("/habits")])
    pushWidget(buildWidgetProps(today.date, habits, today.items))
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
