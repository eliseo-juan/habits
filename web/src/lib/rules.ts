export type Status = "done" | "failed" | "skipped" | "pending" | "not_due"

export type Schedule = {
  type: "daily" | "weekdays" | "times_per_period"
  times_per_day: number
  weekdays: number[] | null
  period_unit: "week" | "month" | null
  period_target: number | null
}

export type Habit = { id: number; name: string; color: string | null; icon: string | null; start_date: string; schedule: Schedule }
export type Look = Pick<Habit, "name" | "color" | "icon">

export type DayEntry = {
  habit_id: number
  status: Status
  done_count: number
  times_per_day: number
  period_done: number | null
  period_target: number | null
}

export type DayLog = { done_count: number; skipped: boolean; note: string | null }
export const EMPTY_LOG: DayLog = { done_count: 0, skipped: false, note: null }

export const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

export const parse = (day: string) => new Date(`${day}T00:00:00Z`)
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => {
  const d = parse(day)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
export const weekday = (day: string) => (parse(day).getUTCDay() + 6) % 7
export const dayOfMonth = (day: string) => parse(day).getUTCDate()

export function scheduleLabel(schedule: Schedule): string {
  const times = schedule.times_per_day > 1 ? ` · ${schedule.times_per_day} veces` : ""
  if (schedule.type === "daily") return `Todos los días${times}`
  if (schedule.type === "weekdays") return (schedule.weekdays ?? []).map((i) => WEEKDAYS[i]).join(" ") + times
  return `${schedule.period_target} días ${schedule.period_unit === "week" ? "por semana" : "al mes"}`
}

export const percent = (value: number | null | undefined) => (value === null || value === undefined ? "–" : String(Math.round(value)))

export const colorOf = (look: Look) => look.color ?? "#10b981"

export function emojiOf(look: Look): string {
  const graphemes = [...new Intl.Segmenter().segment(look.icon ?? "")]
  return graphemes.length === 1 ? graphemes[0].segment : look.name.charAt(0).toUpperCase()
}

export function monthBounds(month: string): [string, string] {
  const [year, number] = month.split("-").map(Number)
  return [`${month}-01`, iso(new Date(Date.UTC(year, number, 0)))]
}

export function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split("-").map(Number)
  return iso(new Date(Date.UTC(year, number - 1 + delta, 1))).slice(0, 7)
}

export function dayTitle(day: string, today: string): string {
  if (day === today) return "Hoy"
  if (day === addDays(today, -1)) return "Ayer"
  if (day === addDays(today, 1)) return "Mañana"
  return `${WEEKDAYS[weekday(day)]} ${dayOfMonth(day)} ${MONTHS[parse(day).getUTCMonth()]}`
}
