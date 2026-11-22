import { useEffect } from "react"
import { useQueries } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useDay, useSession, type Reminder } from "@/lib/data"
import { registerWidgetRefresh } from "@/widgets/background"
import { buildWidgetProps, localTime } from "@/widgets/props"
import { pushWidget } from "@/widgets/sync"

// Mounted while signed in: keeps the home-screen widget in step with whatever the app just loaded or wrote
// (every write invalidates the day query), and schedules the OS-driven refresh for when the app is closed.
export function WidgetSync() {
  const { today, habits, me } = useSession()
  const items = useDay(today).data?.items
  // Same query keys as useReminders, so the Today and habit screens share the cache.
  const reminders = useQueries({
    queries: habits.map((habit) => ({ queryKey: ["reminders", habit.id], queryFn: () => api<Reminder[]>(`/habits/${habit.id}/reminders`), staleTime: 5 * 60_000 })),
  })
  const remindersKey = JSON.stringify(reminders.map((q) => q.data ?? null))

  useEffect(() => {
    if (!items) return
    const byHabit = Object.fromEntries(habits.map((habit, i) => [habit.id, reminders[i]?.data]))
    pushWidget(buildWidgetProps(today, habits, items, byHabit, localTime(me.timezone)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reminders` changes identity every render; remindersKey tracks its content
  }, [today, habits, items, me.timezone, remindersKey])

  useEffect(() => {
    void registerWidgetRefresh()
  }, [])

  return null
}
