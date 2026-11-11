import { Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { HabitIcon } from "@/components/habit-row"
import { Card, Chip, chipTextStyle, PageHeader, Screen } from "@/components/ui"
import { useHabitStats, useSession, useStatuses } from "@/lib/data"
import { addDays, colorOf, percent, scheduleLabel, streakLabel, weekday, WEEKDAYS, type Habit, type Status } from "@/lib/rules"
import { colors } from "@/theme"

export const DOT: Record<Exclude<Status, "done">, object> = {
  failed: { borderWidth: 1, borderColor: colors.roseRing },
  skipped: { backgroundColor: colors.white10 },
  pending: { backgroundColor: colors.white10, borderWidth: 1, borderColor: colors.white20 },
  slipped: { borderWidth: 1, borderColor: colors.amberRing },
  not_due: {},
}
export const DOT_TEXT: Record<Exclude<Status, "done">, string> = {
  failed: colors.rose,
  skipped: colors.mutedForeground,
  pending: colors.foreground,
  slipped: colors.amber,
  not_due: "rgba(182,186,196,0.6)",
}

export default function HabitsScreen() {
  const { habits } = useSession()
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshable contentStyle={{ paddingBottom: 100 }}>
        <PageHeader eyebrow={`${habits.length} activos`} title="Hábitos" />
        {habits.map((habit) => (
          <HabitCard key={habit.id} habit={habit} onOpen={() => router.push({ pathname: "/habit/[id]", params: { id: String(habit.id) } })} />
        ))}
      </Screen>
      <Pressable
        onPress={() => router.push("/habit-form")}
        accessibilityLabel="Nuevo hábito"
        style={({ pressed }) => [styles.fab, { bottom: 20 + Math.min(insets.bottom, 0) }, pressed && { transform: [{ scale: 0.92 }] }]}
      >
        <Ionicons name="add" size={32} color={colors.primaryForeground} />
      </Pressable>
    </View>
  )
}

function HabitCard({ habit, onOpen }: { habit: Habit; onOpen: () => void }) {
  const { today } = useSession()
  const statusOf = useStatuses()
  const stats = useHabitStats(habit.id).data
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const color = colorOf(habit)

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => pressed && { opacity: 0.8 }}>
      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <HabitIcon habit={habit} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "500", color: colors.foreground }}>
              {habit.name}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{scheduleLabel(habit)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {week.map((day) => {
            const st = statusOf(habit.id, day)
            return (
              <View key={day} style={{ alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 10, color: colors.mutedForeground, textTransform: "capitalize" }}>{WEEKDAYS[weekday(day)].slice(0, 2)}</Text>
                <View
                  style={[
                    styles.dot,
                    st === "done" ? { backgroundColor: color, shadowColor: color, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : DOT[st],
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: "500", color: st === "done" ? "#fff" : DOT_TEXT[st], fontVariant: ["tabular-nums"] }}>{+day.slice(8)}</Text>
                </View>
              </View>
            )
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Chip tone="orange">
            <Ionicons name="flame" size={11} color={colors.orange} />
            <Text style={chipTextStyle("orange")}>Racha {stats ? streakLabel(habit.schedule, stats.current_streak) : "–"}</Text>
          </Chip>
          <Chip>
            <Ionicons name="locate-outline" size={11} color={colors.mutedForeground} />
            <Text style={chipTextStyle()}>{stats?.percentage == null ? "Sin datos" : `${percent(stats.percentage)}%`}</Text>
          </Chip>
        </View>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  dot: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
})
