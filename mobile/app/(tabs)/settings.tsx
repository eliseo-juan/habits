import { useEffect, useState } from "react"
import { Alert, Pressable, Switch, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import Constants from "expo-constants"
import { router } from "expo-router"
import * as Updates from "expo-updates"
import { Button, Card, Screen } from "@/components/ui"
import { useAuth } from "@/lib/auth"
import { useToast } from "@/components/toast"
import { useSession } from "@/lib/data"
import { remindersEnabled, setRemindersEnabled } from "@/lib/reminders"
import { colors } from "@/theme"

export default function SettingsScreen() {
  const { me, habits } = useSession()
  const { toast } = useToast()
  const [reminders, setReminders] = useState(false)
  const [checking, setChecking] = useState(false)
  useEffect(() => void remindersEnabled().then(setReminders), [])

  async function toggleReminders(on: boolean) {
    const result = await setRemindersEnabled(on, habits).catch(() => false)
    setReminders(result)
    if (on && !result) toast("No se pudieron activar", { description: "Permite las notificaciones en los ajustes del sistema.", error: true })
  }
  const { baseUrl, signOut } = useAuth()

  // OTA: downloads a pending update and restarts into it. Disabled in dev builds and Expo Go.
  async function checkForUpdates() {
    setChecking(true)
    try {
      const { isAvailable } = await Updates.checkForUpdateAsync()
      if (!isAvailable) return toast("Estás al día")
      await Updates.fetchUpdateAsync()
      await Updates.reloadAsync()
    } catch {
      toast("No se pudo comprobar", { description: "Inténtalo de nuevo más tarde.", error: true })
    } finally {
      setChecking(false)
    }
  }

  const confirmSignOut = () =>
    Alert.alert("¿Cerrar sesión?", "Se revocará el acceso de este dispositivo.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: () => void signOut() },
    ])

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(77,219,165,0.15)" }}>
          <Ionicons name="notifications" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground }}>Recordatorios en este móvil</Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Las horas se configuran en cada hábito</Text>
        </View>
        <Switch value={reminders} onValueChange={toggleReminders} trackColor={{ true: colors.primary, false: colors.muted }} />
      </Card>

      <Card style={{ padding: 0 }}>
        <Row icon="person-outline" label="Cuenta" value={me.email} />
        <Row icon="globe-outline" label="Zona horaria" value={me.timezone} />
        <Row icon="time-outline" label="El día termina a las" value={me.day_cutoff.slice(0, 5)} />
        <Row icon="server-outline" label="Servidor" value={(baseUrl ?? "").replace(/^https?:\/\//, "")} />
        <Row icon="information-circle-outline" label="Versión" value={`${Constants.expoConfig?.version ?? "–"}${Updates.updateId ? ` · ${Updates.updateId.slice(0, 6)}` : ""}`} last={!Updates.isEnabled} />
        {Updates.isEnabled && <Row icon="cloud-download-outline" label={checking ? "Comprobando…" : "Buscar actualizaciones"} value="" onPress={checkForUpdates} last />}
      </Card>

      <Card style={{ padding: 0 }}>
        <Row icon="key-outline" label="Tokens de acceso" value="MCP, Home Assistant" onPress={() => router.push("/tokens")} last />
      </Card>

      <Button variant="ghost" label="Cerrar sesión" icon={<Ionicons name="log-out-outline" size={18} color={colors.destructive} />} onPress={confirmSignOut} style={{ borderRadius: 24 }} />
    </Screen>
  )
}

function Row({ icon, label, value, last, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <Text style={{ flex: 1, fontSize: 14, color: colors.foreground }}>{label}</Text>
      <Text numberOfLines={1} style={{ flexShrink: 1, maxWidth: "55%", fontSize: 14, color: colors.mutedForeground }}>
        {value}
      </Text>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />}
    </Pressable>
  )
}
