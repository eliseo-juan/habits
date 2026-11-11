import { useState } from "react"
import { RotateCcw, Sparkles } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { DaySheet } from "@/components/day-sheet"
import { DayStrip } from "@/components/day-strip"
import { HabitRow } from "@/components/habit-row"
import { Button } from "@/components/ui/button"
import { useDay, useSession, useStatuses } from "@/lib/data"
import { dayTitle, MONTHS, parse, type DayEntry, type Habit } from "@/lib/rules"

type Row = { habit: Habit; entry: DayEntry }

export function TodayScreen({ onStats }: { onStats: (habit: Habit) => void }) {
  const { today, habits } = useSession()
  const statusOf = useStatuses()
  const [day, setDay] = useState(today)
  const [openId, setOpenId] = useState<number | null>(null)
  const items = useDay(day).data?.items

  const due: Row[] = (items ?? []).flatMap((entry) => {
    const habit = habits.find((h) => h.id === entry.habit_id)
    return habit ? [{ habit, entry }] : []
  })
  const toDo = due.filter((r) => r.habit.kind === "build")
  const avoid = due.filter((r) => r.habit.kind === "limit")
  const metThisPeriod: Row[] = habits
    .filter((h) => h.kind === "build" && h.schedule.type === "times_per_period" && day >= h.start_date && items && !items.some((i) => i.habit_id === h.id))
    .map((habit) => {
      const status = statusOf(habit.id, day)
      const target = habit.schedule.times_per_day
      return { habit, entry: { habit_id: habit.id, status, done_count: status === "done" ? target : 0, times_per_day: target, period_done: null, period_target: null } }
    })
  const open = [...due, ...metThisPeriod].find((r) => r.habit.id === openId)
  const done = toDo.filter((r) => r.entry.status === "done").length
  const percentage = toDo.length ? Math.round((100 * done) / toDo.length) : 0
  const date = parse(day)

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between pt-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {date.getUTCDate()} de {MONTHS[date.getUTCMonth()]}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{dayTitle(day, today)}</h1>
        </div>
        {day !== today && (
          <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setDay(today)}>
            <RotateCcw /> Hoy
          </Button>
        )}
      </header>

      <DayStrip selected={day} onSelect={setDay} />

      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-primary/20 via-card/60 to-card/40 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{day > today ? "Día futuro, solo consulta" : "Progreso del día"}</p>
            <p className="text-2xl font-semibold tabular-nums">
              {done}
              <span className="text-muted-foreground"> / {toDo.length}</span>
            </p>
          </div>
          <AnimatePresence>
            {toDo.length > 0 && done === toDo.length && (
              <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} className="text-primary">
                <Sparkles className="size-8" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
          <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${percentage}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
        </div>
      </div>

      <div className="space-y-2">
        {items && toDo.length === 0 && <p className="py-10 text-center text-muted-foreground">Nada que hacer este día ✨</p>}
        {toDo.map(({ habit, entry }) => (
          <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => setOpenId(habit.id)} />
        ))}
      </div>

      {avoid.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">A evitar</h2>
          {avoid.map(({ habit, entry }) => (
            <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => setOpenId(habit.id)} />
          ))}
        </section>
      )}

      {metThisPeriod.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Objetivo cumplido este periodo</h2>
          {metThisPeriod.map(({ habit, entry }) => (
            <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => setOpenId(habit.id)} dimmed />
          ))}
        </section>
      )}

      {open && (
        <DaySheet
          habit={open.habit}
          entry={open.entry}
          day={day}
          onClose={() => setOpenId(null)}
          onStats={(habit) => {
            setOpenId(null)
            onStats(habit)
          }}
        />
      )}
    </div>
  )
}
