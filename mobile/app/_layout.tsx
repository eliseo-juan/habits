import { useEffect } from "react"
import { Text, View } from "react-native"
import { Stack } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { useQuery } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { ToastProvider } from "@/components/toast"
import { Button, Loading } from "@/components/ui"
import { HttpError } from "@/lib/api"
import { AuthProvider, useAuth } from "@/lib/auth"
import { habitsQuery, meQuery, SessionContext, todayQuery } from "@/lib/data"
import { persistOptions, queryClient } from "@/lib/query"
import { RemindersSync } from "@/components/reminders-sync"
import { WidgetSync } from "@/widgets/widget-sync"
import "@/widgets/background"
import { colors, headerOptions } from "@/theme"

SplashScreen.preventAutoHideAsync()

function Gate() {
  const { ready, signedIn, signOut } = useAuth()
  const me = useQuery({ ...meQuery, enabled: signedIn })
  const today = useQuery({ ...todayQuery, enabled: signedIn })
  const habits = useQuery({ ...habitsQuery, enabled: signedIn })

  useEffect(() => {
    if (ready) SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  const loading = signedIn && (!me.data || !today.data || !habits.data)
  const error = signedIn ? (me.error ?? today.error ?? habits.error) : null
  if (error && loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24, backgroundColor: colors.background }}>
        <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>No se pudo cargar: {error.message}</Text>
        <Button variant="secondary" label="Reintentar" onPress={() => [me, today, habits].forEach((q) => q.refetch())} />
        {!(error instanceof HttpError) || error.status === 0 ? <Button variant="ghost" label="Cerrar sesión" onPress={() => void signOut()} /> : null}
      </View>
    )
  }
  if (loading) return <Loading />

  const session = signedIn && me.data && today.data && habits.data ? { me: me.data, today: today.data.date, habits: habits.data } : null

  return (
    <SessionContext value={session}>
      {session && (
        <>
          <WidgetSync />
          <RemindersSync />
        </>
      )}
      <Stack screenOptions={{ ...headerOptions, headerShown: false, headerBackButtonDisplayMode: "minimal", contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="habit/[id]" options={{ headerShown: true, title: "" }} />
          <Stack.Screen name="habit-form" options={{ headerShown: true, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
          <Stack.Screen
            name="log/[habitId]"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: "fitToContents",
              sheetGrabberVisible: true,
              sheetCornerRadius: 32,
              contentStyle: { backgroundColor: colors.popover },
            }}
          />
        </Stack.Protected>
      </Stack>
    </SessionContext>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <AuthProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <Gate />
            </ToastProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
