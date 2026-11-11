import { createContext, useContext, useMemo } from "react"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, HttpError } from "@/lib/api"
import { useToast } from "@/components/toast"
import { EMPTY_LOG, type DayEntry, type DayLog, type Habit, type Status } from "@/lib/rules"

export type Me = { id: number; email: string; display_name: string; timezone: string; day_cutoff: string }
type YearOut = { year: number; habits: { habit_id: number; percentage: number | null; months: { month: string; percentage: number | null }[]; days: Record<string, Status> }[] }
type HabitStats = { done: number; failed: number; skipped: number; percentage: number | null; current_streak: number; best_streak: number }
type Reminder = { id: number; time_local: string; enabled: boolean }

export const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => api<Me>("/me") })
export const todayQuery = queryOptions({ queryKey: ["today"], queryFn: () => api<{ date: string }>("/today") })
export const habitsQuery = queryOptions({ queryKey: ["habits"], queryFn: () => api<Habit[]>("/habits") })

const logQuery = (habitId: number, day: string) =>
  queryOptions({
    queryKey: ["log", habitId, day],
    queryFn: () =>
      api<DayLog>(`/habits/${habitId}/logs/${day}`).catch((error) => {
        if (error instanceof HttpError && error.status === 404) return EMPTY_LOG
        throw error
      }),
  })

export const useDay = (day: string) => useQuery({ queryKey: ["day", day], queryFn: () => api<{ items: DayEntry[] }>(`/today?date=${day}`) })
export const useYear = (year: number) => useQuery({ queryKey: ["year", year], queryFn: () => api<YearOut>(`/stats/year?year=${year}`) })
export const useHabitStats = (habitId: number) => useQuery({ queryKey: ["stats", habitId], queryFn: () => api<HabitStats>(`/habits/${habitId}/stats`) })
export const useReminders = (habitId: number) =>
  useQuery({ queryKey: ["reminders", habitId], queryFn: () => api<Reminder[]>(`/habits/${habitId}/reminders`), staleTime: 5 * 60_000 })
export const useLog = (habitId: number, day: string) => useQuery(logQuery(habitId, day))

type Session = { me: Me; today: string; habits: Habit[] }
export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error("useSession outside SessionContext")
  return session
}

export function useStatuses(): (habitId: number, day: string) => Status {
  const { today } = useSession()
  const year = Number(today.slice(0, 4))
  const current = useYear(year).data
  const previous = useYear(year - 1).data
  return useMemo(() => {
    const byHabit = new Map<number, Record<string, Status>>()
    for (const view of [previous, current]) {
      for (const habit of view?.habits ?? []) byHabit.set(habit.habit_id, { ...byHabit.get(habit.habit_id), ...habit.days })
    }
    return (habitId, day) => (day > today ? "not_due" : (byHabit.get(habitId)?.[day] ?? "not_due"))
  }, [current, previous, today])
}

export function useLogWriter() {
  const client = useQueryClient()
  const { toast } = useToast()

  async function write(habitId: number, day: string, log: DayLog): Promise<boolean> {
    const empty = !log.done_count && !log.skipped && !log.note
    try {
      if (empty) {
        await api(`/habits/${habitId}/logs/${day}`, { method: "DELETE" }).catch((error) => {
          if (!(error instanceof HttpError && error.status === 404)) throw error
        })
      } else {
        await api(`/habits/${habitId}/logs/${day}`, { method: "PUT", body: log })
      }
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo guardar", { error: true })
      return false
    } finally {
      await client.invalidateQueries({ predicate: (query) => !["me", "habits", "reminders"].includes(String(query.queryKey[0])) })
    }
  }

  const read = (habitId: number, day: string) => client.fetchQuery({ ...logQuery(habitId, day), staleTime: 0 })

  return { read, write }
}
