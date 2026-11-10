import { ChevronRight, Flame, MessageSquareText, Target } from "lucide-react"
import { motion } from "motion/react"
import { Chip, HabitIcon } from "@/components/habit-row"
import { useHabitStats, useSession, useStatuses } from "@/lib/data"
import { addDays, colorOf, percent, scheduleLabel, weekday, WEEKDAYS, type Habit } from "@/lib/rules"
import { cn } from "@/lib/utils"

const DOT: Record<string, string> = {
  failed: "text-rose-300 ring-1 ring-rose-500/40",
  skipped: "bg-white/5 text-muted-foreground",
  pending: "bg-white/5 ring-1 ring-white/20",
  not_due: "bg-transparent text-muted-foreground/40",
}

export function HabitsScreen({ onOpen }: { onOpen: (habit: Habit) => void }) {
  const { habits } = useSession()

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <p className="text-sm text-muted-foreground">{habits.length} activos</p>
        <h1 className="text-3xl font-semibold tracking-tight">Hábitos</h1>
      </header>

      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 p-3 text-sm text-muted-foreground">
        <MessageSquareText className="size-5 shrink-0 text-primary" />
        Para crear o cambiar hábitos, pídeselo a Claude por MCP.
      </div>

      {habits.map((habit, index) => (
        <HabitCard key={habit.id} habit={habit} index={index} onOpen={() => onOpen(habit)} />
      ))}
    </div>
  )
}

function HabitCard({ habit, index, onOpen }: { habit: Habit; index: number; onOpen: () => void }) {
  const { today } = useSession()
  const statusOf = useStatuses()
  const stats = useHabitStats(habit.id).data
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const color = colorOf(habit)

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onOpen}
      className="block w-full rounded-3xl border border-white/5 bg-card/60 p-4 text-left active:bg-card"
    >
      <div className="flex items-center gap-3">
        <HabitIcon habit={habit} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{habit.name}</p>
          <p className="text-xs text-muted-foreground">{scheduleLabel(habit.schedule)}</p>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {week.map((day) => {
          const st = statusOf(habit.id, day)
          return (
            <div key={day} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground capitalize">{WEEKDAYS[weekday(day)].slice(0, 2)}</span>
              <span
                className={cn("grid size-8 place-items-center rounded-xl text-xs font-medium tabular-nums", DOT[st])}
                style={st === "done" ? { background: color, color: "white", boxShadow: `0 0 12px -2px ${color}` } : undefined}
              >
                {+day.slice(8)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-1.5">
        <Chip className="bg-orange-500/10 text-orange-300 ring-orange-500/20">
          <Flame className="size-3" /> {stats?.current_streak ?? "–"} racha
        </Chip>
        <Chip>
          <Target className="size-3" /> {percent(stats?.percentage)}%
        </Chip>
      </div>
    </motion.button>
  )
}
