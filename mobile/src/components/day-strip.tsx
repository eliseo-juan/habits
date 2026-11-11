import { useEffect, useRef, useState, type ComponentRef } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSession, useStatuses } from "@/lib/data"
import { addDays, dayOfMonth, weekday, WEEKDAYS } from "@/lib/rules"
import { colors, radius } from "@/theme"

const GAP = 6
const INSET = 16
const WEEKS = 3

// One week per page, snapping so a page always starts on a Monday.
export function DayStrip({ selected, onSelect }: { selected: string; onSelect: (day: string) => void }) {
  const { today, habits } = useSession()
  const statusOf = useStatuses()
  const ref = useRef<ComponentRef<typeof ScrollView>>(null)
  const [width, setWidth] = useState(0)
  const firstMonday = addDays(today, -weekday(today) - 7 * (WEEKS - 1))
  const days = Array.from({ length: 7 * WEEKS }, (_, i) => addDays(firstMonday, i))
  const item = width ? (width - 2 * INSET - 6 * GAP) / 7 : 0
  const page = 7 * (item + GAP)
  const selectedWeek = Math.floor(Math.max(0, days.indexOf(selected)) / 7)

  const positioned = useRef(false)

  useEffect(() => {
    if (!page) return
    ref.current?.scrollTo({ x: selectedWeek * page, animated: positioned.current })
    positioned.current = true
  }, [selectedWeek, page])

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={page || undefined}
      decelerationRate="fast"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ marginHorizontal: -INSET }}
      contentContainerStyle={{ paddingHorizontal: INSET, paddingVertical: 4, gap: GAP }}
    >
      {item > 0 &&
        days.map((day) => {
          const statuses = habits.map((h) => statusOf(h.id, day)).filter((s) => s !== "not_due")
          const done = statuses.filter((s) => s === "done").length
          const isSelected = day === selected
          const isFuture = day > today
          const text = isSelected ? colors.primaryForeground : isFuture ? "rgba(182,186,196,0.6)" : colors.mutedForeground
          return (
            <Pressable key={day} onPress={() => onSelect(day)} style={[styles.day, { width: item }, isSelected && styles.selected]}>
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
  day: { alignItems: "center", gap: 2, paddingVertical: 8, borderRadius: radius.md },
  selected: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  weekday: { fontSize: 11, fontWeight: "500", textTransform: "capitalize" },
  number: { fontSize: 18, fontWeight: "600", fontVariant: ["tabular-nums"] },
  bar: { height: 4, width: 24, borderRadius: 99, overflow: "hidden", backgroundColor: colors.white15 },
})
