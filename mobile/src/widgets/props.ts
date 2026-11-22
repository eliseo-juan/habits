import { colorOf, emojiOf, type DayEntry, type Habit } from "@/lib/rules"
import type { WidgetProps } from "@/widgets/types"

// Pending habits first, then the done ones: the widget shows what is left to do. Within each group the most
// important come first; the sort is stable, so equal priorities keep the app's order.
export function buildWidgetProps(date: string, habits: Habit[], items: DayEntry[]): WidgetProps {
  const rows = items.flatMap((entry) => {
    const habit = habits.find((h) => h.id === entry.habit_id)
    return habit && habit.kind === "build" ? [{ habit, entry }] : []
  })
  const list = rows
    .map(({ habit, entry }) => ({
      id: habit.id,
      name: habit.name,
      icon: emojiOf(habit),
      color: colorOf(habit),
      priority: habit.priority,
      done: entry.status === "done",
      progress: entry.times_per_day > 1 ? `${entry.done_count}/${entry.times_per_day}` : "",
    }))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.priority - a.priority)
  return { signedIn: true, date, done: list.filter((h) => h.done).length, total: list.length, habits: list.slice(0, 10) }
}
