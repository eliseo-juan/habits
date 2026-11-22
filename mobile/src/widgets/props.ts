import { colorOf, emojiOf, scheduleLabel, type DayEntry, type Habit } from "@/lib/rules"
import type { WidgetHabit, WidgetProps } from "@/widgets/types"

// Pending habits first, then the done ones: the widget shows what is left to do. Within each group the most
// important come first; the sort is stable, so equal priorities keep the app's order.
export function buildWidgetProps(date: string, habits: Habit[], items: DayEntry[]): WidgetProps {
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
        // Same line the app shows under the name: the period progress for "N days a week" habits, else the schedule.
        subtitle:
          habit.schedule.type === "times_per_period" && entry.period_target !== null
            ? `${entry.period_done}/${entry.period_target} ${habit.schedule.period_unit === "week" ? "esta semana" : "este mes"}`
            : scheduleLabel(habit),
        fraction: entry.status === "done" ? 1 : Math.min(1, entry.done_count / entry.times_per_day),
        progress: entry.times_per_day > 1 ? `${entry.done_count}/${entry.times_per_day}` : "",
      }))
      .sort((a, b) => Number(a.done) - Number(b.done) || b.priority - a.priority)
  const list = rowsOf("build")
  return { signedIn: true, date, done: list.filter((h) => h.done).length, total: list.length, habits: list.slice(0, 10), avoid: rowsOf("limit").slice(0, 10) }
}
