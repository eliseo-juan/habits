import { useState } from "react"
import { QueryClientProvider, useQuery } from "@tanstack/react-query"
import { BarChart3, CalendarCheck, LayoutGrid, Loader2, Settings } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { HttpError } from "@/lib/api"
import { habitsQuery, meQuery, queryClient, SessionContext, todayQuery, useSession } from "@/lib/data"
import type { Habit } from "@/lib/rules"
import { cn } from "@/lib/utils"
import { HabitDetail } from "@/screens/habit-detail"
import { HabitsScreen } from "@/screens/habits"
import { LoginScreen } from "@/screens/login"
import { ProgressScreen } from "@/screens/progress"
import { SettingsScreen } from "@/screens/settings"
import { TodayScreen } from "@/screens/today"

const TABS = [
  { id: "today", label: "Hoy", icon: CalendarCheck },
  { id: "habits", label: "Hábitos", icon: LayoutGrid },
  { id: "progress", label: "Progreso", icon: BarChart3 },
  { id: "settings", label: "Ajustes", icon: Settings },
] as const

type Tab = (typeof TABS)[number]["id"]

function Shell() {
  const { habits } = useSession()
  const [tab, setTab] = useState<Tab>("today")
  const [detailId, setDetailId] = useState<number | null>(null)
  const detail = habits.find((h) => h.id === detailId)
  const openDetail = (habit: Habit) => setDetailId(habit.id)

  return (
    <div className="relative mx-auto min-h-dvh max-w-md">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 mx-auto h-72 max-w-md bg-[radial-gradient(ellipse_at_top,var(--color-primary)_0%,transparent_70%)] opacity-15" />
      <main className="px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-28">
        <AnimatePresence mode="wait">
          <motion.div key={detail ? `detail-${detail.id}` : tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {detail ? (
              <HabitDetail habit={detail} onBack={() => setDetailId(null)} />
            ) : tab === "today" ? (
              <TodayScreen onStats={openDetail} />
            ) : tab === "habits" ? (
              <HabitsScreen onOpen={openDetail} />
            ) : tab === "progress" ? (
              <ProgressScreen />
            ) : (
              <SettingsScreen />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="flex rounded-3xl border border-white/10 bg-card/80 p-1.5 shadow-2xl backdrop-blur-xl">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id && !detail
            return (
              <button
                key={id}
                onClick={() => {
                  setTab(id)
                  setDetailId(null)
                }}
                className={cn("relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] transition-colors", active ? "text-primary" : "text-muted-foreground")}
              >
                {active && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-2xl bg-primary/10" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <Icon className="relative size-5" />
                <span className="relative">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function Gate() {
  const me = useQuery(meQuery)
  const today = useQuery({ ...todayQuery, enabled: me.isSuccess })
  const habits = useQuery({ ...habitsQuery, enabled: me.isSuccess })

  if (me.error instanceof HttpError && me.error.status === 401) return <LoginScreen />
  const error = me.error ?? today.error ?? habits.error
  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center gap-3 px-6 text-center">
        <div className="space-y-3">
          <p className="text-muted-foreground">No se pudo cargar: {error.message}</p>
          <Button variant="secondary" onClick={() => [me, today, habits].forEach((q) => q.refetch())}>
            Reintentar
          </Button>
        </div>
      </div>
    )
  }
  if (!me.data || !today.data || !habits.data) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }
  return (
    <SessionContext value={{ me: me.data, today: today.data.date, habits: habits.data }}>
      <Shell />
    </SessionContext>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
      <Toaster position="top-center" />
    </QueryClientProvider>
  )
}
