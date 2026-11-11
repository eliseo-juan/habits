import { useState } from "react"
import { Archive, RotateCcw, X } from "lucide-react"
import { AlertDialog } from "radix-ui"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { queryClient, useSession } from "@/lib/data"
import { colorOf, WEEKDAYS, type Habit, type Schedule } from "@/lib/rules"
import { cn } from "@/lib/utils"

const COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#14b8a6"]
const TYPES = [
  { id: "daily", label: "Diario" },
  { id: "weekdays", label: "Días fijos" },
  { id: "times_per_period", label: "Por periodo" },
] as const

const field = "h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-base outline-none focus:ring-2 focus:ring-primary/50"
const segment = (active: boolean) => cn("h-12 rounded-xl px-2 text-sm font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground")

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Confirm({ title, description, action, onConfirm, children }: { title: string; description: string; action: string; onConfirm: () => void; children: React.ReactNode }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-3xl border border-white/10 bg-card p-5">
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground">{description}</AlertDialog.Description>
          <div className="grid grid-cols-2 gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" size="lg" className="h-12 rounded-2xl">
                Cancelar
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" size="lg" className="h-12 rounded-2xl" onClick={onConfirm}>
                {action}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export function HabitForm({ habit, onClose, onArchived }: { habit?: Habit; onClose: () => void; onArchived?: () => void }) {
  const { today } = useSession()
  const [kind, setKind] = useState<Habit["kind"]>(habit?.kind ?? "build")
  const [name, setName] = useState(habit?.name ?? "")
  const [icon, setIcon] = useState(habit?.icon ?? "")
  const [color, setColor] = useState(habit ? colorOf(habit) : COLORS[0])
  const [startDate, setStartDate] = useState(habit?.start_date ?? today)
  const [endDate, setEndDate] = useState(habit?.end_date ?? "")
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
  const datesOk = !!startDate && (!endDate || endDate >= startDate)
  const valid = name.trim() && datesOk && (schedule.type !== "weekdays" || (schedule.weekdays?.length ?? 0) > 0)

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    try {
      await action()
      await queryClient.invalidateQueries()
      const leave = after ?? onClose
      leave()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  const scheduleBody = {
    type: schedule.type,
    times_per_day: kind === "limit" ? 1 : schedule.times_per_day,
    weekdays: schedule.type === "weekdays" ? schedule.weekdays : null,
    period_unit: schedule.type === "times_per_period" ? schedule.period_unit : null,
    period_target: schedule.type === "times_per_period" ? schedule.period_target : null,
  }

  const save = () =>
    run(async () => {
      const look = { name: name.trim(), icon: icon.trim() || null, color, start_date: startDate, end_date: endDate || null }
      if (!habit) {
        await api("/habits", { method: "POST", body: { ...look, kind, schedule: scheduleBody } })
        return
      }
      await api(`/habits/${habit.id}`, { method: "PATCH", body: look })
      if (JSON.stringify(scheduleBody) !== JSON.stringify(pick(habit.schedule))) {
        await api(`/habits/${habit.id}/schedules`, { method: "POST", body: { ...scheduleBody, effective_from: today } })
      }
    })

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <Button variant="ghost" size="icon-lg" className="size-12 rounded-full" onClick={onClose} aria-label="Cerrar">
          <X className="size-6" />
        </Button>
        <h1 className="flex-1 text-lg font-semibold">{habit ? "Editar hábito" : "Nuevo hábito"}</h1>
        <Button size="lg" className="h-12 rounded-full px-6" disabled={!valid || busy} onClick={save}>
          Guardar
        </Button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 pt-5 pb-[max(env(safe-area-inset-bottom),2rem)]">
        {!habit && (
          <Section title="Tipo">
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-white/10 p-1">
              <button type="button" className={segment(kind === "build")} onClick={() => setKind("build")}>
                Hacer
              </button>
              <button type="button" className={segment(kind === "limit")} onClick={() => setKind("limit")}>
                Evitar
              </button>
            </div>
          </Section>
        )}

        <Section title="Hábito">
          <div className="flex gap-2">
            <input className={cn(field, "w-20 px-0 text-center text-xl")} placeholder="🙂" value={icon} maxLength={8} onChange={(e) => setIcon(e.target.value)} aria-label="Emoji" />
            <input className={field} placeholder="Nombre" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Nombre" />
          </div>
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn("size-9 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-white")}
                style={{ background: c }}
              />
            ))}
          </div>
        </Section>

        <Section title="Frecuencia">
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-white/10 p-1">
            {TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => setType(t.id)} className={segment(schedule.type === t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {schedule.type === "weekdays" && (
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((w, i) => (
                <button key={w} type="button" onClick={() => toggleDay(i)} className={cn("h-12 rounded-xl text-sm capitalize", schedule.weekdays?.includes(i) ? "bg-primary text-primary-foreground" : "bg-white/10 text-muted-foreground")}>
                  {w.slice(0, 2)}
                </button>
              ))}
            </div>
          )}

          {schedule.type === "times_per_period" && (
            <div className="flex items-center gap-2">
              <input type="number" inputMode="numeric" min={1} max={schedule.period_unit === "week" ? 7 : 31} className={cn(field, "w-24 text-center")} value={schedule.period_target ?? ""} onChange={(e) => patch({ period_target: Number(e.target.value) || null })} aria-label="Días" />
              <span className="text-sm text-muted-foreground">{kind === "limit" ? "días máx." : "días"}</span>
              <select className={field} value={schedule.period_unit ?? "week"} onChange={(e) => patch({ period_unit: e.target.value as "week" | "month", period_target: Math.min(schedule.period_target ?? 1, e.target.value === "week" ? 7 : 31) })}>
                <option value="week">por semana</option>
                <option value="month">al mes</option>
              </select>
            </div>
          )}

          {kind === "build" && (
            <label className="flex items-center justify-between gap-3 pt-1">
              <span className="text-sm text-muted-foreground">Veces al día</span>
              <input type="number" inputMode="numeric" min={1} max={50} className={cn(field, "w-24 text-center")} value={schedule.times_per_day} onChange={(e) => patch({ times_per_day: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
          )}
          {habit && <p className="px-1 text-xs text-muted-foreground">Los cambios de frecuencia se aplican desde hoy.</p>}
        </Section>

        <Section title="Fechas">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="px-1 text-xs text-muted-foreground">Inicio</span>
              <input type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="px-1 text-xs text-muted-foreground">Fin (opcional)</span>
              <input type="date" className={field} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          {!datesOk && <p className="px-1 text-xs text-rose-300">El fin no puede ser anterior al inicio.</p>}
        </Section>

        {habit && (
          <Section title="Zona delicada">
            <div className="space-y-2">
              <Confirm
                title="¿Reiniciar estadísticas?"
                description={`Racha, porcentaje y contadores de "${habit.name}" empezarán a contar desde hoy. El historial de días no se borra.`}
                action="Reiniciar"
                onConfirm={() => run(() => api(`/habits/${habit.id}`, { method: "PATCH", body: { stats_start_date: today } }))}
              >
                <Button variant="secondary" size="lg" className="h-12 w-full rounded-2xl" disabled={busy}>
                  <RotateCcw /> Reiniciar estadísticas
                </Button>
              </Confirm>
              <Confirm
                title="¿Archivar hábito?"
                description={`"${habit.name}" dejará de aparecer en tus listas.`}
                action="Archivar"
                onConfirm={() => run(() => api(`/habits/${habit.id}`, { method: "DELETE" }), onArchived)}
              >
                <Button variant="ghost" size="lg" className="h-12 w-full rounded-2xl text-rose-300" disabled={busy}>
                  <Archive /> Archivar hábito
                </Button>
              </Confirm>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

const pick = (s: Schedule) => ({ type: s.type, times_per_day: s.times_per_day, weekdays: s.weekdays, period_unit: s.period_unit, period_target: s.period_target })
