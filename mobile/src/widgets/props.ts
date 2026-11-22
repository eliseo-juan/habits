import { addDays, colorOf, emojiOf, parse, scheduleLabel, WEEKDAYS, type DayEntry, type Habit } from "@/lib/rules"
import type { Reminder } from "@/lib/data"
import type { WidgetDay, WidgetHabit, WidgetProps } from "@/widgets/types"

// Current wall-clock time ("HH:MM") in the user's timezone; the device's own when it cannot be resolved.
export function localTime(timezone?: string): string {
  try {
    return new Date().toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false })
  } catch {
    return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
  }
}

// Next reminder of the day that has not gone out yet: enabled, set for today's weekday and later than now. The
// server remembers what it already sent, but a reminder whose time has passed is as good a proxy as the widget needs.
function nextReminder(reminders: Reminder[] | undefined, date: string, now: string): string {
  const weekday = (parse(date).getUTCDay() + 6) % 7 // 0 = Monday, like the API
  const times = (reminders ?? [])
    .filter((r) => r.enabled && (!r.weekdays || r.weekdays.includes(weekday)))
    .map((r) => r.time_local.slice(0, 5))
    .filter((time) => time > now)
    .sort()
  return times[0] ?? ""
}

// How many days the Android widget can go back, today included.
export const WIDGET_DAYS = 7
export const widgetDates = (today: string) => Array.from({ length: WIDGET_DAYS }, (_, i) => addDays(today, i - WIDGET_DAYS + 1))

// "Hoy", "Ayer", then the weekday and day of the month ("Jue 20").
export function widgetDayLabel(date: string, today: string): string {
  if (date === today) return "Hoy"
  if (date === addDays(today, -1)) return "Ayer"
  const d = parse(date)
  const weekday = WEEKDAYS[(d.getUTCDay() + 6) % 7]
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${d.getUTCDate()}`
}

// Rows of one day, ordered by priority, highest first, like the app; the sort is stable, so equal priorities keep
// the app's order. Done habits stay in place (dimmed in the widget) rather than jumping to the end. Pending
// reminders only exist for today.
function dayRows(date: string, today: string, habits: Habit[], items: DayEntry[], reminders: Record<number, Reminder[] | undefined>, now: string) {
  const rowsOf = (kind: Habit["kind"]): WidgetHabit[] =>
    items
      .flatMap((entry) => {
        const habit = habits.find((h) => h.id === entry.habit_id)
        return habit && habit.kind === kind ? [{ habit, entry }] : []
      })
      .map(({ habit, entry }) => ({
        id: habit.id,
        name: habit.name,
        icon: emojiOf(habit),
        color: colorOf(habit),
        priority: habit.priority,
        done: entry.status === "done",
        // Line under the name: the period progress for "N days a week" habits, today's count for several-times-a-day
        // ones, else the schedule.
        subtitle:
          habit.schedule.type === "times_per_period" && entry.period_target !== null
            ? habit.kind === "limit"
              ? // For a limit the period target is a maximum, not a goal.
                `${entry.period_done ?? 0} de máx. ${entry.period_target} ${habit.schedule.period_unit === "week" ? "esta semana" : "este mes"}`
              : `${entry.period_done} de ${entry.period_target} ${habit.schedule.period_unit === "week" ? "esta semana" : "este mes"}`
            : entry.times_per_day > 1
              ? `${entry.done_count} de ${entry.times_per_day}${date === today ? " hoy" : ""}`
              : scheduleLabel(habit),
        reminder: entry.status === "done" || date !== today ? "" : nextReminder(reminders[habit.id], date, now),
        // The ring around the icon: the week's (or month's) progress for period habits, today's count otherwise.
        // Limits have no ring: filling up towards a maximum is not progress.
        fraction:
          habit.kind === "limit"
            ? 0
            : entry.status === "done"
            ? 1
            : entry.period_target
              ? Math.min(1, (entry.period_done ?? 0) / entry.period_target)
              : Math.min(1, entry.done_count / entry.times_per_day),
        progress: entry.times_per_day > 1 ? `${entry.done_count}/${entry.times_per_day}` : "",
      }))
      .sort((a, b) => b.priority - a.priority)
  return { habits: rowsOf("build").slice(0, 10), avoid: rowsOf("limit").slice(0, 10) }
}

// `days` are the dates the app has loaded, with their entries; today must be among them.
export function buildWidgetProps(
  today: string,
  habits: Habit[],
  days: { date: string; items: DayEntry[] }[],
  reminders: Record<number, Reminder[] | undefined> = {},
  now = localTime(),
): WidgetProps {
  const shown: WidgetDay[] = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, items }) => ({ date, label: widgetDayLabel(date, today), ...dayRows(date, today, habits, items, reminders, now) }))
  const current = shown.find((d) => d.date === today) ?? { habits: [], avoid: [] }
  return {
    signedIn: true,
    date: today,
    done: current.habits.filter((h) => h.done).length,
    total: current.habits.length,
    habits: current.habits,
    avoid: current.avoid,
    days: shown,
    selected: Math.max(0, shown.findIndex((d) => d.date === today)),
  }
}
