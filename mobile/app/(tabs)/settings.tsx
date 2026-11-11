import { useEffect, useState } from "react"
import { Alert, Switch, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import Constants from "expo-constants"
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
  useEffect(() => void remindersEnabled().then(setReminders), [])

  async function toggleReminders(on: boolean) {
    const result = await setRemindersEnabled(on, habits).catch(() => false)
    setReminders(result)
    if (on && !result) toast("No se pudieron activar", { description: "Permite las notificaciones en los ajustes del sistema.", error: true })
  }
  const { baseUrl, signOut } = useAuth()

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
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Con los horarios de cada hábito</Text>
        </View>
        <Switch value={reminders} onValueChange={toggleReminders} trackColor={{ true: colors.primary, false: colors.muted }} />
      </Card>

      <Card style={{ padding: 0 }}>
        <Row icon="person-outline" label="Cuenta" value={me.email} />
        <Row icon="globe-outline" label="Zona horaria" value={me.timezone} />
        <Row icon="time-outline" label="El día termina a las" value={me.day_cutoff.slice(0, 5)} />
        <Row icon="server-outline" label="Servidor" value={(baseUrl ?? "").replace(/^https?:\/\//, "")} />
        <Row icon="information-circle-outline" label="Versión" value={Constants.expoConfig?.version ?? "–"} last />
      </Card>

      <Text style={{ paddingHorizontal: 4, fontSize: 12, color: colors.mutedForeground }}>Los tokens de acceso (MCP, Home Assistant) se gestionan desde la web del servidor.</Text>

      <Button variant="ghost" label="Cerrar sesión" icon={<Ionicons name="log-out-outline" size={18} color={colors.destructive} />} onPress={confirmSignOut} style={{ borderRadius: 24 }} />
    </Screen>
  )
}

function Row({ icon, label, value, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <Text style={{ flex: 1, fontSize: 14, color: colors.foreground }}>{label}</Text>
      <Text numberOfLines={1} style={{ flexShrink: 1, maxWidth: "55%", fontSize: 14, color: colors.mutedForeground }}>
        {value}
      </Text>
    </View>
  )
}
