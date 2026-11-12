import { EMPTY_WIDGET, type WidgetProps } from "@/widgets/types"

// expo-widgets has no JS implementation in Expo Go or on the web, so it is loaded lazily and failures are ignored.
export function pushWidget(props: WidgetProps) {
  try {
    const widget = require("@/widgets/HabitsWidget").default
    widget.updateSnapshot(props)
  } catch (error) {
    // Widgets are unavailable in Expo Go and on the web, but a failure on a real build must not be invisible.
    console.warn("[widget] could not update the snapshot", error)
  }
}

export const clearWidget = () => pushWidget(EMPTY_WIDGET)
