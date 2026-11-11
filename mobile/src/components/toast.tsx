import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { Pressable, StyleSheet, Text } from "react-native"
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { colors, radius } from "@/theme"

type Options = { description?: string; error?: boolean; action?: { label: string; onClick: () => void } }
type Item = Options & { id: number; message: string }

const ToastContext = createContext<{ toast: (message: string, options?: Options) => void } | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<Item | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const insets = useSafeAreaInsets()

  const toast = useCallback((message: string, options: Options = {}) => {
    clearTimeout(timer.current)
    setItem({ id: Date.now(), message, ...options })
    timer.current = setTimeout(() => setItem(null), options.action ? 5000 : 3000)
  }, [])
  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext value={value}>
      {children}
      {item && (
        <Animated.View key={item.id} entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(150)} style={[styles.host, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={() => setItem(null)} style={[styles.pill, item.error && styles.error]}>
            <Text style={styles.message} numberOfLines={2}>
              {item.message}
            </Text>
            {item.description && <Text style={styles.description}>{item.description}</Text>}
            {item.action && (
              <Pressable
                hitSlop={10}
                onPress={() => {
                  item.action?.onClick()
                  setItem(null)
                }}
              >
                <Text style={styles.action}>{item.action.label}</Text>
              </Pressable>
            )}
          </Pressable>
        </Animated.View>
      )}
    </ToastContext>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast outside ToastProvider")
  return context
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 100 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    maxWidth: 420,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.popover,
    borderWidth: 1,
    borderColor: colors.white15,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  error: { borderColor: colors.roseRing },
  message: { color: colors.foreground, fontSize: 14, fontWeight: "500", flexShrink: 1 },
  description: { color: colors.mutedForeground, fontSize: 12, width: "100%" },
  action: { color: colors.primary, fontSize: 14, fontWeight: "600" },
})
