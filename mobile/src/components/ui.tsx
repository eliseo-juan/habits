import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type PressableProps, type ScrollViewProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { colors, radius } from "@/theme"

export function Screen({ children, refreshable, contentStyle, ...props }: ScrollViewProps & { refreshable?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const client = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    await client.invalidateQueries().catch(() => {})
    setRefreshing(false)
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[{ paddingTop: 12, paddingBottom: 110, paddingHorizontal: 16, gap: 20 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshable ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} /> : undefined}
      {...props}
    >
      {children}
    </ScrollView>
  )
}

// The PWA's soft primary glow behind the top of the screen; parents must leave their background transparent.
export function Glow() {
  return <LinearGradient pointerEvents="none" colors={["rgba(77,219,165,0.18)", "rgba(77,219,165,0.05)", "transparent"]} style={styles.glow} />
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Chip({ children, tone }: { children: React.ReactNode; tone?: "orange" }) {
  return (
    <View style={[styles.chip, tone === "orange" && { backgroundColor: colors.orangeBg, borderColor: colors.orangeRing }]}>
      {typeof children === "string" ? <Text style={[styles.chipText, tone === "orange" && { color: colors.orange }]}>{children}</Text> : children}
    </View>
  )
}

export const chipTextStyle = (tone?: "orange"): StyleProp<TextStyle> => [styles.chipText, tone === "orange" && { color: colors.orange }]

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label?: string
  icon?: React.ReactNode
  variant?: "primary" | "secondary" | "ghost" | "destructive"
  size?: "md" | "lg"
  busy?: boolean
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

export function Button({ label, icon, variant = "primary", size = "md", busy, disabled, style, children, ...props }: ButtonProps) {
  const fg = variant === "primary" ? colors.primaryForeground : variant === "destructive" ? colors.destructive : variant === "ghost" ? colors.mutedForeground : colors.foreground
  return (
    <Pressable
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        size === "lg" && styles.buttonLg,
        variant === "primary" && { backgroundColor: colors.primary },
        variant === "secondary" && { backgroundColor: colors.white10 },
        variant === "destructive" && { backgroundColor: "rgba(248,113,113,0.12)" },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
        style,
      ]}
      {...props}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon}
      {label ? <Text style={[styles.buttonText, size === "lg" && { fontSize: 16 }, { color: fg }]}>{label}</Text> : null}
      {children}
    </Pressable>
  )
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )
}

type FabProps = Omit<PressableProps, "children" | "style"> & {
  icon: keyof typeof Ionicons.glyphMap
  label?: string
  busy?: boolean
  style?: StyleProp<ViewStyle>
}

export function Fab({ icon, label, busy, disabled, style, ...props }: FabProps) {
  return (
    <Pressable
      disabled={disabled || busy}
      style={({ pressed }) => [styles.fab, label ? styles.fabExtended : null, (disabled || busy) && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.95 }] }, style]}
      {...props}
    >
      {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Ionicons name={icon} size={label ? 22 : 32} color={colors.primaryForeground} />}
      {label ? <Text style={styles.fabLabel}>{label}</Text> : null}
    </Pressable>
  )
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 288 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: colors.white10, borderWidth: 1, borderColor: colors.white10 },
  chipText: { fontSize: 11, color: colors.mutedForeground },
  sectionTitle: { paddingHorizontal: 4, fontSize: 12, fontWeight: "500", letterSpacing: 1, color: colors.mutedForeground, textTransform: "uppercase" },
  button: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderRadius: radius.md },
  buttonLg: { minHeight: 56, borderRadius: radius.md },
  buttonText: { fontSize: 14, fontWeight: "600" },
  fab: {
    position: "absolute",
    right: 20,
    minWidth: 56,
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabExtended: { paddingHorizontal: 24 },
  fabLabel: { fontSize: 16, fontWeight: "600", color: colors.primaryForeground },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 },
})
