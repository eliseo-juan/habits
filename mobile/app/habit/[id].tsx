import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { HabitIcon } from "@/components/habit-row"
import { Card, Screen } from "@/components/ui"
import { useHabitStats, useLogWriter, useReminders, useSession, useStatuses, useYear } from "@/lib/data"
import { addDays, colorOf, iso, MONTHS, percent, scheduleLabel, shiftMonth, streakLabel, weekday, WEEKDAYS, type Habit, type Status } from "@/lib/rules"
import { colors } from "@/theme"

const CELL: Record<Exclude<Status, "done">, { box: object; text: string; strike?: boolean }> = {
  failed: { box: { borderWidth: 1, borderColor: colors.roseRing }, text: colors.rose },
  skipped: { box: { backgroundColor: colors.white10 }, text: colors.mutedForeground, strike: true },
  pending: { box: { borderWidth: 1, borderColor: "rgba(77,219,165,0.6)" }, text: colors.foreground },
  slipped: { box: { borderWidth: 1, borderColor: colors.amberRing }, text: colors.amber },
  not_due: { box: {}, text: "rgba(182,186,196,0.6)" },
}

// Monday-first weeks; days outside the month are null so every row has exactly seven cells.
function monthWeeks(month: string): (string | null)[][] {
  const [year, number] = month.split("-").map(Number)
  const first = iso(new Date(Date.UTC(year, number - 1, 1)))
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const cells = [...Array(weekday(first)).fill(null), ...Array.from({ length }, (_, i) => addDays(first, i))]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { habits } = useSession()
  const habit = habits.find((h) => String(h.id) === id)
  if (!habit) return <Gone />
  return <Detail habit={habit} />
}

// The habit was archived while its screen was open.
function Gone() {
  return (
    <Screen>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.primary }}>Este hábito ya no existe. Volver</Text>
      </Pressable>
    </Screen>
  )
}

function Detail({ habit }: { habit: Habit }) {
  const { today } = useSession()
  const statusOf = useStatuses()
  const writer = useLogWriter()
  const [month, setMonth] = useState(today.slice(0, 7))
  const canGoBack = month > habit.start_date.slice(0, 7)
  const canGoForward = month < today.slice(0, 7)
  const [year, monthNumber] = month.split("-").map(Number)
  const overall = useHabitStats(habit.id).data
  const monthView = useYear(year).data?.habits.find((h) => h.habit_id === habit.id)
  const monthly = monthView?.months.find((m) => m.month === month)
  const reminders = (useReminders(habit.id).data ?? []).filter((r) => r.enabled).map((r) => r.time_local.slice(0, 5))
  const color = colorOf(habit)

  const tracked = (day: string) => day >= habit.start_date && day <= today

  async function cycle(day: string) {
    if (!tracked(day)) return
    const log = await writer.read(habit.id, day)
    const target = habit.schedule.times_per_day
    if (log.skipped) await writer.write(habit.id, day, { ...log, done_count: 0, skipped: false })
    else if (log.done_count >= target) await writer.write(habit.id, day, { ...log, done_count: 0, skipped: true })
    else await writer.write(habit.id, day, { ...log, done_count: target, skipped: false })
  }

  const yearStart = addDays(today, -7 * 26 - weekday(today))
  const heatmap = Array.from({ length: 27 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(yearStart, w * 7 + d)))

  return (
    <Screen contentStyle={{ paddingBottom: 40 }}>
      <Stack.Screen
        options={{
          title: habit.name,
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: "/habit-form", params: { id: String(habit.id) } })} hitSlop={10} accessibilityLabel="Editar hábito">
              <Ionicons name="pencil" size={22} color={colors.foreground} />
            </Pressable>
          ),
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <HabitIcon habit={habit} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{scheduleLabel(habit)}</Text>
            {reminders.length > 0 && (
              <>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>·</Text>
                <Ionicons name="notifications-outline" size={12} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{reminders.join(", ")}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <StatCard icon={<Ionicons name="flame" size={16} color="#fb923c" />} label="Racha actual" value={overall ? streakLabel(habit.schedule, overall.current_streak) : "–"} />
        <StatCard icon={<Ionicons name="trophy" size={16} color={colors.amber} />} label="Mejor racha" value={overall ? streakLabel(habit.schedule, overall.best_streak) : "–"} />
        <StatCard label="Cumplimiento" value={overall?.percentage == null ? "Sin datos" : `${percent(overall.percentage)}%`} accent={color} percentage={overall?.percentage ?? 0} />
        <StatCard label={habit.kind === "limit" ? "Cumplidos · fallados" : "Hechos · fallados"} value={overall ? `${overall.done} · ${overall.failed}` : "–"} />
      </View>

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable hitSlop={10} disabled={!canGoBack} onPress={() => setMonth(shiftMonth(month, -1))} accessibilityLabel="Mes anterior" style={{ opacity: canGoBack ? 1 : 0.25 }}>
            <Ionicons name="chevron-back" size={22} color={colors.mutedForeground} />
          </Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontWeight: "500", color: colors.foreground, textTransform: "capitalize" }}>
              {MONTHS[monthNumber - 1]} {year}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{percent(monthly?.percentage)}% este mes</Text>
          </View>
          <Pressable hitSlop={10} disabled={!canGoForward} onPress={() => setMonth(shiftMonth(month, 1))} accessibilityLabel="Mes siguiente" style={{ opacity: canGoForward ? 1 : 0.25 }}>
            <Ionicons name="chevron-forward" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row" }}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={{ flex: 1, textAlign: "center", fontSize: 11, color: colors.mutedForeground, textTransform: "capitalize" }}>
                {w.slice(0, 2)}
              </Text>
            ))}
          </View>
          {monthWeeks(month).map((week, w) => (
            <View key={w} style={{ flexDirection: "row", gap: 4 }}>
              {week.map((day, d) => {
                if (!day) return <View key={`blank-${d}`} style={{ flex: 1 }} />
                const st: Status = tracked(day) ? (monthView?.days[day] ?? "not_due") : "not_due"
                const style = st === "done" ? null : CELL[st]
                return (
                  <Pressable
                    key={day}
                    disabled={!tracked(day)}
                    onPress={() => cycle(day)}
                    style={({ pressed }) => [
                      { flex: 1, aspectRatio: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
                      !tracked(day) && { opacity: 0.3 },
                      st === "done" ? { backgroundColor: color } : style?.box,
                      pressed && { transform: [{ scale: 0.88 }] },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontVariant: ["tabular-nums"],
                        fontWeight: day === today ? "700" : "400",
                        color: st === "done" ? "#fff" : style?.text,
                        textDecorationLine: style?.strike ? "line-through" : "none",
                      }}
                    >
                      {+day.slice(8)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
        <Text style={{ textAlign: "center", fontSize: 11, color: colors.mutedForeground }}>Toca un día pasado: {habit.kind === "limit" ? "lo hice" : "hecho"} → saltado → vacío</Text>
      </Card>

      <Card style={{ gap: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>Últimos 6 meses</Text>
        <View style={{ flexDirection: "row", gap: 3 }}>
          {heatmap.map((week, w) => (
            <View key={w} style={{ flex: 1, gap: 3 }}>
              {week.map((day) => {
                const st = statusOf(habit.id, day)
                return <View key={day} style={{ aspectRatio: 1, borderRadius: 3, backgroundColor: st === "done" ? color : st === "failed" ? colors.white30 : colors.white10 }} />
              })}
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  )
}

function StatCard({ icon, label, value, accent, percentage }: { icon?: React.ReactNode; label: string; value: string; accent?: string; percentage?: number }) {
  return (
    <Card style={{ width: "48.7%", gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon}
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] }}>{value}</Text>
      {accent && (
        <View style={{ marginTop: 4, height: 6, borderRadius: 99, backgroundColor: colors.white15, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${percentage}%`, borderRadius: 99, backgroundColor: accent }} />
        </View>
      )}
    </Card>
  )
}
