// Android widget (Jetpack Compose / Glance). Same constraints as the iOS one: pure function, no outer references.
// Colors come from the device's Material You palette (wallpaper-derived on Android 12+, Material 3 baseline below).
import { Box, Column, LinearProgressIndicator, Row, Spacer, Text, getMaterialColors } from "@expo/ui/jetpack-compose"
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, paddingAll, size, width } from "@expo/ui/jetpack-compose/modifiers"
import { createWidget } from "expo-widgets"
import { EMPTY_WIDGET, type WidgetProps } from "./types"

const HabitsWidget = (props: WidgetProps) => {
  "widget"
  const c = getMaterialColors()
  const fraction = props.total ? props.done / props.total : 0
  const finished = props.total > 0 && props.done === props.total
  const frame = [fillMaxSize(), paddingAll(18), background(c.surfaceContainer), cornerRadius(28)]
  // Same colors as the app's priority flags (none, low, medium, high).
  const flags = ["", "#3b82f6", "#eab308", "#ef4444"]

  if (!props.signedIn) {
    return (
      <Column modifiers={frame}>
        <Text color={c.onSurface} style={{ fontSize: 22, fontWeight: "700" }}>Hábitos</Text>
        <Text color={c.onSurfaceVariant} style={{ fontSize: 15 }}>Abre la app para sincronizar</Text>
      </Column>
    )
  }

  if (props.total === 0) {
    return (
      <Column modifiers={frame}>
        <Text color={c.onSurface} style={{ fontSize: 22, fontWeight: "700" }}>Hoy</Text>
        <Text color={c.onSurfaceVariant} style={{ fontSize: 15 }}>No tienes hábitos para hoy</Text>
      </Column>
    )
  }

  // Props arrive sorted (pending first, then by priority). The last line says how many are cut off.
  const max = 6
  const overflow = props.habits.length > max
  const shown = props.habits.slice(0, overflow ? max - 1 : max)
  const hidden = props.total - shown.length

  return (
    <Column modifiers={frame}>
      <Row modifiers={[fillMaxWidth()]} horizontalArrangement="spaceBetween" verticalAlignment="center">
        <Text color={c.onSurface} style={{ fontSize: 22, fontWeight: "700" }}>
          {finished ? "Hoy ✨" : "Hoy"}
        </Text>
        <Box modifiers={[background(finished ? c.primary : c.primaryContainer), cornerRadius(50), padding(12, 4, 12, 4)]}>
          <Text color={finished ? c.onPrimary : c.onPrimaryContainer} style={{ fontSize: 16, fontWeight: "700" }}>
            {props.done}/{props.total}
          </Text>
        </Box>
      </Row>
      <Spacer modifiers={[height(10)]} />
      <LinearProgressIndicator
        progress={fraction}
        color={c.primary}
        trackColor={c.secondaryContainer}
        modifiers={[fillMaxWidth(), height(8)]}
      />
      <Spacer modifiers={[height(8)]} />
      {shown.map((habit) => (
        <Row key={habit.id} modifiers={[fillMaxWidth(), padding(0, 5, 0, 5)]} horizontalArrangement="spaceBetween" verticalAlignment="center">
          <Row verticalAlignment="center">
            <Box modifiers={[size(4, 22), cornerRadius(2), background(flags[habit.priority] || c.surfaceContainer)]} />
            <Spacer modifiers={[width(10)]} />
            <Text style={{ fontSize: 19 }}>{habit.icon}</Text>
            <Spacer modifiers={[width(10)]} />
            <Text
              color={habit.done ? c.onSurfaceVariant : c.onSurface}
              maxLines={1}
              overflow="ellipsis"
              style={{ fontSize: 17, fontWeight: habit.done ? "400" : "600" }}
            >
              {habit.name}
            </Text>
          </Row>
          <Text color={habit.done ? c.primary : c.onSurfaceVariant} style={{ fontSize: 17, fontWeight: "700" }}>
            {habit.done ? "✓" : habit.progress || "○"}
          </Text>
        </Row>
      ))}
      {overflow ? (
        <Text color={c.onSurfaceVariant} style={{ fontSize: 14 }}>{`+${hidden} más`}</Text>
      ) : null}
    </Column>
  )
}

export default createWidget<WidgetProps>("HabitsToday", HabitsWidget, EMPTY_WIDGET)
