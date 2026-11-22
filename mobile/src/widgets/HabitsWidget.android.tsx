// Android widget (Jetpack Compose / Glance). Same constraints as the iOS one: pure function, no outer references.
// Colors come from the device's Material You palette (wallpaper-derived on Android 12+, Material 3 baseline below).
import { Box, Button, CircularProgressIndicator, Column, LazyColumn, Row, Spacer, Text, getMaterialColors } from "@expo/ui/jetpack-compose"
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers"
import { createWidget } from "expo-widgets"
import { EMPTY_WIDGET, type WidgetProps } from "./types"

const HabitsWidget = (props: WidgetProps) => {
  "widget"
  const c = getMaterialColors()
  const frame = [fillMaxSize(), padding(10, 10, 10, 4), background(c.surfaceContainer), cornerRadius(28)]
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

  // No weight in the widget runtime, so text cannot be bounded by the ring next to it: cut long text by length
  // (sized for a 4-cell wide widget) instead of letting it run under the ring.
  const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + "…" : text)

  // Like the app's Today rows: icon tile, name over its schedule, progress ring on the right. The widget has no
  // weight/space-between, so the two sides are stacked boxes aligned to the start and to the end of the row.
  const row = (habit: (typeof props.habits)[number]) => (
    <Column key={habit.id} modifiers={[fillMaxWidth()]}>
      <Button
        {...{ target: "open:log/" + habit.id }}
        onClick={() => undefined}
        modifiers={[fillMaxWidth(), cornerRadius(18)]}
        colors={{ containerColor: c.surfaceContainerHigh, contentColor: c.onSurface }}
      >
        <Box modifiers={[fillMaxWidth(), padding(8, 6, 12, 6)]}>
          <Box modifiers={[fillMaxWidth(), height(40)]} contentAlignment="centerStart">
            <Row verticalAlignment="center">
              <Box modifiers={[size(40, 40), cornerRadius(12), background(habit.color + "2E")]} contentAlignment="center">
                <Text style={{ fontSize: 19 }}>{habit.icon}</Text>
              </Box>
              <Spacer modifiers={[width(10)]} />
              <Column>
                <Text
                  color={habit.done ? c.onSurfaceVariant : c.onSurface}
                  maxLines={1}
                  overflow="ellipsis"
                  style={{ fontSize: 16, fontWeight: "600", textDecoration: habit.done ? "lineThrough" : "none" }}
                >
                  {cut(habit.name, 20)}
                </Text>
                <Row verticalAlignment="center">
                  {habit.priority ? <Text color={flags[habit.priority]} style={{ fontSize: 12 }}>{"⚑ "}</Text> : null}
                  <Text color={c.onSurfaceVariant} maxLines={1} overflow="ellipsis" style={{ fontSize: 12 }}>{cut(habit.subtitle, 26)}</Text>
                </Row>
              </Column>
            </Row>
          </Box>
          <Box modifiers={[fillMaxWidth(), height(40)]} contentAlignment="centerEnd">
            <Box modifiers={[size(36, 36)]} contentAlignment="center">
              <CircularProgressIndicator progress={habit.fraction} color={habit.color} trackColor={c.outlineVariant} strokeWidth={3} modifiers={[size(36, 36)]} />
              <Text color={habit.done ? habit.color : c.onSurfaceVariant} style={{ fontSize: habit.done ? 16 : 11, fontWeight: "700" }}>
                {habit.done ? "✓" : habit.progress}
              </Text>
            </Box>
          </Box>
        </Box>
      </Button>
      <Spacer modifiers={[height(4)]} />
    </Column>
  )

  return (
    <Box modifiers={frame}>
      <LazyColumn modifiers={[fillMaxSize()]}>
        {props.habits.map(row)}
        {props.avoid.length ? (
          <Text color={c.onSurfaceVariant} style={{ fontSize: 12, fontWeight: "600" }} modifiers={[padding(8, 6, 0, 6)]}>A EVITAR</Text>
        ) : null}
        {props.avoid.map(row)}
      </LazyColumn>
    </Box>
  )
}

export default createWidget<WidgetProps>("HabitsToday", HabitsWidget, EMPTY_WIDGET)
