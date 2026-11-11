import { RotateCcw } from "lucide-react"
import { AnimatePresence } from "motion/react"
import { DaySheet } from "@/components/day-sheet"
import { DayStrip } from "@/components/day-strip"
import { HabitRow } from "@/components/habit-row"
import { Button } from "@/components/ui/button"
import { useDay, useSession, useStatuses } from "@/lib/data"
import { goBack, navigate, useRoute } from "@/lib/router"
import { dayTitle, MONTHS, parse, type DayEntry, type Habit } from "@/lib/rules"

type Row = { habit: Habit; entry: DayEntry }

export function TodayScreen() {
  const { today, habits } = useSession()
  const statusOf = useStatuses()
  const { params } = useRoute()
  const day = params.get("day") ?? today
  const openId = Number(params.get("log"))
  const dayPath = day === today ? "/" : `/?day=${day}`
  const setDay = (next: string) => navigate(next === today ? "/" : `/?day=${next}`, { replace: true })
  const openLog = (habit: Habit) => navigate(`${dayPath}${day === today ? "?" : "&"}log=${habit.id}`)
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
        <div className="flex items-center gap-3">
          {toDo.length > 0 && (
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              {done}/{toDo.length}
            </span>
          )}
          {day !== today && (
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setDay(today)}>
              <RotateCcw /> Hoy
            </Button>
          )}
        </div>
      </header>

      <DayStrip selected={day} onSelect={setDay} />

      <div className="space-y-2">
        {items && toDo.length === 0 && <p className="py-10 text-center text-muted-foreground">Nada que hacer este día ✨</p>}
        {toDo.map(({ habit, entry }) => (
          <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => openLog(habit)} />
        ))}
      </div>

      {avoid.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">A evitar</h2>
          {avoid.map(({ habit, entry }) => (
            <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => openLog(habit)} />
          ))}
        </section>
      )}

      {metThisPeriod.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Objetivo cumplido este periodo</h2>
          {metThisPeriod.map(({ habit, entry }) => (
            <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => openLog(habit)} dimmed />
          ))}
        </section>
      )}

      <AnimatePresence>{open && <DaySheet key={open.habit.id} habit={open.habit} entry={open.entry} day={day} onClose={() => goBack(dayPath)} />}</AnimatePresence>
    </div>
  )
}
