import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { router, Tabs } from "expo-router"
import { DayStrip } from "@/components/day-strip"
import { HabitRow } from "@/components/habit-row"
import { Screen, SectionTitle } from "@/components/ui"
import { useDay, useSession, useStatuses } from "@/lib/data"
import { dayTitle, MONTHS, parse, type DayEntry, type Habit } from "@/lib/rules"
import { colors } from "@/theme"

type Row = { habit: Habit; entry: DayEntry }

export default function TodayScreen() {
  const { today, habits } = useSession()
  const statusOf = useStatuses()
  const [day, setDay] = useState(today)
  const items = useDay(day).data?.items
  const open = (habit: Habit) => router.push({ pathname: "/log/[habitId]", params: { habitId: String(habit.id), day } })

  const due: Row[] = (items ?? []).flatMap((entry) => {
    const habit = habits.find((h) => h.id === entry.habit_id)
    return habit ? [{ habit, entry }] : []
  })
  const toDo = due.filter((r) => r.habit.kind === "build")
  const avoid = due.filter((r) => r.habit.kind === "limit")
  // Period habits whose target is already met aren't due today but stay visible, dimmed.
  const metThisPeriod: Row[] = habits
    .filter((h) => h.kind === "build" && h.schedule.type === "times_per_period" && day >= h.start_date && items && !items.some((i) => i.habit_id === h.id))
    .map((habit) => {
      const status = statusOf(habit.id, day)
      const target = habit.schedule.times_per_day
      return { habit, entry: { habit_id: habit.id, status, done_count: status === "done" ? target : 0, times_per_day: target, period_done: null, period_target: null } }
    })
  const date = parse(day)

  return (
    <View style={{ flex: 1 }}>
      <Tabs.Screen
        options={{
          headerTitle: `${dayTitle(day, today)}, ${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]}`,
          headerRight:
            day !== today
              ? () => (
                  <Pressable onPress={() => setDay(today)} hitSlop={10} accessibilityLabel="Ir a hoy" style={({ pressed }) => [{ marginRight: 16 }, pressed && { opacity: 0.6 }]}>
                    <Ionicons name="today-outline" size={24} color={colors.foreground} />
                  </Pressable>
                )
              : undefined,
        }}
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <DayStrip selected={day} onSelect={setDay} />
      </View>

      <Screen refreshable contentStyle={{ paddingTop: 8 }}>
      <View style={{ gap: 8 }}>
        {items && toDo.length === 0 && <Text style={{ paddingVertical: 40, textAlign: "center", color: colors.mutedForeground }}>Nada que hacer este día ✨</Text>}
        {toDo.map(({ habit, entry }) => (
          <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => open(habit)} />
        ))}
      </View>

      {avoid.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle>A evitar</SectionTitle>
          {avoid.map(({ habit, entry }) => (
            <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => open(habit)} />
          ))}
        </View>
      )}

      {metThisPeriod.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle>Objetivo cumplido este periodo</SectionTitle>
          {metThisPeriod.map(({ habit, entry }) => (
            <HabitRow key={habit.id} habit={habit} entry={entry} day={day} onOpen={() => open(habit)} dimmed />
          ))}
        </View>
      )}
      </Screen>
    </View>
  )
}
