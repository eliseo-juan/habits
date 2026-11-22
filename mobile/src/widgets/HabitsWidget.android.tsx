// Android widget (Jetpack Compose / Glance). Same constraints as the iOS one: pure function, no outer references.
// Colors come from the device's Material You palette (wallpaper-derived on Android 12+, Material 3 baseline below).
import { Box, Button, Column, Row, Spacer, Text, getMaterialColors } from "@expo/ui/jetpack-compose"
import { background, cornerRadius, fillMaxSize, fillMaxWidth, padding, size, width } from "@expo/ui/jetpack-compose/modifiers"
import { createWidget } from "expo-widgets"
import { EMPTY_WIDGET, type WidgetProps } from "./types"

const HabitsWidget = (props: WidgetProps) => {
  "widget"
  const c = getMaterialColors()
  // Plain list on the widget's own surface, no header and no per-habit cards, like the app's Today screen.
  const frame = [fillMaxSize(), padding(10, 8, 10, 8), background(c.surfaceContainer), cornerRadius(28)]
  // Same colors as the app's priority flags (none, low, medium, high).
  const flags = ["", "#3b82f6", "#eab308", "#ef4444"]

  if (!props.signedIn || (props.habits.length === 0 && props.avoid.length === 0)) {
    return (
      <Button modifiers={[fillMaxSize()]} {...{ target: "open:" }} colors={{ containerColor: c.surfaceContainer }} onClick={() => undefined}>
        <Column modifiers={frame} verticalArrangement="center">
          <Text color={c.onSurface} style={{ fontSize: 18, fontWeight: "600" }}>{props.signedIn ? "Nada que hacer hoy ✨" : "Hábitos"}</Text>
          <Text color={c.onSurfaceVariant} style={{ fontSize: 14 }}>{props.signedIn ? "Toca para abrir la app" : "Abre la app para sincronizar"}</Text>
        </Column>
      </Button>
    )
  }

  // Props arrive sorted (pending first, then by priority). Seven lines fit a 4x3 widget; the label counts as one.
  const max = 7
  const buildShown = props.habits.slice(0, props.avoid.length ? max - 2 : max)
  const room = max - buildShown.length
  const avoidShown = props.avoid.length && room >= 2 ? props.avoid.slice(0, room - 1) : []
  const hidden = props.habits.length + props.avoid.length - buildShown.length - avoidShown.length
  const row = (habit: (typeof props.habits)[number]) => (
    <Button
      key={habit.id}
      {...{ target: "open:log/" + habit.id }}
      onClick={() => undefined}
      modifiers={[fillMaxWidth()]}
      colors={{ containerColor: c.surfaceContainer, contentColor: c.onSurface }}
    >
      <Row modifiers={[fillMaxWidth(), padding(2, 7, 2, 7)]} horizontalArrangement="spaceBetween" verticalAlignment="center">
        <Row verticalAlignment="center">
          <Box modifiers={[size(4, 24), cornerRadius(2), background(flags[habit.priority] || c.surfaceContainer)]} />
          <Spacer modifiers={[width(10)]} />
          <Text style={{ fontSize: 20 }}>{habit.icon}</Text>
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
    </Button>
  )

  return (
    <Column modifiers={frame}>
      {buildShown.map(row)}
      {avoidShown.length ? (
        <Text color={c.onSurfaceVariant} style={{ fontSize: 12, fontWeight: "600" }} modifiers={[padding(14, 6, 0, 0)]}>A EVITAR</Text>
      ) : null}
      {avoidShown.map(row)}
      {hidden > 0 ? (
        <Button {...{ target: "open:" }} onClick={() => undefined} colors={{ containerColor: c.surfaceContainer, contentColor: c.onSurfaceVariant }}>
          <Text color={c.onSurfaceVariant} style={{ fontSize: 14 }} modifiers={[padding(14, 4, 0, 4)]}>{`+${hidden} más`}</Text>
        </Button>
      ) : null}
    </Column>
  )
}

export default createWidget<WidgetProps>("HabitsToday", HabitsWidget, EMPTY_WIDGET)
