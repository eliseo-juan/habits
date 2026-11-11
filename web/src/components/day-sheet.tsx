import { useEffect, useRef, useState } from "react"
import { Check, Minus, NotebookPen, Plus, SkipForward, Trash2 } from "lucide-react"
import { motion, useDragControls } from "motion/react"
import { Dialog } from "radix-ui"
import { HabitIcon } from "@/components/habit-row"
import { HabitRing } from "@/components/habit-ring"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLog, useLogWriter, useSession } from "@/lib/data"
import { colorOf, dayTitle, EMPTY_LOG, scheduleLabel, type DayEntry, type DayLog, type Habit } from "@/lib/rules"

type Props = { habit: Habit; entry: DayEntry; day: string; onClose: () => void }

const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 500

export function DaySheet({ habit, entry, day, onClose }: Props) {
  const { today } = useSession()
  const writer = useLogWriter()
  const log = useLog(habit.id, day).data ?? EMPTY_LOG
  const [note, setNote] = useState<string | null>(null)
  const [writingNote, setWritingNote] = useState(false)
  const drag = useDragControls()
  const target = entry.times_per_day
  const isFuture = day > today
  const status = log.skipped ? "skipped" : habit.kind === "build" && log.done_count >= target ? "done" : entry.status
  const current = { ...log, note: note === null ? log.note : note || null }
  const unsavedNote = useRef<string | null>(null)
  const write = (next: DayLog) => {
    unsavedNote.current = null
    return writer.write(habit.id, day, next)
  }
  const save = (patch: Partial<DayLog>) => write({ ...current, skipped: false, ...patch })
  const close = (saved: Promise<boolean>) => saved.then((ok) => ok && onClose())

  // Swipe, tap outside and the back button all unmount the sheet, so a typed note is saved on the way out.
  const saveNoteOnExit = useRef(() => {})
  useEffect(() => {
    saveNoteOnExit.current = () => {
      const pending = unsavedNote.current
      if (pending === null) return
      writer.read(habit.id, day).then((latest) => (latest.note ?? "") !== pending && writer.write(habit.id, day, { ...latest, note: pending || null }))
    }
  })
  useEffect(() => () => saveNoteOnExit.current(), [])

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal forceMount>
        <Dialog.Overlay asChild>
          <motion.div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        </Dialog.Overlay>
        <Dialog.Content asChild aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}>
          <motion.div
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 1 }}
            onDragEnd={(_, info) => (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) && onClose()}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            onPointerDown={(e) => !(e.target as Element).closest("button, textarea") && drag.start(e)}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md touch-none flex-col gap-4 rounded-t-[2rem] border-t border-white/15 bg-popover px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] text-popover-foreground shadow-2xl outline-none"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/30" />
            <div className="flex items-center gap-3">
              <HabitIcon habit={habit} size="lg" />
              <div className="min-w-0 text-left">
                <Dialog.Title className="truncate text-lg font-semibold">{habit.name}</Dialog.Title>
                <p className="text-sm text-muted-foreground">
                  {dayTitle(day, today)} · {scheduleLabel(habit)}
                </p>
              </div>
              {target === 1 && <HabitRing status={status} count={log.done_count} target={target} color={colorOf(habit)} size={48} className="ml-auto" />}
            </div>

            {target > 1 && (
              <div className="flex items-center justify-center gap-6">
                <Button size="icon-lg" variant="secondary" className="size-14 rounded-full" disabled={isFuture || log.done_count === 0} onClick={() => save({ done_count: log.done_count - 1 })} aria-label="Una menos">
                  <Minus className="size-6" />
                </Button>
                <HabitRing status={status} count={log.done_count} target={target} color={colorOf(habit)} size={88} />
                <Button size="icon-lg" variant="secondary" className="size-14 rounded-full" disabled={isFuture || log.done_count >= target} onClick={() => save({ done_count: log.done_count + 1 })} aria-label="Una más">
                  <Plus className="size-6" />
                </Button>
              </div>
            )}

            <Button size="lg" className="h-14 rounded-2xl text-base [&_svg]:size-5" disabled={isFuture} onClick={() => close(save({ done_count: target }))}>
              <Check /> {habit.kind === "limit" ? "Lo hice" : "Hecho"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" variant="secondary" className="h-13 rounded-2xl text-base [&_svg]:size-5" disabled={isFuture} onClick={() => close(save({ done_count: 0, skipped: true }))}>
                <SkipForward /> Saltar
              </Button>
              <Button size="lg" variant="secondary" className="h-13 rounded-2xl text-base [&_svg]:size-5" disabled={isFuture} onClick={() => close(write(EMPTY_LOG))}>
                <Trash2 /> Borrar
              </Button>
            </div>

            {writingNote || current.note ? (
              <Textarea
                autoFocus={writingNote}
                placeholder="Nota del día"
                className="min-h-16 rounded-2xl border-white/15 bg-white/10"
                value={note ?? log.note ?? ""}
                disabled={isFuture}
                onChange={(e) => {
                  setNote(e.target.value)
                  unsavedNote.current = e.target.value
                }}
              />
            ) : (
              <Button variant="ghost" className="text-muted-foreground" disabled={isFuture} onClick={() => setWritingNote(true)}>
                <NotebookPen /> Añadir nota
              </Button>
            )}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
