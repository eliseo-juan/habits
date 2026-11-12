// Android widget (Jetpack Compose / Glance). Same constraints as the iOS one: pure function, no outer references.
// Colors come from the device's Material You palette (wallpaper-derived on Android 12+, Material 3 baseline below).
import { Box, Column, LinearProgressIndicator, Row, Spacer, Text, getMaterialColors } from "@expo/ui/jetpack-compose"
import { background, cornerRadius, fillMaxWidth, height, paddingAll, weight } from "@expo/ui/jetpack-compose/modifiers"
import { createWidget } from "expo-widgets"
import type { WidgetProps } from "./types"

const HabitsWidget = (props: WidgetProps) => {
  "widget"
  const c = getMaterialColors()
  const fraction = props.total ? props.done / props.total : 0
  const finished = props.total > 0 && props.done === props.total
  const frame = [fillMaxWidth(), paddingAll(16), background(c.surfaceContainer), cornerRadius(28)]

  if (!props.signedIn) {
    return (
      <Column modifiers={frame}>
        <Text color={c.onSurface} style={{ fontSize: 16, fontWeight: "600" }}>Hábitos</Text>
        <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>Abre la app para sincronizar</Text>
      </Column>
    )
  }

  // Pending first (props already come sorted), done ones after, dimmed. The last line says how many are cut off.
  const max = 5
  const overflow = Math.max(0, props.habits.length - max)
  const shown = props.habits.slice(0, overflow ? max - 1 : max)
  const hidden = props.total - shown.length

  return (
    <Column modifiers={frame}>
      <Row modifiers={[fillMaxWidth()]}>
        <Text color={c.onSurface} style={{ fontSize: 16, fontWeight: "600" }} modifiers={[weight(1)]}>
          {finished ? "Hoy ✨" : "Hoy"}
        </Text>
        <Box modifiers={[background(finished ? c.primary : c.primaryContainer), cornerRadius(50), paddingAll(6)]}>
          <Text color={finished ? c.onPrimary : c.onPrimaryContainer} style={{ fontSize: 13, fontWeight: "700" }}>
            {props.done}/{props.total}
          </Text>
        </Box>
      </Row>
      <Spacer modifiers={[height(8)]} />
      <LinearProgressIndicator
        progress={fraction}
        color={c.primary}
        trackColor={c.secondaryContainer}
        modifiers={[fillMaxWidth(), height(6)]}
      />
      <Spacer modifiers={[height(6)]} />
      {shown.map((habit) => (
        <Row key={habit.id} modifiers={[fillMaxWidth(), paddingAll(3)]}>
          <Text style={{ fontSize: 13 }}>{habit.icon}  </Text>
          <Text
            color={habit.done ? c.onSurfaceVariant : c.onSurface}
            maxLines={1}
            overflow="ellipsis"
            style={{ fontSize: 13 }}
            modifiers={[weight(1)]}
          >
            {habit.name}
          </Text>
          <Text color={habit.done ? c.primary : c.onSurfaceVariant} style={{ fontSize: 12, fontWeight: "600" }}>
            {habit.done ? "✓" : (habit.progress ?? "○")}
          </Text>
        </Row>
      ))}
      {overflow ? (
        <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>{`+${hidden} más`}</Text>
      ) : null}
    </Column>
  )
}

export default createWidget<WidgetProps>("HabitsToday", HabitsWidget, { signedIn: false, date: "", done: 0, total: 0, habits: [] })
