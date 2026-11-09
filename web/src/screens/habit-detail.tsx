import { useState } from "react"
import { ArrowLeft, Bell, ChevronLeft, ChevronRight, Flame, Trophy } from "lucide-react"
import { motion } from "motion/react"
import { HabitIcon } from "@/components/habit-row"
import { Button } from "@/components/ui/button"
import { useHabitStats, useLogWriter, useReminders, useSession, useStatuses, useYear } from "@/lib/data"
import { addDays, colorOf, iso, percent, MONTHS, scheduleLabel, shiftMonth, weekday, WEEKDAYS, type Habit, type Status } from "@/lib/rules"
import { cn } from "@/lib/utils"

const CELL: Record<Status, string> = {
  done: "",
  failed: "text-rose-300 ring-1 ring-rose-500/40",
  skipped: "bg-white/5 text-muted-foreground line-through",
  pending: "ring-1 ring-primary/60",
  not_due: "text-muted-foreground/40",
}

function monthDays(month: string): (string | null)[] {
  const [year, number] = month.split("-").map(Number)
  const first = iso(new Date(Date.UTC(year, number - 1, 1)))
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return [...Array(weekday(first)).fill(null), ...Array.from({ length }, (_, i) => addDays(first, i))]
}

export function HabitDetail({ habit, onBack }: { habit: Habit; onBack: () => void }) {
  const { today } = useSession()
  const statusOf = useStatuses()
  const writer = useLogWriter()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [year, monthNumber] = month.split("-").map(Number)
  const overall = useHabitStats(habit.id).data
  const monthView = useYear(year).data?.habits.find((h) => h.habit_id === habit.id)
  const monthly = monthView?.months.find((m) => m.month === month)
  const reminders = (useReminders(habit.id).data ?? []).filter((r) => r.enabled).map((r) => r.time_local.slice(0, 5))
  const color = colorOf(habit)

  async function cycle(day: string) {
    if (day > today || day < habit.start_date) return
    const log = await writer.read(habit.id, day)
    const target = habit.schedule.times_per_day
    if (log.skipped) await writer.write(habit.id, day, { ...log, done_count: 0, skipped: false })
    else if (log.done_count >= target) await writer.write(habit.id, day, { ...log, done_count: 0, skipped: true })
    else await writer.write(habit.id, day, { ...log, done_count: target, skipped: false })
  }

  const yearStart = addDays(today, -7 * 26 - weekday(today))
  const heatmap = Array.from({ length: 27 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(yearStart, w * 7 + d)))

  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="space-y-5">
      <header className="flex items-center gap-3 pt-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={onBack} aria-label="Volver">
          <ArrowLeft />
        </Button>
        <HabitIcon habit={habit} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{habit.name}</h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {scheduleLabel(habit.schedule)}
            {reminders.length > 0 && (
              <>
                · <Bell className="size-3" /> {reminders.join(", ")}
              </>
            )}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Flame className="size-4 text-orange-400" />} label="Racha actual" value={overall?.current_streak ?? "–"} />
        <StatCard icon={<Trophy className="size-4 text-amber-300" />} label="Mejor racha" value={overall?.best_streak ?? "–"} />
        <StatCard label="Cumplimiento" value={`${percent(overall?.percentage)}%`} accent={color} percentage={overall?.percentage ?? 0} />
        <StatCard label="Hechos · fallados" value={overall ? `${overall.done} · ${overall.failed}` : "–"} />
      </div>

      <section className="rounded-3xl border border-white/5 bg-card/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior">
            <ChevronLeft />
          </Button>
          <div className="text-center">
            <p className="font-medium capitalize">
              {MONTHS[monthNumber - 1]} {year}
            </p>
            <p className="text-xs text-muted-foreground">{percent(monthly?.percentage)}% este mes</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente">
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="pb-1 text-[11px] text-muted-foreground capitalize">
              {w.slice(0, 2)}
            </span>
          ))}
          {monthDays(month).map((day, i) => {
            if (!day) return <span key={`blank-${i}`} />
            const st: Status = day > today ? "not_due" : (monthView?.days[day] ?? "not_due")
            return (
              <motion.button
                key={day}
                whileTap={{ scale: 0.85 }}
                onClick={() => cycle(day)}
                className={cn("grid aspect-square place-items-center rounded-xl text-sm tabular-nums", CELL[st], day === today && "font-bold")}
                style={st === "done" ? { background: color, color: "white" } : undefined}
              >
                {+day.slice(8)}
              </motion.button>
            )
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">Toca un día pasado: hecho → saltado → vacío</p>
      </section>

      <section className="rounded-3xl border border-white/5 bg-card/60 p-4">
        <p className="mb-3 text-sm font-medium">Últimos 6 meses</p>
        <div className="flex justify-between gap-[3px]">
          {heatmap.map((week, w) => (
            <div key={w} className="flex flex-1 flex-col gap-[3px]">
              {week.map((day) => {
                const st = statusOf(habit.id, day)
                return (
                  <span
                    key={day}
                    className={cn("aspect-square rounded-[3px]", st === "failed" ? "bg-white/15" : st === "done" ? "" : "bg-white/5")}
                    style={st === "done" ? { background: color } : undefined}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </section>
    </motion.div>
  )
}

function StatCard({ icon, label, value, accent, percentage }: { icon?: React.ReactNode; label: string; value: React.ReactNode; accent?: string; percentage?: number }) {
  return (
    <div className="rounded-3xl border border-white/5 bg-card/60 p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {accent && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: accent }} />
        </div>
      )}
    </div>
  )
}
