import { EMPTY_WIDGET, type WidgetProps } from "@/widgets/types"

// expo-widgets has no JS implementation in Expo Go or on the web, so it is loaded lazily and failures are ignored.
export function pushWidget(props: WidgetProps) {
  try {
    const widget = require("@/widgets/HabitsWidget").default
    widget.updateSnapshot(props)
  } catch {
    // widgets unavailable on this runtime
  }
}

export const clearWidget = () => pushWidget(EMPTY_WIDGET)
