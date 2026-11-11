import { useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { router, useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { HabitRing } from "@/components/habit-ring"
import { HabitIcon } from "@/components/habit-row"
import { Button } from "@/components/ui"
import { useDay, useLog, useLogWriter, useSession, useStatuses } from "@/lib/data"
import { colorOf, dayTitle, EMPTY_LOG, scheduleLabel, type DayEntry, type DayLog } from "@/lib/rules"
import { colors, radius } from "@/theme"

export default function DaySheet() {
  const { habitId, day: dayParam } = useLocalSearchParams<{ habitId: string; day?: string }>()
  const { today, habits } = useSession()
  const habit = habits.find((h) => String(h.id) === habitId)
  const day = dayParam ?? today
  const statusOf = useStatuses()
  const entryFromServer = useDay(day).data?.items.find((i) => i.habit_id === habit?.id)
  if (!habit) return null

  // Period habits that already met their target aren't in the day's items: rebuild the entry from the statuses.
  const target = habit.schedule.times_per_day
  const status = statusOf(habit.id, day)
  const entry: DayEntry = entryFromServer ?? { habit_id: habit.id, status, done_count: status === "done" ? target : 0, times_per_day: target, period_done: null, period_target: null }
  return <Sheet habit={habit} entry={entry} day={day} />
}

function Sheet({ habit, entry, day }: { habit: NonNullable<ReturnType<typeof useSession>["habits"][number]>; entry: DayEntry; day: string }) {
  const { today } = useSession()
  const insets = useSafeAreaInsets()
  const writer = useLogWriter()
  const log = useLog(habit.id, day).data ?? EMPTY_LOG
  const [note, setNote] = useState<string | null>(null)
  const [writingNote, setWritingNote] = useState(false)
  const target = entry.times_per_day
  const isFuture = day > today
  const status = log.skipped ? "skipped" : habit.kind === "build" && log.done_count >= target ? "done" : entry.status
  const current = { ...log, note: note === null ? log.note : note || null }
  const unsavedNote = useRef<string | null>(null)

  const write = (next: DayLog) => {
    unsavedNote.current = null
    return writer.write(habit.id, day, next)
  }
  const save = (patch: Partial<DayLog>) => write({ ...current, skipped: false, ...patch })
  const close = (saved: Promise<boolean>) =>
    saved.then((ok) => {
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        router.back()
      }
    })

  // Swiping the sheet away, tapping outside and the back gesture all unmount it: a typed note is saved on the way out.
  const saveNoteOnExit = useRef(() => {})
  useEffect(() => {
    saveNoteOnExit.current = () => {
      const pending = unsavedNote.current
      if (pending === null) return
      writer.read(habit.id, day).then((latest) => (latest.note ?? "") !== pending && writer.write(habit.id, day, { ...latest, note: pending || null }))
    }
  })
  useEffect(() => () => saveNoteOnExit.current(), [])

  const color = colorOf(habit)

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <HabitIcon habit={habit} size="lg" />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: "600", color: colors.foreground }}>
            {habit.name}
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
            {dayTitle(day, today)} · {scheduleLabel(habit)}
          </Text>
        </View>
        {target === 1 && <HabitRing status={status} count={log.done_count} target={target} color={color} size={48} />}
      </View>

      {target > 1 && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 }}>
          <Pressable disabled={isFuture || log.done_count === 0} onPress={() => save({ done_count: log.done_count - 1 })} style={[styles.round, (isFuture || log.done_count === 0) && { opacity: 0.4 }]} accessibilityLabel="Una menos">
            <Ionicons name="remove" size={26} color={colors.foreground} />
          </Pressable>
          <HabitRing status={status} count={log.done_count} target={target} color={color} size={88} />
          <Pressable disabled={isFuture || log.done_count >= target} onPress={() => save({ done_count: log.done_count + 1 })} style={[styles.round, (isFuture || log.done_count >= target) && { opacity: 0.4 }]} accessibilityLabel="Una más">
            <Ionicons name="add" size={26} color={colors.foreground} />
          </Pressable>
        </View>
      )}

      <View style={[styles.segments, isFuture && { opacity: 0.45 }]}>
        <Segment icon="checkmark" label={habit.kind === "limit" ? "Lo hice" : "Hecho"} active={log.done_count >= target} primary disabled={isFuture} onPress={() => close(save({ done_count: target }))} />
        <Segment icon="play-skip-forward" label="Saltado" active={log.skipped} disabled={isFuture} onPress={() => close(save({ done_count: 0, skipped: true }))} />
        <Segment icon="remove-circle-outline" label="Vacío" active={!log.skipped && log.done_count === 0} disabled={isFuture} onPress={() => close(write({ ...EMPTY_LOG, note: current.note }))} />
      </View>

      {writingNote || current.note ? (
        <TextInput
          autoFocus={writingNote}
          multiline
          placeholder="Nota del día"
          placeholderTextColor={colors.mutedForeground}
          style={styles.note}
          value={note ?? log.note ?? ""}
          editable={!isFuture}
          onChangeText={(text) => {
            setNote(text)
            unsavedNote.current = text
          }}
        />
      ) : (
        <Button variant="ghost" label="Añadir nota" icon={<Ionicons name="create-outline" size={18} color={colors.mutedForeground} />} disabled={isFuture} onPress={() => setWritingNote(true)} />
      )}
    </View>
  )
}

type SegmentProps = { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; primary?: boolean; disabled: boolean; onPress: () => void }

function Segment({ icon, label, active, primary, disabled, onPress }: SegmentProps) {
  const fg = active && primary ? colors.primaryForeground : active ? colors.foreground : colors.mutedForeground
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [styles.segment, active && { backgroundColor: primary ? colors.primary : colors.white15 }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: fg }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  segments: { flexDirection: "row", gap: 4, padding: 4, borderRadius: radius.md + 4, backgroundColor: colors.white10 },
  segment: { flex: 1, minHeight: 60, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: radius.md },
  sheet: { gap: 16, paddingHorizontal: 20, paddingTop: 24, backgroundColor: colors.popover },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.white10 },
  note: { minHeight: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.white15, backgroundColor: colors.white10, padding: 12, fontSize: 16, color: colors.foreground, textAlignVertical: "top" },
})
