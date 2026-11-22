import { useEffect } from "react"
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Pressable, StyleSheet, View } from "react-native"
import { StatusBar } from "expo-status-bar"
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { DaySheet } from "@/components/day-sheet"
import { ToastProvider } from "@/components/toast"
import { AuthProvider, useAuth } from "@/lib/auth"
import { habitsQuery, meQuery, SessionContext, todayQuery } from "@/lib/data"
import { persistOptions, queryClient } from "@/lib/query"
import { colors } from "@/theme"
import { WidgetSync } from "@/widgets/widget-sync"

// What a widget row opens: the habit's day sheet alone, over the home screen. It runs in its own translucent
// Android activity (WidgetSheetActivity, written by plugins/withWidgetOpenApp.js) on the app's JS runtime, with the
// same providers as the app but no navigation. Closing it (saving, tapping outside, back) finishes the activity.
export function WidgetSheetRoot({ habitId }: { habitId?: string }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <AuthProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <Sheet habitId={habitId} />
            </ToastProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const close = () => BackHandler.exitApp()

function Sheet({ habitId }: { habitId?: string }) {
  const { ready, signedIn } = useAuth()
  const me = useQuery({ ...meQuery, enabled: signedIn })
  const today = useQuery({ ...todayQuery, enabled: signedIn })
  const habits = useQuery({ ...habitsQuery, enabled: signedIn })
  const session = signedIn && me.data && today.data && habits.data ? { me: me.data, today: today.data.date, habits: habits.data } : null

  // Signed out, or the habit is gone: nothing to show here, so leave (the widget then reads "open the app").
  const missing = (ready && !signedIn) || (session && !session.habits.some((h) => String(h.id) === habitId))
  useEffect(() => {
    if (missing || !habitId) close()
  }, [missing, habitId])

  return (
    <View style={{ flex: 1 }}>
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Cerrar" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.bottom} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(220)} style={styles.sheet}>
          {session && habitId ? (
            <SessionContext value={session}>
              {/* Marking a habit here must refresh the widget too, as the app does while it is open. */}
              <WidgetSync />
              <DaySheet habitId={habitId} onClose={close} />
            </SessionContext>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.mutedForeground} />
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: "hidden", backgroundColor: colors.popover },
  loading: { height: 220, alignItems: "center", justifyContent: "center" },
})
