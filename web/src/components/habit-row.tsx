import { Bell, Flame } from "lucide-react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { HabitRing } from "@/components/habit-ring"
import { useHabitStats, useLogWriter, useReminders, useSession } from "@/lib/data"
import { colorOf, emojiOf, scheduleLabel, type DayEntry, type Habit, type Look } from "@/lib/rules"
import { cn } from "@/lib/utils"

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-white/5", className)}>
      {children}
    </span>
  )
}

export function HabitIcon({ habit, size = "md" }: { habit: Look; size?: "md" | "lg" }) {
  const color = colorOf(habit)
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-2xl font-semibold", size === "md" ? "size-11 text-xl" : "size-14 text-3xl")}
      style={{ background: `linear-gradient(135deg, ${color}33, ${color}0d)`, boxShadow: `inset 0 0 0 1px ${color}33`, color }}
    >
      {emojiOf(habit)}
    </span>
  )
}

function periodLabel(habit: Habit, entry: DayEntry): string {
  if (entry.period_target === null) return "Objetivo cumplido"
  return `${entry.period_done}/${entry.period_target} ${habit.schedule.period_unit === "week" ? "esta semana" : "este mes"}`
}

export function HabitRow({ habit, entry, day, onOpen, dimmed }: { habit: Habit; entry: DayEntry; day: string; onOpen: () => void; dimmed?: boolean }) {
  const { today } = useSession()
  const writer = useLogWriter()
  const streak = useHabitStats(habit.id).data?.current_streak ?? 0
  const reminders = (useReminders(habit.id).data ?? []).filter((r) => r.enabled).map((r) => r.time_local.slice(0, 5))
  const isFuture = day > today
  const target = entry.times_per_day

  async function tap() {
    if (isFuture) {
      toast("Día futuro", { description: "Solo puedes marcar hoy o días pasados." })
      return
    }
    const previous = await writer.read(habit.id, day)
    const count = previous.done_count >= target ? 0 : previous.done_count + 1
    if (!(await writer.write(habit.id, day, { ...previous, done_count: count, skipped: false }))) return
    navigator.vibrate?.(10)
    toast(count >= target ? `${emojiOf(habit)} ${habit.name} ${habit.kind === "limit" ? "registrado" : "hecho"}` : count ? `${count}/${target}` : "Desmarcado", {
      action: { label: "Deshacer", onClick: () => writer.write(habit.id, day, previous) },
    })
  }

  return (
    <motion.div
      layout
      className={cn(
        "group flex items-center gap-3 rounded-3xl border border-white/5 bg-card/60 p-3 backdrop-blur transition-colors active:bg-card",
        dimmed && "opacity-60",
      )}
    >
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <HabitIcon habit={habit} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-medium", entry.status === "done" && "text-muted-foreground line-through decoration-white/20")}>
            {habit.name}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            <Chip>{habit.schedule.type === "times_per_period" ? periodLabel(habit, entry) : scheduleLabel(habit)}</Chip>
            {reminders.length > 0 && (
              <Chip>
                <Bell className="size-3" />
                {reminders.join(" · ")}
              </Chip>
            )}
            {streak > 1 && (
              <Chip className="bg-orange-500/10 text-orange-300 ring-orange-500/20">
                <Flame className="size-3" />
                {streak}
              </Chip>
            )}
          </span>
        </span>
      </button>
      <motion.button whileTap={{ scale: 0.85 }} onClick={tap} disabled={isFuture} className="rounded-full disabled:opacity-40" aria-label={`Marcar ${habit.name}`}>
        <HabitRing status={entry.status} count={entry.done_count} target={target} color={colorOf(habit)} />
      </motion.button>
    </motion.div>
  )
}
