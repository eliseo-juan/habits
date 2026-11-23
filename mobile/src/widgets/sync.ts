import { EMPTY_WIDGET, type WidgetProps } from "@/widgets/types"

// What happened the last time we tried to hand data to the widget, shown in Settings → Versión so a widget that
// stays on "Abre la app para sincronizar" can be diagnosed on the device without adb.
export type WidgetStatus = { at: number; ok: boolean; error?: string; done?: number; total?: number; reminders?: number }
let lastStatus: WidgetStatus | null = null
let lastProps: WidgetProps | null = null
export const widgetStatus = () => lastStatus

// expo-widgets has no JS implementation in Expo Go or on the web, so it is loaded lazily and failures are ignored.
export function pushWidget(props: WidgetProps) {
  lastProps = props
  try {
    const widget = require("@/widgets/HabitsWidget").default
    widget.updateSnapshot(props)
    lastStatus = { at: Date.now(), ok: true, done: props.done, total: props.total, reminders: props.habits.filter((h) => h.reminder).length }
  } catch (error) {
    // Widgets are unavailable in Expo Go and on the web, but a failure on a real build must not be invisible.
    lastStatus = { at: Date.now(), ok: false, error: error instanceof Error ? error.message : String(error) }
    console.warn("[widget] could not update the snapshot", error)
  }
  return lastStatus
}

export const resendWidget = () => pushWidget(lastProps ?? EMPTY_WIDGET)

export const clearWidget = () => pushWidget(EMPTY_WIDGET)
