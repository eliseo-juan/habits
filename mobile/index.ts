// App entry: expo-router's app ("main"), plus the widget's day sheet ("WidgetSheet"), which the widget opens in its
// own translucent activity (see src/widget-sheet/root.tsx).
import "expo-router/entry"
import { AppRegistry } from "react-native"
import { WidgetSheetRoot } from "@/widget-sheet/root"

AppRegistry.registerComponent("WidgetSheet", () => WidgetSheetRoot)
