import { useEffect } from "react"
import { useQueries } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useSession, type Reminder } from "@/lib/data"
import type { DayEntry } from "@/lib/rules"
import { registerWidgetRefresh } from "@/widgets/background"
import { buildWidgetProps, localTime, widgetDates } from "@/widgets/props"
import { pushWidget } from "@/widgets/sync"

// Mounted while signed in: keeps the home-screen widget in step with whatever the app just loaded or wrote
// (every write invalidates the day query), and schedules the OS-driven refresh for when the app is closed.
// Pushes select today on the widget, unless `selectDate` says otherwise: the day sheet the widget opened for an
// earlier day keeps that day on screen.
export function WidgetSync({ selectDate }: { selectDate?: string } = {}) {
  const { today, habits, me } = useSession()
  // The widget can step back through the last days, so it gets all of them. Same keys as useDay: the Today screen
  // and every write (which invalidates them) keep them fresh.
  const dates = widgetDates(today)
  const days = useQueries({
    queries: dates.map((date) => ({ queryKey: ["day", date], queryFn: () => api<{ items: DayEntry[] }>(`/today?date=${date}`) })),
  })
  const items = days[dates.length - 1]?.data?.items
  const daysKey = JSON.stringify(days.map((q) => q.data ?? null))
  // Same query keys as useReminders, so the Today and habit screens share the cache.
  const reminders = useQueries({
    queries: habits.map((habit) => ({ queryKey: ["reminders", habit.id], queryFn: () => api<Reminder[]>(`/habits/${habit.id}/reminders`), staleTime: 5 * 60_000 })),
  })
  const remindersKey = JSON.stringify(reminders.map((q) => q.data ?? null))

  useEffect(() => {
    if (!items) return
    const byHabit = Object.fromEntries(habits.map((habit, i) => [habit.id, reminders[i]?.data]))
    const loaded = dates.flatMap((date, i) => (days[i]?.data ? [{ date, items: days[i].data.items }] : []))
    pushWidget(buildWidgetProps(today, habits, loaded, byHabit, localTime(me.timezone), selectDate ?? today))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query results change identity every render; the keys track their content
  }, [today, habits, items, me.timezone, remindersKey, daysKey, selectDate])

  useEffect(() => {
    void registerWidgetRefresh()
  }, [])

  return null
}
