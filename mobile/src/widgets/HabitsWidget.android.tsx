// Android widget (Jetpack Compose). Same constraints as the iOS one: pure function, no outer references.
import { Column, LinearProgressIndicator, Row, Spacer, Text } from "@expo/ui/jetpack-compose"
import { background, cornerRadius, fillMaxWidth, height, paddingAll, weight } from "@expo/ui/jetpack-compose/modifiers"
import { createWidget } from "expo-widgets"
import type { WidgetProps } from "./types"

const HabitsWidget = (props: WidgetProps) => {
  "widget"
  const bg = "#1b1e25"
  const primary = "#4ddba5"
  const muted = "#b6bac4"
  const fraction = props.total ? props.done / props.total : 0

  if (!props.signedIn) {
    return (
      <Column modifiers={[fillMaxWidth(), paddingAll(14), background(bg), cornerRadius(24)]}>
        <Text color="#fafafa" style={{ fontSize: 16, fontWeight: "600" }}>Hábitos</Text>
        <Text color={muted} style={{ fontSize: 12 }}>Abre la app para iniciar sesión</Text>
      </Column>
    )
  }

  const pending = props.habits.filter((h) => !h.done)
  const shown = (pending.length ? pending : props.habits).slice(0, 4)

  return (
    <Column modifiers={[fillMaxWidth(), paddingAll(14), background(bg), cornerRadius(24)]}>
      <Row>
        <Column>
          <Text color={muted} style={{ fontSize: 12 }}>Hoy</Text>
          <Text color="#fafafa" style={{ fontSize: 24, fontWeight: "700" }}>{props.done} / {props.total}</Text>
        </Column>
        <Spacer modifiers={[weight(1)]} />
        {props.total > 0 && props.done === props.total ? <Text style={{ fontSize: 24 }}>✨</Text> : null}
      </Row>
      <LinearProgressIndicator progress={fraction} color={primary} modifiers={[fillMaxWidth(), height(6)]} />
      <Spacer modifiers={[height(8)]} />
      {shown.map((habit) => (
        <Row key={habit.id} modifiers={[fillMaxWidth(), paddingAll(2)]}>
          <Text style={{ fontSize: 14 }}>{habit.icon}  </Text>
          <Text color={habit.done ? muted : "#fafafa"} maxLines={1} overflow="ellipsis" style={{ fontSize: 14 }} modifiers={[weight(1)]}>{habit.name}</Text>
          <Text color={habit.done ? primary : muted} style={{ fontSize: 12 }}>{habit.done ? "✓" : (habit.progress ?? "○")}</Text>
        </Row>
      ))}
    </Column>
  )
}

export default createWidget<WidgetProps>("HabitsToday", HabitsWidget, { signedIn: false, date: "", done: 0, total: 0, habits: [] })
