import { useState } from "react"
import { Archive } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { api } from "@/lib/api"
import { queryClient, useSession } from "@/lib/data"
import { colorOf, WEEKDAYS, type Habit, type Schedule } from "@/lib/rules"
import { cn } from "@/lib/utils"

const COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#14b8a6"]
const TYPES = [
  { id: "daily", label: "Diario" },
  { id: "weekdays", label: "Días fijos" },
  { id: "times_per_period", label: "Veces por periodo" },
] as const

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"

export function HabitForm({ habit, onClose, onArchived }: { habit?: Habit; onClose: () => void; onArchived?: () => void }) {
  const { today } = useSession()
  const [name, setName] = useState(habit?.name ?? "")
  const [icon, setIcon] = useState(habit?.icon ?? "")
  const [color, setColor] = useState(habit ? colorOf(habit) : COLORS[0])
  const [schedule, setSchedule] = useState<Schedule>(
    habit?.schedule ?? { type: "daily", times_per_day: 1, weekdays: null, period_unit: null, period_target: null },
  )
  const [busy, setBusy] = useState(false)

  const patch = (changes: Partial<Schedule>) => setSchedule((s) => ({ ...s, ...changes }))
  function setType(type: Schedule["type"]) {
    patch({
      type,
      weekdays: type === "weekdays" ? (schedule.weekdays ?? [0, 1, 2, 3, 4]) : null,
      period_unit: type === "times_per_period" ? (schedule.period_unit ?? "week") : null,
      period_target: type === "times_per_period" ? (schedule.period_target ?? 3) : null,
    })
  }
  const toggleDay = (i: number) => {
    const days = schedule.weekdays ?? []
    patch({ weekdays: days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort() })
  }
  const valid = name.trim() && (schedule.type !== "weekdays" || (schedule.weekdays?.length ?? 0) > 0)

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    try {
      await action()
      await queryClient.invalidateQueries()
      after?.()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  const scheduleBody = {
    type: schedule.type,
    times_per_day: schedule.times_per_day,
    weekdays: schedule.type === "weekdays" ? schedule.weekdays : null,
    period_unit: schedule.type === "times_per_period" ? schedule.period_unit : null,
    period_target: schedule.type === "times_per_period" ? schedule.period_target : null,
  }

  const save = () =>
    run(async () => {
      const look = { name: name.trim(), icon: icon.trim() || null, color }
      if (!habit) {
        await api("/habits", { method: "POST", body: { ...look, schedule: scheduleBody } })
        return
      }
      await api(`/habits/${habit.id}`, { method: "PATCH", body: look })
      if (JSON.stringify(scheduleBody) !== JSON.stringify(pick(habit.schedule))) {
        await api(`/habits/${habit.id}/schedules`, { method: "POST", body: { ...scheduleBody, effective_from: today } })
      }
    })

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-t-[2rem] border-white/10 bg-background/95 px-5 pb-8 backdrop-blur-xl">
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-white/15" />
        <SheetHeader className="px-0 text-left">
          <SheetTitle className="text-lg">{habit ? "Editar hábito" : "Nuevo hábito"}</SheetTitle>
          <SheetDescription>{habit ? "Los cambios de frecuencia se aplican desde hoy." : "Define qué quieres cumplir y con qué frecuencia."}</SheetDescription>
        </SheetHeader>

        <div className="flex gap-2">
          <input className={cn(field, "w-16 text-center text-lg")} placeholder="🙂" value={icon} maxLength={8} onChange={(e) => setIcon(e.target.value)} aria-label="Emoji" />
          <input className={field} placeholder="Nombre" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Nombre" />
        </div>

        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn("size-8 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-white")}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-white/5 p-1">
          {TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => setType(t.id)} className={cn("rounded-xl px-2 py-1.5 text-xs", schedule.type === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {t.label}
            </button>
          ))}
        </div>

        {schedule.type === "weekdays" && (
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((w, i) => (
              <button key={w} type="button" onClick={() => toggleDay(i)} className={cn("rounded-xl py-2 text-xs capitalize", schedule.weekdays?.includes(i) ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground")}>
                {w.slice(0, 2)}
              </button>
            ))}
          </div>
        )}

        {schedule.type === "times_per_period" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="number" min={1} max={schedule.period_unit === "week" ? 7 : 31} className={cn(field, "w-20")} value={schedule.period_target ?? ""} onChange={(e) => patch({ period_target: Number(e.target.value) || null })} />
            <span className="text-muted-foreground">días</span>
            <select className={field} value={schedule.period_unit ?? "week"} onChange={(e) => patch({ period_unit: e.target.value as "week" | "month", period_target: Math.min(schedule.period_target ?? 1, e.target.value === "week" ? 7 : 31) })}>
              <option value="week">por semana</option>
              <option value="month">al mes</option>
            </select>
          </div>
        )}

        <label className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Veces al día</span>
          <input type="number" min={1} max={50} className={cn(field, "w-20")} value={schedule.times_per_day} onChange={(e) => patch({ times_per_day: Math.max(1, Number(e.target.value) || 1) })} />
        </label>

        <Button size="lg" className="w-full" disabled={!valid || busy} onClick={save}>
          {habit ? "Guardar" : "Crear hábito"}
        </Button>
        {habit && (
          <Button variant="ghost" className="w-full text-rose-300" disabled={busy} onClick={() => confirm(`¿Archivar "${habit.name}"?`) && run(() => api(`/habits/${habit.id}`, { method: "DELETE" }), onArchived)}>
            <Archive /> Archivar hábito
          </Button>
        )}
      </SheetContent>
    </Sheet>
  )
}

const pick = (s: Schedule) => ({ type: s.type, times_per_day: s.times_per_day, weekdays: s.weekdays, period_unit: s.period_unit, period_target: s.period_target })
