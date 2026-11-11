import { Ionicons } from "@expo/vector-icons"
import { Tabs } from "expo-router"
import { colors } from "@/theme"

type Name = keyof typeof Ionicons.glyphMap

const TABS: { name: string; title: string; icon: Name; focused: Name }[] = [
  { name: "index", title: "Hoy", icon: "calendar-outline", focused: "calendar" },
  { name: "habits", title: "Hábitos", icon: "grid-outline", focused: "grid" },
  { name: "progress", title: "Progreso", icon: "bar-chart-outline", focused: "bar-chart" },
  { name: "settings", title: "Ajustes", icon: "settings-outline", focused: "settings" },
]

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map(({ name, title, icon, focused }) => (
        <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color, size, focused: on }) => <Ionicons name={on ? focused : icon} size={size} color={color as string} /> }} />
      ))}
    </Tabs>
  )
}
