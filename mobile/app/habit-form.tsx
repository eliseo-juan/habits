import { useState } from "react"
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native"
import DateTimePicker from "@react-native-community/datetimepicker"
import { Ionicons } from "@expo/vector-icons"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useHeaderHeight } from "expo-router/react-navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useToast } from "@/components/toast"
import { Button, Fab, SectionTitle } from "@/components/ui"
import { api } from "@/lib/api"
import { habitsQuery, useReminders, useSession, type Reminder } from "@/lib/data"
import { remindersEnabled, syncReminders } from "@/lib/reminders"
import { colorOf, parse, iso, WEEKDAYS, type Habit, type Schedule } from "@/lib/rules"
import { colors, HABIT_COLORS, radius } from "@/theme"

const MONDAY = 1

const TYPES = [
  { id: "daily", label: "Diario" },
  { id: "weekdays", label: "Días fijos" },
  { id: "times_per_period", label: "Por periodo" },
] as const

const pick = (s: Schedule) => ({ type: s.type, times_per_day: s.times_per_day, weekdays: s.weekdays, period_unit: s.period_unit, period_target: s.period_target })

function Segments<T extends string>({ options, value, onChange }: { options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <View style={styles.segments}>
      {options.map((o) => (
        <Pressable key={o.id} onPress={() => onChange(o.id)} style={[styles.segment, value === o.id && { backgroundColor: colors.primary }]}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: value === o.id ? colors.primaryForeground : colors.mutedForeground }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function DateField({ label, value, onChange, min, optional }: { label: string; value: string; onChange: (value: string) => void; min?: string; optional?: boolean }) {
  const [open, setOpen] = useState(false)
  const date = value ? parse(value) : new Date()
  // The picker works in local time; the app's days are plain ISO dates, so go through UTC noon to avoid off-by-one.
  const toLocal = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)
  const fromLocal = (d: Date) => iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))

  const picker = (
    <DateTimePicker
      value={toLocal(date)}
      mode="date"
      minimumDate={min ? toLocal(parse(min)) : undefined}
      themeVariant="dark"
      locale="es-ES"
      firstDayOfWeek={MONDAY}
      display={Platform.OS === "ios" ? "compact" : "default"}
      onChange={(event, selected) => {
        setOpen(false)
        if (event.type !== "dismissed" && selected) onChange(fromLocal(selected))
      }}
    />
  )

  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.hint}>{label}</Text>
      <View style={[styles.field, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        {Platform.OS === "ios" ? (
          value || !optional ? (
            picker
          ) : (
            <Pressable onPress={() => onChange(iso(new Date()))}>
              <Text style={{ color: colors.mutedForeground }}>Sin fin</Text>
            </Pressable>
          )
        ) : (
          <Pressable onPress={() => setOpen(true)} style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: value ? colors.foreground : colors.mutedForeground }}>{value || "Sin fin"}</Text>
          </Pressable>
        )}
        {optional && value ? (
          <Pressable onPress={() => onChange("")} hitSlop={10} accessibilityLabel="Quitar fecha">
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {Platform.OS !== "ios" && open && picker}
    </View>
  )
}

type DraftReminder = Omit<Reminder, "id" | "time_local"> & { id?: number; time: string; key: string }

const toDraft = (r: Reminder): DraftReminder => ({ id: r.id, key: String(r.id), time: r.time_local.slice(0, 5), weekdays: r.weekdays, enabled: r.enabled })
const reminderBody = (r: DraftReminder) => ({ time_local: r.time, weekdays: r.weekdays, enabled: r.enabled })

function TimeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [hour, minute] = value.split(":").map(Number)
  const pad = (n: number) => String(n).padStart(2, "0")

  const picker = (
    <DateTimePicker
      value={new Date(2000, 0, 1, hour, minute)}
      mode="time"
      is24Hour
      themeVariant="dark"
      locale="es-ES"
      display={Platform.OS === "ios" ? "compact" : "default"}
      onChange={(event, selected) => {
        setOpen(false)
        if (event.type !== "dismissed" && selected) onChange(`${pad(selected.getHours())}:${pad(selected.getMinutes())}`)
      }}
    />
  )

  if (Platform.OS === "ios") return picker
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel="Cambiar hora">
        <Text style={{ fontSize: 18, fontWeight: "500", fontVariant: ["tabular-nums"], color: colors.foreground }}>{value}</Text>
      </Pressable>
      {open && picker}
    </>
  )
}

function RemindersEditor({ value, onChange }: { value: DraftReminder[]; onChange: (next: DraftReminder[]) => void }) {
  const update = (key: string, changes: Partial<DraftReminder>) => onChange(value.map((r) => (r.key === key ? { ...r, ...changes } : r)))
  const add = () => onChange([...value, { key: `new-${Date.now()}`, time: "09:00", weekdays: null, enabled: true }])

  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>Recordatorios</SectionTitle>
      {value.map((r) => (
        <View key={r.key} style={[styles.field, { flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 12 }]}>
          <Ionicons name={r.enabled ? "notifications-outline" : "notifications-off-outline"} size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1, alignItems: "flex-start" }}>
            <TimeField value={r.time} onChange={(time) => update(r.key, { time })} />
          </View>
          <Switch value={r.enabled} onValueChange={(enabled) => update(r.key, { enabled })} trackColor={{ true: colors.primary, false: colors.muted }} accessibilityLabel="Activo" />
          <Pressable onPress={() => onChange(value.filter((x) => x.key !== r.key))} hitSlop={10} accessibilityLabel="Quitar recordatorio">
            <Ionicons name="trash-outline" size={20} color={colors.rose} />
          </Pressable>
        </View>
      ))}
      <Button variant="secondary" label="Añadir recordatorio" icon={<Ionicons name="add" size={18} color={colors.foreground} />} onPress={add} />
      <Text style={styles.hint}>Avisan en este móvil si activas los recordatorios en Ajustes.</Text>
    </View>
  )
}

export default function HabitFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { today, habits } = useSession()
  const habit = id ? habits.find((h) => String(h.id) === id) : undefined
  const client = useQueryClient()
  const { toast } = useToast()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()

  const [kind, setKind] = useState<Habit["kind"]>(habit?.kind ?? "build")
  const [name, setName] = useState(habit?.name ?? "")
  const [icon, setIcon] = useState(habit?.icon ?? "")
  const [color, setColor] = useState(habit ? colorOf(habit) : HABIT_COLORS[0])
  const [startDate, setStartDate] = useState(habit?.start_date ?? today)
  const [endDate, setEndDate] = useState(habit?.end_date ?? "")
  const [schedule, setSchedule] = useState<Schedule>(habit?.schedule ?? { type: "daily", times_per_day: 1, weekdays: null, period_unit: null, period_target: null })
  const [busy, setBusy] = useState(false)
  const savedReminders = useReminders(habit?.id ?? -1, { enabled: !!habit }).data
  const [draftReminders, setDraftReminders] = useState<DraftReminder[] | null>(null)
  const reminders = draftReminders ?? (savedReminders ?? []).map(toDraft)

  const patch = (changes: Partial<Schedule>) => setSchedule((s) => ({ ...s, ...changes }))
  function setType(type: Schedule["type"]) {
    patch({
      type,
      weekdays: type === "weekdays" ? (schedule.weekdays ?? [0, 1, 2, 3, 4]) : null,
      period_unit: type === "times_per_period" ? (schedule.period_unit ?? "week") : null,
      period_target: type === "times_per_period" ? (schedule.period_target ?? 3) : null,
    })
  }
  const toggleDay = (i: number) => {
    const days = schedule.weekdays ?? []
    patch({ weekdays: days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort() })
  }
  const datesOk = !!startDate && (!endDate || endDate >= startDate)
  const valid = name.trim() && datesOk && (schedule.type !== "weekdays" || (schedule.weekdays?.length ?? 0) > 0)

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    try {
      await action()
      await client.invalidateQueries()
      ;(after ?? (() => router.back()))()
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo guardar", { error: true })
    } finally {
      setBusy(false)
    }
  }

  const scheduleBody = {
    type: schedule.type,
    times_per_day: kind === "limit" ? 1 : schedule.times_per_day,
    weekdays: schedule.type === "weekdays" ? schedule.weekdays : null,
    period_unit: schedule.type === "times_per_period" ? schedule.period_unit : null,
    period_target: schedule.type === "times_per_period" ? schedule.period_target : null,
  }

  async function saveReminders(habitId: number) {
    if (draftReminders === null) return
    const before = new Map((savedReminders ?? []).map((r) => [r.id, toDraft(r)]))
    const kept = new Set(draftReminders.flatMap((r) => (r.id ? [r.id] : [])))
    await Promise.all([
      ...[...before.keys()].filter((id) => !kept.has(id)).map((id) => api(`/reminders/${id}`, { method: "DELETE" })),
      ...draftReminders.map((r) => {
        if (!r.id) return api(`/habits/${habitId}/reminders`, { method: "POST", body: reminderBody(r) })
        const old = before.get(r.id)
        return old && JSON.stringify(reminderBody(old)) !== JSON.stringify(reminderBody(r)) ? api(`/reminders/${r.id}`, { method: "PATCH", body: reminderBody(r) }) : null
      }),
    ])
    if (await remindersEnabled()) await syncReminders(await client.fetchQuery({ ...habitsQuery, staleTime: 0 })).catch(() => {})
  }

  const save = () =>
    run(async () => {
      const look = { name: name.trim(), icon: icon.trim() || null, color, start_date: startDate, end_date: endDate || null }
      if (!habit) {
        const created = await api<Habit>("/habits", { method: "POST", body: { ...look, kind, schedule: scheduleBody } })
        if (kind === "build") await saveReminders(created.id)
        return
      }
      await api(`/habits/${habit.id}`, { method: "PATCH", body: look })
      if (JSON.stringify(scheduleBody) !== JSON.stringify(pick(habit.schedule))) {
        await api(`/habits/${habit.id}/schedules`, { method: "POST", body: { ...scheduleBody, effective_from: today } })
      }
      if (kind === "build") await saveReminders(habit.id)
    })

  const confirm = (title: string, message: string, action: string, onConfirm: () => void) =>
    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel" },
      { text: action, style: "destructive", onPress: onConfirm },
    ])

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: habit ? "Editar hábito" : "Nuevo hábito",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Cerrar" style={{ marginRight: Platform.OS === "android" ? 24 : 0 }}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: Math.max(insets.bottom, 16) + 96 }} keyboardShouldPersistTaps="handled">
        {!habit && (
          <View style={{ gap: 8 }}>
            <SectionTitle>Tipo</SectionTitle>
            <Segments
              options={[
                { id: "build", label: "Hacer" },
                { id: "limit", label: "Evitar" },
              ]}
              value={kind}
              onChange={setKind}
            />
          </View>
        )}

        <View style={{ gap: 8 }}>
          <SectionTitle>Hábito</SectionTitle>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[styles.field, { width: 80, textAlign: "center", fontSize: 22, paddingHorizontal: 0 }]} placeholder="🙂" placeholderTextColor={colors.mutedForeground} value={icon} maxLength={8} onChangeText={setIcon} accessibilityLabel="Emoji" />
            <TextInput style={[styles.field, { flex: 1 }]} placeholder="Nombre" placeholderTextColor={colors.mutedForeground} value={name} maxLength={120} onChangeText={setName} accessibilityLabel="Nombre" />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, paddingTop: 4 }}>
            {HABIT_COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} accessibilityLabel={c} style={[{ width: 36, height: 36, borderRadius: 18, backgroundColor: c }, color === c && { borderWidth: 2, borderColor: "#fff" }]} />
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Frecuencia</SectionTitle>
          <Segments options={TYPES} value={schedule.type} onChange={setType} />

          {schedule.type === "weekdays" && (
            <View style={{ flexDirection: "row", gap: 6 }}>
              {WEEKDAYS.map((w, i) => {
                const on = schedule.weekdays?.includes(i)
                return (
                  <Pressable key={w} onPress={() => toggleDay(i)} style={[styles.day, { backgroundColor: on ? colors.primary : colors.white10 }]}>
                    <Text style={{ fontSize: 14, textTransform: "capitalize", color: on ? colors.primaryForeground : colors.mutedForeground }}>{w.slice(0, 2)}</Text>
                  </Pressable>
                )
              })}
            </View>
          )}

          {schedule.type === "times_per_period" && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  keyboardType="number-pad"
                  style={[styles.field, { width: 80, textAlign: "center" }]}
                  value={schedule.period_target?.toString() ?? ""}
                  onChangeText={(t) => patch({ period_target: Number(t.replace(/\D/g, "")) || null })}
                  accessibilityLabel="Días"
                />
                <Text style={{ fontSize: 14, color: colors.mutedForeground }}>{kind === "limit" ? "días máx." : "días"}</Text>
              </View>
              <Segments
                options={[
                  { id: "week", label: "por semana" },
                  { id: "month", label: "al mes" },
                ]}
                value={schedule.period_unit ?? "week"}
                onChange={(unit) => patch({ period_unit: unit, period_target: Math.min(schedule.period_target ?? 1, unit === "week" ? 7 : 31) })}
              />
            </View>
          )}

          {kind === "build" && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
              <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Veces al día</Text>
              <TextInput
                keyboardType="number-pad"
                style={[styles.field, { width: 96, textAlign: "center" }]}
                value={String(schedule.times_per_day)}
                onChangeText={(t) => patch({ times_per_day: Math.min(50, Math.max(1, Number(t.replace(/\D/g, "")) || 1)) })}
              />
            </View>
          )}
          {habit && <Text style={styles.hint}>Los cambios de frecuencia se aplican desde hoy.</Text>}
        </View>

        {kind === "build" && (!habit || savedReminders) && <RemindersEditor value={reminders} onChange={setDraftReminders} />}

        <View style={{ gap: 8 }}>
          <SectionTitle>Fechas</SectionTitle>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <DateField label="Inicio" value={startDate} onChange={setStartDate} />
            <DateField label="Fin (opcional)" value={endDate} onChange={setEndDate} min={startDate} optional />
          </View>
          {!datesOk && <Text style={{ fontSize: 12, color: colors.rose }}>El fin no puede ser anterior al inicio.</Text>}
        </View>

        {habit && (
          <View style={{ gap: 8 }}>
            <SectionTitle>Zona delicada</SectionTitle>
            <Button
              variant="secondary"
              size="lg"
              label="Reiniciar estadísticas"
              icon={<Ionicons name="refresh" size={18} color={colors.foreground} />}
              disabled={busy}
              onPress={() =>
                confirm("¿Reiniciar estadísticas?", `Racha, porcentaje y contadores de "${habit.name}" empezarán a contar desde hoy. El historial de días no se borra.`, "Reiniciar", () =>
                  run(() => api(`/habits/${habit.id}`, { method: "PATCH", body: { stats_start_date: today } })),
                )
              }
            />
            <Button
              variant="ghost"
              size="lg"
              label="Archivar hábito"
              icon={<Ionicons name="archive-outline" size={18} color={colors.rose} />}
              disabled={busy}
              onPress={() =>
                confirm("¿Archivar hábito?", `"${habit.name}" dejará de aparecer en tus listas.`, "Archivar", () =>
                  run(
                    () => api(`/habits/${habit.id}`, { method: "DELETE" }),
                    () => {
                      router.dismissAll()
                      router.navigate("/habits")
                    },
                  ),
                )
              }
            />
          </View>
        )}
      </ScrollView>
      <Fab icon="checkmark" label="Guardar" disabled={!valid} busy={busy} onPress={save} style={{ bottom: Math.max(insets.bottom, 16) + 8 }} />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  field: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white10, paddingHorizontal: 16, fontSize: 16, color: colors.foreground, justifyContent: "center" },
  hint: { paddingHorizontal: 4, fontSize: 12, color: colors.mutedForeground },
  segments: { flexDirection: "row", gap: 6, padding: 4, borderRadius: radius.md, backgroundColor: colors.white10 },
  segment: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  day: { flex: 1, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
})
