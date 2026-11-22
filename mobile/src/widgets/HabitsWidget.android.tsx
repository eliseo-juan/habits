// Android widget (Jetpack Compose / Glance). Same constraints as the iOS one: pure function, no outer references.
// Colors come from the device's Material You palette (wallpaper-derived on Android 12+, Material 3 baseline below).
import { Box, Button, Column, Image, LazyColumn, Row, Spacer, Text, getMaterialColors } from "@expo/ui/jetpack-compose"
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, size, width } from "@expo/ui/jetpack-compose/modifiers"
import { createWidget } from "expo-widgets"
import { EMPTY_WIDGET, type WidgetProps } from "./types"

const HabitsWidget = (props: WidgetProps) => {
  "widget"
  const c = getMaterialColors()
  const frame = [fillMaxSize(), padding(12, 12, 12, 4), background(c.surfaceContainer), cornerRadius(28)]
  // Same colors as the app's priority flags (none, low, medium, high).
  const flags = ["", "#3b82f6", "#eab308", "#ef4444"]
  // No weight in the widget runtime, so text cannot be bounded by what sits next to it: cut long text by length
  // (sized for a 4-cell wide widget) instead of letting it run under the reminder chip.
  // 12 steps; any progress shows at least one, and only a finished habit shows a closed ring.
  const ringStep = (fraction: number) => (fraction <= 0 ? 0 : fraction >= 1 ? 12 : Math.min(11, Math.max(1, Math.round(fraction * 12))))
  const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + "…" : text)

  if (!props.signedIn || (props.habits.length === 0 && props.avoid.length === 0)) {
    return (
      <Button modifiers={[fillMaxSize()]} {...{ target: "open:" }} colors={{ containerColor: c.surfaceContainer }} onClick={() => undefined}>
        <Column modifiers={frame} verticalArrangement="center" horizontalAlignment="center">
          <Text color={c.onSurface} style={{ fontSize: 17, fontWeight: "700" }}>{props.signedIn ? "Nada que hacer hoy" : "Hábitos"}</Text>
          <Spacer modifiers={[height(4)]} />
          <Text color={c.onSurfaceVariant} style={{ fontSize: 13 }}>{props.signedIn ? "Toca para abrir la app" : "Abre la app para sincronizar"}</Text>
        </Column>
      </Button>
    )
  }

  // A plain list on the widget surface (no card per row). Left: the habit's icon in a tinted circle with its progress
  // ring around it, filled with a check once done. Middle: name and a quiet second line. Right: the next reminder
  // still to go out today, as a chip. Left and right are stacked boxes, since the runtime has no space-between.
  const row = (habit: (typeof props.habits)[number]) => (
    <Button
      key={habit.id}
      {...{ target: "open:log/" + habit.id }}
      onClick={() => undefined}
      modifiers={[fillMaxWidth(), cornerRadius(16)]}
      colors={{ containerColor: c.surfaceContainer, contentColor: c.onSurface }}
    >
      <Box modifiers={[fillMaxWidth(), padding(4, 6, 4, 6)]}>
        <Box modifiers={[fillMaxWidth(), height(44)]} contentAlignment="centerStart">
          <Row verticalAlignment="center">
            {habit.done ? (
              <Box modifiers={[size(44, 44)]} contentAlignment="center">
                <Image source={{ uri: "widget_circle" }} tint={habit.color} modifiers={[size(44, 44)]} />
                <Image source={{ uri: "widget_check" }} tint="#FFFFFF" modifiers={[size(24, 24)]} />
              </Box>
            ) : (
              <Box modifiers={[size(44, 44)]} contentAlignment="center">
                {/* Track and arc are tinted drawables (ring_track, ring_0 … ring_12): Glance's circular progress ignores its
                    size, and an image tint keeps the drawable's alpha, so the faint track carries its own. */}
                <Image source={{ uri: "widget_ring_track" }} tint={habit.color} modifiers={[size(44, 44)]} />
                <Image source={{ uri: "widget_ring_" + ringStep(habit.fraction) }} tint={habit.color} modifiers={[size(44, 44)]} />
                <Image source={{ uri: "widget_circle_soft" }} tint={habit.color} modifiers={[size(36, 36)]} />
                <Text style={{ fontSize: 17 }}>{habit.icon}</Text>
              </Box>
            )}
            <Spacer modifiers={[width(12)]} />
            <Column>
              <Text
                color={habit.done ? c.onSurfaceVariant : c.onSurface}
                maxLines={1}
                style={{ fontSize: 15, fontWeight: "700", textDecoration: habit.done ? "lineThrough" : "none" }}
              >
                {cut(habit.name, habit.reminder ? 18 : 26)}
              </Text>
              <Spacer modifiers={[height(2)]} />
              <Row verticalAlignment="center">
                {habit.priority ? (
                  <Row verticalAlignment="center">
                    <Image source={{ uri: "widget_flag" }} tint={flags[habit.priority]} modifiers={[size(13, 13)]} />
                    <Spacer modifiers={[width(4)]} />
                  </Row>
                ) : null}
                <Text color={c.onSurfaceVariant} maxLines={1} style={{ fontSize: 12 }}>
                  {cut(habit.subtitle, habit.reminder ? 22 : 30)}
                </Text>
              </Row>
            </Column>
          </Row>
        </Box>
        {habit.reminder ? (
          <Box modifiers={[fillMaxWidth(), height(44)]} contentAlignment="centerEnd">
            <Row modifiers={[background(c.secondaryContainer), cornerRadius(12), padding(8, 4, 10, 4)]} verticalAlignment="center">
              <Image source={{ uri: "widget_bell" }} tint={c.onSecondaryContainer} modifiers={[size(14, 14)]} />
              <Spacer modifiers={[width(4)]} />
              <Text color={c.onSecondaryContainer} style={{ fontSize: 12, fontWeight: "700" }}>{habit.reminder}</Text>
            </Row>
          </Box>
        ) : null}
      </Box>
    </Button>
  )

  return (
    <Box modifiers={frame}>
      <LazyColumn modifiers={[fillMaxSize()]}>
        {props.habits.map(row)}
        {props.avoid.length ? (
          <Text color={c.primary} style={{ fontSize: 13, fontWeight: "700" }} modifiers={[padding(6, 10, 0, 4)]}>A evitar</Text>
        ) : null}
        {props.avoid.map(row)}
      </LazyColumn>
    </Box>
  )
}

export default createWidget<WidgetProps>("HabitsToday", HabitsWidget, EMPTY_WIDGET)
