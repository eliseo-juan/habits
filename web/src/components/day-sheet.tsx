import { useBackLayer } from "@/lib/nav"
import { useState } from "react"
import { BarChart3, Check, Minus, Plus, SkipForward, Trash2 } from "lucide-react"
import { HabitIcon } from "@/components/habit-row"
import { HabitRing } from "@/components/habit-ring"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useLog, useLogWriter, useSession } from "@/lib/data"
import { colorOf, dayTitle, EMPTY_LOG, scheduleLabel, type DayEntry, type DayLog, type Habit } from "@/lib/rules"

type Props = { habit: Habit; entry: DayEntry; day: string; onClose: () => void; onStats: (habit: Habit) => void }

export function DaySheet({ habit, entry, day, onClose, onStats }: Props) {
  useBackLayer(onClose)
  const { today } = useSession()
  const writer = useLogWriter()
  const log = useLog(habit.id, day).data ?? EMPTY_LOG
  const [note, setNote] = useState<string | null>(null)
  const target = entry.times_per_day
  const isFuture = day > today
  const status = log.skipped ? "skipped" : habit.kind === "build" && log.done_count >= target ? "done" : entry.status
  const current = { ...log, note: note === null ? log.note : note || null }
  const save = (patch: Partial<DayLog>) => writer.write(habit.id, day, { ...current, skipped: false, ...patch })
  const dismiss = () => {
    if (current.note !== log.note) writer.write(habit.id, day, current)
  }
  const close = (saved: Promise<boolean>) => saved.then((ok) => ok && onClose())

  return (
    <Sheet open onOpenChange={(open) => !open && (dismiss(), onClose())}>
      <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-w-md rounded-t-[2rem] border-white/20 bg-background/95 px-5 pb-8 backdrop-blur-xl">
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-white/25" />
        <SheetHeader className="flex-row items-center gap-3 px-0">
          <HabitIcon habit={habit} size="lg" />
          <div className="text-left">
            <SheetTitle className="text-lg">{habit.name}</SheetTitle>
            <SheetDescription>
              {dayTitle(day, today)} · {scheduleLabel(habit)}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex items-center justify-center gap-6 py-2">
          {target > 1 && (
            <Button size="icon-lg" variant="secondary" className="size-12 rounded-full" disabled={isFuture || log.done_count === 0} onClick={() => save({ done_count: log.done_count - 1 })}>
              <Minus />
            </Button>
          )}
          <HabitRing status={status} count={log.done_count} target={target} color={colorOf(habit)} size={88} />
          {target > 1 && (
            <Button size="icon-lg" variant="secondary" className="size-12 rounded-full" disabled={isFuture || log.done_count >= target} onClick={() => save({ done_count: log.done_count + 1 })}>
              <Plus />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button size="lg" disabled={isFuture} onClick={() => close(save({ done_count: target }))}>
            <Check /> {habit.kind === "limit" ? "Lo hice" : "Hecho"}
          </Button>
          <Button size="lg" variant="secondary" disabled={isFuture} onClick={() => close(save({ done_count: 0, skipped: true }))}>
            <SkipForward /> Saltar
          </Button>
          <Button size="lg" variant="secondary" disabled={isFuture} onClick={() => close(writer.write(habit.id, day, EMPTY_LOG))}>
            <Trash2 /> Borrar
          </Button>
        </div>

        <Textarea
          placeholder="Nota del día"
          className="min-h-16 rounded-2xl border-white/20 bg-white/10"
          value={note ?? log.note ?? ""}
          disabled={isFuture}
          onChange={(e) => setNote(e.target.value)}
        />

        <Button variant="ghost" className="w-full" onClick={() => (dismiss(), onStats(habit))}>
          <BarChart3 /> Ver estadísticas
        </Button>
      </SheetContent>
    </Sheet>
  )
}
