import { useEffect, useState } from "react"
import { Pressable, Text, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"
import { Ionicons } from "@expo/vector-icons"
import { Card, PageHeader, Screen } from "@/components/ui"
import { useSession, useYear } from "@/lib/data"
import { addDays, colorOf, emojiOf, monthBounds, MONTHS, shiftMonth, type Status } from "@/lib/rules"
import { colors } from "@/theme"

function Bar({ value, color }: { value: number; color: string }) {
  const width = useSharedValue(0)
  useEffect(() => {
    width.value = withSpring(value, { stiffness: 80, damping: 18 })
  }, [value, width])
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }))
  return (
    <View style={{ height: 8, borderRadius: 99, backgroundColor: colors.white15, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", borderRadius: 99, backgroundColor: color }, style]} />
    </View>
  )
}

export function MonthSwitch({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const [year, number] = month.split("-").map(Number)
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Pressable hitSlop={10} onPress={() => onChange(shiftMonth(month, -1))} accessibilityLabel="Mes anterior">
        <Ionicons name="chevron-back" size={22} color={colors.mutedForeground} />
      </Pressable>
      <Text style={{ width: 96, textAlign: "center", fontSize: 14, fontWeight: "500", color: colors.foreground, textTransform: "capitalize" }}>
        {MONTHS[number - 1]} {String(year).slice(2)}
      </Text>
      <Pressable hitSlop={10} onPress={() => onChange(shiftMonth(month, 1))} accessibilityLabel="Mes siguiente">
        <Ionicons name="chevron-forward" size={22} color={colors.mutedForeground} />
      </Pressable>
    </View>
  )
}

export default function ProgressScreen() {
  const { today, habits } = useSession()
  const [month, setMonth] = useState(today.slice(0, 7))
  const year = Number(month.slice(0, 4))
  const [first, last] = monthBounds(month)
  const days = Array.from({ length: +last.slice(8) }, (_, i) => addDays(first, i))
  const view = useYear(year).data
  const rows = habits.flatMap((habit) => {
    const line = view?.habits.find((h) => h.habit_id === habit.id)
    if (!line) return []
    const percentage = line.months.find((m) => m.month === month)?.percentage ?? null
    const statusOf = (day: string): Status => (day > today ? "not_due" : (line.days[day] ?? "not_due"))
    return [{ habit, percentage: percentage === null ? null : Math.round(percentage), statusOf }]
  })
  const scored = rows.filter((r) => r.percentage !== null)
  const average = scored.length ? Math.round(scored.reduce((sum, r) => sum + (r.percentage ?? 0), 0) / scored.length) : null

  return (
    <Screen refreshable>
      <PageHeader eyebrow="Media del mes" title={`${average ?? "–"}%`} right={<MonthSwitch month={month} onChange={setMonth} />} />

      <Card style={{ gap: 12 }}>
        {rows.map(({ habit, percentage }) => (
          <View key={habit.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.foreground }}>
                {habit.name}
              </Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>{percentage ?? "–"}%</Text>
            </View>
            <Bar value={percentage ?? 0} color={colorOf(habit)} />
          </View>
        ))}
      </Card>

      <Card style={{ gap: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>Día a día</Text>
        <View style={{ gap: 6 }}>
          {rows.map(({ habit, statusOf }) => (
            <View key={habit.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ width: 20, textAlign: "center", fontSize: 14, color: colorOf(habit) }}>{emojiOf(habit)}</Text>
              <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
                {days.map((day) => {
                  const st = statusOf(day)
                  const background = st === "done" ? colorOf(habit) : st === "failed" ? colors.white30 : st === "not_due" ? colors.white05 : colors.white10
                  return <View key={day} style={{ flex: 1, height: 20, borderRadius: 3, backgroundColor: background }} />
                })}
              </View>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  )
}
