import { Ionicons } from "@expo/vector-icons"
import { BlurView } from "expo-blur"
import * as Haptics from "expo-haptics"
import { Tabs } from "expo-router"
import { Platform, StyleSheet, View } from "react-native"
import { Glow } from "@/components/ui"
import { colors, headerOptions } from "@/theme"

type Name = keyof typeof Ionicons.glyphMap

const TABS: { name: string; title: string; icon: Name; focused: Name }[] = [
  { name: "index", title: "Hoy", icon: "calendar-outline", focused: "calendar" },
  { name: "habits", title: "Hábitos", icon: "grid-outline", focused: "grid" },
  { name: "progress", title: "Progreso", icon: "bar-chart-outline", focused: "bar-chart" },
  { name: "settings", title: "Ajustes", icon: "settings-outline", focused: "settings" },
]

export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Glow />
      <Tabs
        screenOptions={{
          ...headerOptions,
          headerStyle: { backgroundColor: "transparent" },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          // Translucent bar over the content (blurred on iOS, solid on Android where blur is costly).
          tabBarStyle: { position: "absolute", backgroundColor: Platform.OS === "ios" ? "transparent" : colors.card, borderTopColor: colors.border, elevation: 0 },
          tabBarBackground: () => (Platform.OS === "ios" ? <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} /> : null),
          tabBarLabelStyle: { fontSize: 11 },
          sceneStyle: { backgroundColor: "transparent" },
        }}
        screenListeners={{ tabPress: () => Haptics.selectionAsync() }}
      >
        {TABS.map(({ name, title, icon, focused }) => (
          <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color, size, focused: on }) => <Ionicons name={on ? focused : icon} size={size} color={color as string} /> }} />
        ))}
      </Tabs>
    </View>
  )
}
