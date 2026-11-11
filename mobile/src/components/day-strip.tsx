import { useEffect, useRef, type ComponentRef } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSession, useStatuses } from "@/lib/data"
import { addDays, dayOfMonth, weekday, WEEKDAYS } from "@/lib/rules"
import { colors, radius } from "@/theme"

const ITEM = 48
const GAP = 8

export function DayStrip({ selected, onSelect }: { selected: string; onSelect: (day: string) => void }) {
  const { today, habits } = useSession()
  const statusOf = useStatuses()
  const ref = useRef<ComponentRef<typeof ScrollView>>(null)
  const width = useRef(0)
  const firstMonday = addDays(today, -weekday(today) - 14)
  const days = Array.from({ length: 21 }, (_, i) => addDays(firstMonday, i))

  const center = (animated: boolean) => {
    const index = days.indexOf(selected)
    if (index < 0 || !width.current) return
    ref.current?.scrollTo({ x: Math.max(0, index * (ITEM + GAP) - (width.current - ITEM) / 2 + 16), animated })
  }
  useEffect(() => center(true))

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width
        center(false)
      }}
      style={{ marginHorizontal: -16 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: GAP }}
    >
      {days.map((day) => {
        const statuses = habits.map((h) => statusOf(h.id, day)).filter((s) => s !== "not_due")
        const done = statuses.filter((s) => s === "done").length
        const isSelected = day === selected
        const isFuture = day > today
        const text = isSelected ? colors.primaryForeground : isFuture ? "rgba(182,186,196,0.6)" : colors.mutedForeground
        return (
          <Pressable key={day} onPress={() => onSelect(day)} style={[styles.day, isSelected && styles.selected]}>
            <Text style={[styles.weekday, { color: text }]}>{WEEKDAYS[weekday(day)]}</Text>
            <Text style={[styles.number, { color: isSelected ? colors.primaryForeground : isFuture ? text : colors.foreground }]}>{dayOfMonth(day)}</Text>
            <View style={styles.bar}>
              {!isFuture && statuses.length > 0 && (
                <View style={{ height: "100%", width: `${(100 * done) / statuses.length}%`, borderRadius: 99, backgroundColor: isSelected ? colors.primaryForeground : colors.primary }} />
              )}
            </View>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  day: { width: ITEM, alignItems: "center", gap: 2, paddingVertical: 8, borderRadius: radius.md },
  selected: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  weekday: { fontSize: 11, fontWeight: "500", textTransform: "capitalize" },
  number: { fontSize: 18, fontWeight: "600", fontVariant: ["tabular-nums"] },
  bar: { height: 4, width: 24, borderRadius: 99, overflow: "hidden", backgroundColor: colors.white15 },
})
