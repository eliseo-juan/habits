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
  // (sized for a 4-cell wide widget) instead of letting it run under the mark circle.
  // 12 steps; any progress shows at least one, and only a finished habit shows a closed ring.
  const ringStep = (fraction: number) => (fraction <= 0 ? 0 : fraction >= 1 ? 12 : Math.min(11, Math.max(1, Math.round(fraction * 12))))
  const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + "…" : text)

  if (!props.signedIn) {
    return (
      <Button modifiers={[fillMaxSize()]} {...{ target: "open:" }} colors={{ containerColor: c.surfaceContainer }} onClick={() => undefined}>
        <Column modifiers={frame} verticalArrangement="center" horizontalAlignment="center">
          <Text color={c.onSurface} style={{ fontSize: 17, fontWeight: "700" }}>Hábitos</Text>
          <Spacer modifiers={[height(4)]} />
          <Text color={c.onSurfaceVariant} style={{ fontSize: 13 }}>Abre la app para sincronizar</Text>
        </Column>
      </Button>
    )
  }

  // The day on screen. Props pushed before the day switcher existed only have today.
  const days = props.days?.length ? props.days : [{ date: props.date, label: "Hoy", habits: props.habits, avoid: props.avoid }]
  const last = days.length - 1
  const selected = Math.min(Math.max(props.selected ?? last, 0), last)
  const day = days[selected]
  const isToday = selected === last
  // A button's onClick runs in the widget runtime and what it returns is merged into the stored props, so the
  // arrows switch days without the app.
  const go = (index: number) => ({ selected: index })

  // A plain list on the widget surface (no card per row), close to the app's Today rows but shorter. Left: emoji and
  // name, and below them a dot in the priority's color, the schedule or progress and the next reminder still to go out
  // today. Right: the mark circle, a progress ring that fills with a check once done. Left and right are stacked
  // boxes, since the runtime has no weight or space-between.
  const row = (habit: (typeof day.habits)[number]) => (
    <Button
      key={habit.id}
      {...{ target: "open:log/" + habit.id + (isToday ? "" : "/" + day.date) }}
      onClick={() => undefined}
      // Glance lays its default ripple over every clickable; the corner radius rounds it, like a Material list item.
      modifiers={[fillMaxWidth(), cornerRadius(16)]}
      colors={{ containerColor: c.surfaceContainer, contentColor: c.onSurface }}
    >
      <Box modifiers={[fillMaxWidth(), padding(4, 2, 4, 2)]}>
        <Box modifiers={[fillMaxWidth(), height(52)]} contentAlignment="centerStart">
          <Column>
            <Row verticalAlignment="center">
              {/* Emoji and priority dot share a column, so the name and the line below start at the same x. It and the row
                  height leave room for a raised system font size (checked at 1.3x with tools/widget-preview). */}
              <Box modifiers={[width(26)]} contentAlignment="center">
                <Text style={{ fontSize: 16 }}>{habit.icon}</Text>
              </Box>
              <Spacer modifiers={[width(6)]} />
              <Text
                color={habit.done ? c.onSurfaceVariant : c.onSurface}
                maxLines={1}
                style={{ fontSize: 15, fontWeight: "700", textDecoration: habit.done ? "lineThrough" : "none" }}
              >
                {cut(habit.name, 24)}
              </Text>
            </Row>
            <Spacer modifiers={[height(3)]} />
            <Row verticalAlignment="center">
              <Box modifiers={[width(26)]} contentAlignment="center">
                {/* Text boxes carry font padding above the glyphs: 2dp on top lowers the dot 1dp onto the text's middle. */}
                {habit.priority ? (
                  <Image source={{ uri: "widget_circle" }} tint={flags[habit.priority]} modifiers={[padding(0, 2, 0, 0), size(8, 10)]} />
                ) : null}
              </Box>
              <Spacer modifiers={[width(6)]} />
              <Text color={c.onSurfaceVariant} maxLines={1} style={{ fontSize: 12 }}>
                {cut(habit.subtitle, habit.reminder ? 24 : 32)}
              </Text>
              {habit.reminder ? (
                <Row verticalAlignment="center">
                  <Spacer modifiers={[width(8)]} />
                  <Image source={{ uri: "widget_bell" }} tint={c.primary} modifiers={[padding(0, 2, 0, 0), size(12, 14)]} />
                  <Spacer modifiers={[width(3)]} />
                  <Text color={c.primary} style={{ fontSize: 12, fontWeight: "700" }}>{habit.reminder}</Text>
                </Row>
              ) : null}
            </Row>
          </Column>
        </Box>
        <Box modifiers={[fillMaxWidth(), height(52)]} contentAlignment="centerEnd">
          {habit.done ? (
            <Box modifiers={[size(30, 30)]} contentAlignment="center">
              <Image source={{ uri: "widget_circle" }} tint={habit.color} modifiers={[size(30, 30)]} />
              <Image source={{ uri: "widget_check" }} tint="#FFFFFF" modifiers={[size(18, 18)]} />
            </Box>
          ) : (
            <Box modifiers={[size(30, 30)]} contentAlignment="center">
              {/* Track and arc are tinted drawables (ring_track, ring_0 … ring_12): Glance's circular progress ignores
                  its size, and an image tint keeps the drawable's alpha, so the faint track carries its own. */}
              <Image source={{ uri: "widget_ring_track" }} tint={habit.color} modifiers={[size(30, 30)]} />
              <Image source={{ uri: "widget_ring_" + ringStep(habit.fraction) }} tint={habit.color} modifiers={[size(30, 30)]} />
            </Box>
          )}
        </Box>
      </Box>
    </Button>
  )

  const arrow = (icon: string, to: number, enabled: boolean) =>
    enabled ? (
      <Button onClick={() => go(to)} modifiers={[size(32, 32), cornerRadius(16)]} colors={{ containerColor: c.surfaceContainer }}>
        <Image source={{ uri: icon }} tint={c.onSurfaceVariant} modifiers={[size(20, 20)]} />
      </Button>
    ) : (
      <Box modifiers={[size(32, 32)]} contentAlignment="center">
        <Image source={{ uri: icon }} tint={c.outlineVariant} modifiers={[size(20, 20)]} />
      </Box>
    )

  // Header: the app's name, and the day switcher. Today reads "Hoy" in the primary color with the forward arrow
  // off; any other day is a tonal chip ("Ayer", "Jue 20") that goes back to today when tapped.
  const header = (
    <Box modifiers={[fillMaxWidth(), height(40), padding(6, 0, 0, 0)]}>
      <Box modifiers={[fillMaxWidth(), height(40)]} contentAlignment="centerStart">
        <Text color={c.onSurface} style={{ fontSize: 16, fontWeight: "700" }}>Hábitos</Text>
      </Box>
      <Box modifiers={[fillMaxWidth(), height(40)]} contentAlignment="centerEnd">
        <Row verticalAlignment="center">
          {arrow("widget_chevron_left", selected - 1, selected > 0)}
          {/* No fixed height: the device's font size decides it, and a fixed one clipped the label. */}
          {isToday ? (
            <Box modifiers={[width(64)]} contentAlignment="center">
              <Text color={c.primary} style={{ fontSize: 14, fontWeight: "700" }}>Hoy</Text>
            </Box>
          ) : (
            <Button onClick={() => go(last)} modifiers={[width(64), cornerRadius(16)]} colors={{ containerColor: c.secondaryContainer }}>
              <Text color={c.onSecondaryContainer} style={{ fontSize: 13, fontWeight: "700" }} modifiers={[padding(0, 5, 0, 5)]}>{day.label}</Text>
            </Button>
          )}
          {arrow("widget_chevron_right", selected + 1, !isToday)}
        </Row>
      </Box>
    </Box>
  )

  return (
    <Column modifiers={frame}>
      {header}
      <Spacer modifiers={[height(4)]} />
      {day.habits.length === 0 && day.avoid.length === 0 ? (
        <Box modifiers={[fillMaxSize()]} contentAlignment="center">
          <Text color={c.onSurfaceVariant} style={{ fontSize: 14 }}>{isToday ? "Nada que hacer hoy" : "Nada que hacer este día"}</Text>
        </Box>
      ) : (
        <LazyColumn modifiers={[fillMaxSize()]}>
          {day.habits.map(row)}
          {day.avoid.length ? (
            <Text color={c.primary} style={{ fontSize: 13, fontWeight: "700" }} modifiers={[padding(6, 10, 0, 4)]}>A evitar</Text>
          ) : null}
          {day.avoid.map(row)}
        </LazyColumn>
      )}
    </Column>
  )
}

export default createWidget<WidgetProps>("HabitsToday", HabitsWidget, EMPTY_WIDGET)
