import { Pressable, StyleSheet, Text, View } from "react-native"
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"
import * as Haptics from "expo-haptics"
import { Ionicons } from "@expo/vector-icons"
import { HabitRing } from "@/components/habit-ring"
import { useToast } from "@/components/toast"
import { Chip, chipTextStyle } from "@/components/ui"
import { useHabitStats, useLogWriter, useReminders, useSession } from "@/lib/data"
import { colorOf, emojiOf, scheduleLabel, type DayEntry, type Habit, type Look } from "@/lib/rules"
import { colors, radius } from "@/theme"

export function HabitIcon({ habit, size = "md" }: { habit: Look; size?: "md" | "lg" }) {
  const color = colorOf(habit)
  const box = size === "md" ? 44 : 56
  return (
    <View style={{ width: box, height: box, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: `${color}26`, borderWidth: 1, borderColor: `${color}33` }}>
      <Text style={{ fontSize: size === "md" ? 20 : 28, fontWeight: "600", color }}>{emojiOf(habit)}</Text>
    </View>
  )
}

function periodLabel(habit: Habit, entry: DayEntry): string {
  if (entry.period_target === null) return "Objetivo cumplido"
  return `${entry.period_done}/${entry.period_target} ${habit.schedule.period_unit === "week" ? "esta semana" : "este mes"}`
}

export function RemindersChip({ habitId }: { habitId: number }) {
  const times = (useReminders(habitId).data ?? []).filter((r) => r.enabled).map((r) => r.time_local.slice(0, 5))
  if (!times.length) return null
  return (
    <Chip>
      <Ionicons name="notifications-outline" size={11} color={colors.mutedForeground} />
      <Text style={chipTextStyle()}>{times.join(" · ")}</Text>
    </Chip>
  )
}

type Props = { habit: Habit; entry: DayEntry; day: string; onOpen: () => void; dimmed?: boolean }

export function HabitRow({ habit, entry, day, onOpen, dimmed }: Props) {
  const { today } = useSession()
  const writer = useLogWriter()
  const { toast } = useToast()
  const streak = useHabitStats(habit.id).data?.current_streak ?? 0
  const isFuture = day > today
  const target = entry.times_per_day
  const scale = useSharedValue(1)
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  async function tap() {
    if (isFuture) {
      toast("Día futuro", { description: "Solo puedes marcar hoy o días pasados." })
      return
    }
    const previous = await writer.read(habit.id, day)
    const count = previous.done_count >= target ? 0 : previous.done_count + 1
    if (!(await writer.write(habit.id, day, { ...previous, done_count: count, skipped: false }))) return
    Haptics.impactAsync(count >= target ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
    toast(count >= target ? `${emojiOf(habit)} ${habit.name} ${habit.kind === "limit" ? "registrado" : "hecho"}` : count ? `${count}/${target}` : "Desmarcado", {
      action: { label: "Deshacer", onClick: () => void writer.write(habit.id, day, previous) },
    })
  }

  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} layout={LinearTransition.springify().damping(28)} style={[styles.row, dimmed && { opacity: 0.6 }]}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.open, pressed && { opacity: 0.7 }]}>
        <HabitIcon habit={habit} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={[styles.name, entry.status === "done" && styles.nameDone]}>
            {habit.name}
          </Text>
          <View style={styles.chips}>
            <Chip>{habit.schedule.type === "times_per_period" ? periodLabel(habit, entry) : scheduleLabel(habit)}</Chip>
            <RemindersChip habitId={habit.id} />
            {streak > 1 && (
              <Chip tone="orange">
                <Ionicons name="flame" size={11} color={colors.orange} />
                <Text style={chipTextStyle("orange")}>{streak}</Text>
              </Chip>
            )}
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={tap}
        onPressIn={() => (scale.value = withSpring(0.85))}
        onPressOut={() => (scale.value = withSpring(1))}
        disabled={isFuture}
        hitSlop={8}
        accessibilityLabel={`Marcar ${habit.name}`}
        style={isFuture && { opacity: 0.4 }}
      >
        <Animated.View style={ringStyle}>
          <HabitRing status={entry.status} count={entry.done_count} target={target} color={colorOf(habit)} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  open: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  name: { fontSize: 16, fontWeight: "500", color: colors.foreground },
  nameDone: { color: colors.mutedForeground, textDecorationLine: "line-through", textDecorationColor: colors.white20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
})
