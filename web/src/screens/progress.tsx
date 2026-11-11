import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { useSession, useYear } from "@/lib/data"
import { addDays, colorOf, emojiOf, monthBounds, MONTHS, shiftMonth, type Status } from "@/lib/rules"
import { cn } from "@/lib/utils"

export function ProgressScreen() {
  const { today, habits } = useSession()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [year, number] = month.split("-").map(Number)
  const [first, last] = monthBounds(month)
  const days = Array.from({ length: +last.slice(8) }, (_, i) => addDays(first, i))
  const shift = (delta: number) => setMonth(shiftMonth(month, delta))
  const view = useYear(year).data
  const rows = habits.flatMap((habit) => {
    const line = view?.habits.find((h) => h.habit_id === habit.id)
    if (!line) return []
    const percentage = line.months.find((m) => m.month === month)?.percentage ?? null
    const statusOf = (day: string): Status => (day > today ? "not_due" : (line.days[day] ?? "not_due"))
    return [{ habit, percentage: percentage === null ? null : Math.round(percentage), statusOf }]
  })
  const scored = rows.filter((r) => r.percentage !== null)
  const average = scored.length ? Math.round(scored.reduce((sum, r) => sum + (r.percentage ?? 0), 0) / scored.length) : null

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between pt-2">
        <div>
          <p className="text-sm text-muted-foreground">Media del mes</p>
          <h1 className="text-3xl font-semibold tracking-tight tabular-nums">{average ?? "–"}%</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Mes anterior">
            <ChevronLeft />
          </Button>
          <span className="w-24 text-center text-sm font-medium capitalize">
            {MONTHS[number - 1]} {String(year).slice(2)}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Mes siguiente">
            <ChevronRight />
          </Button>
        </div>
      </header>

      <section className="space-y-3 rounded-3xl border border-white/15 bg-card p-4">
        {rows.map(({ habit, percentage }) => (
          <div key={habit.id}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="truncate">{habit.name}</span>
              <span className="tabular-nums text-muted-foreground">{percentage ?? "–"}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <motion.div
                className="h-full rounded-full"
                style={{ background: colorOf(habit) }}
                initial={{ width: 0 }}
                animate={{ width: `${percentage ?? 0}%` }}
                transition={{ type: "spring", stiffness: 80, damping: 18 }}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-white/15 bg-card p-4">
        <p className="mb-3 text-sm font-medium">Día a día</p>
        <div className="space-y-1.5">
          {rows.map(({ habit, statusOf }) => (
            <div key={habit.id} className="flex items-center gap-2">
              <span className="w-5 text-center text-sm" style={{ color: colorOf(habit) }}>
                {emojiOf(habit)}
              </span>
              <div className="grid flex-1 gap-[2px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((day) => {
                  const st = statusOf(day)
                  return (
                    <span
                      key={day}
                      className={cn("h-5 rounded-[3px]", st === "failed" ? "bg-white/25" : st === "done" ? "" : st === "not_due" ? "bg-white/[0.05]" : "bg-white/10")}
                      style={st === "done" ? { background: colorOf(habit) } : undefined}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
