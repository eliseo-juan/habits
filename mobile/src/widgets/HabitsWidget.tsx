// iOS widget (SwiftUI). Runs in an isolated runtime: no hooks, no imports of app code, everything it
// needs is declared inside the component or comes through props. See https://docs.expo.dev/versions/latest/sdk/widgets/
import { HStack, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui"
import { containerBackground, font, foregroundStyle, lineLimit, padding, widgetURL } from "@expo/ui/swift-ui/modifiers"
import { createWidget, type WidgetEnvironment } from "expo-widgets"
import type { WidgetProps } from "./types"

const HabitsWidget = (props: WidgetProps, environment: WidgetEnvironment) => {
  "widget"
  const bg = "#0b0d12"
  const primary = "#4ddba5"
  const muted = "#b6bac4"
  const family = environment.widgetFamily
  const fraction = props.total ? props.done / props.total : 0
  const left = props.total - props.done
  const link = widgetURL("habits://")

  if (!props.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 12 }), containerBackground(bg, "widget"), link]}>
        <Text modifiers={[font({ weight: "semibold", size: 16 }), foregroundStyle("#fafafa")]}>Hábitos</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Abre la app para iniciar sesión</Text>
      </VStack>
    )
  }

  if (family === "accessoryInline") {
    return <Text>{props.done}/{props.total} hábitos hoy</Text>
  }
  if (family === "accessoryCircular") {
    return (
      <VStack modifiers={[containerBackground(bg, "widget"), link]}>
        <Text modifiers={[font({ weight: "bold", size: 18 })]}>{props.done}/{props.total}</Text>
        <Text modifiers={[font({ size: 9 })]}>hoy</Text>
      </VStack>
    )
  }
  if (family === "accessoryRectangular") {
    return (
      <VStack modifiers={[containerBackground(bg, "widget"), link]}>
        <Text modifiers={[font({ weight: "semibold", size: 13 })]}>Hábitos · {props.done}/{props.total}</Text>
        <ProgressView value={fraction} />
        <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>{props.habits.find((h) => !h.done)?.name ?? "Todo hecho ✨"}</Text>
      </VStack>
    )
  }

  const max = family === "systemSmall" ? 3 : family === "systemMedium" ? 3 : 7
  const pending = props.habits.filter((h) => !h.done)
  const shown = (pending.length ? pending : props.habits).slice(0, max)

  return (
    <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 14 }), containerBackground(bg, "widget"), link]}>
      <HStack>
        <VStack alignment="leading" spacing={0}>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Hoy</Text>
          <Text modifiers={[font({ weight: "bold", size: 24 }), foregroundStyle("#fafafa")]}>
            {props.done}
            <Text modifiers={[foregroundStyle(muted)]}> / {props.total}</Text>
          </Text>
        </VStack>
        <Spacer />
        {left === 0 && props.total > 0 ? <Text modifiers={[font({ size: 24 })]}>✨</Text> : null}
      </HStack>
      <ProgressView value={fraction} modifiers={[foregroundStyle(primary)]} />
      <VStack alignment="leading" spacing={6}>
        {shown.map((habit) => (
          <HStack key={habit.id} spacing={8}>
            <Text modifiers={[font({ size: 14 })]}>{habit.icon}</Text>
            <Text modifiers={[font({ size: 14 }), foregroundStyle(habit.done ? muted : "#fafafa"), lineLimit(1)]}>{habit.name}</Text>
            <Spacer />
            <Text modifiers={[font({ size: 12 }), foregroundStyle(habit.done ? primary : muted)]}>{habit.done ? "✓" : (habit.progress ?? "○")}</Text>
          </HStack>
        ))}
      </VStack>
      <Spacer />
    </VStack>
  )
}

export default createWidget<WidgetProps>("HabitsToday", HabitsWidget, { signedIn: false, date: "", done: 0, total: 0, habits: [] })
