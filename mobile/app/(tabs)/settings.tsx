import { useEffect, useState } from "react"
import { Alert, Switch, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { router } from "expo-router"
import { Button, Card, Row, Screen } from "@/components/ui"
import { useAuth } from "@/lib/auth"
import { useToast } from "@/components/toast"
import { useSession } from "@/lib/data"
import { disablePush, enablePush, pushEnabled } from "@/lib/push"
import { appVersionLabel } from "@/lib/version"
import { colors } from "@/theme"

export default function SettingsScreen() {
  const { me } = useSession()
  const { toast } = useToast()
  const [push, setPush] = useState(false)
  useEffect(() => void pushEnabled().then(setPush), [])

  async function togglePush(on: boolean) {
    if (!on) {
      await disablePush()
      return setPush(false)
    }
    const ok = await enablePush().catch(() => false)
    setPush(ok)
    if (!ok) toast("No se pudieron activar", { description: "Permite las notificaciones en los ajustes del sistema y comprueba la conexión.", error: true })
  }
  const { baseUrl, signOut } = useAuth()

  const signOutAndForget = async () => {
    await disablePush()
    await signOut()
  }

  const confirmSignOut = () =>
    Alert.alert("¿Cerrar sesión?", "Se revocará el acceso de este dispositivo.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: () => void signOutAndForget() },
    ])

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(77,219,165,0.15)" }}>
          <Ionicons name="notifications" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground }}>Notificaciones</Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Recordatorios del servidor; las horas se configuran en cada hábito</Text>
        </View>
        <Switch value={push} onValueChange={togglePush} trackColor={{ true: colors.primary, false: colors.muted }} />
      </Card>

      <Card style={{ padding: 0 }}>
        <Row icon="person-outline" label="Cuenta" value={me.email} />
        <Row icon="globe-outline" label="Zona horaria" value={me.timezone} />
        <Row icon="time-outline" label="El día termina a las" value={me.day_cutoff.slice(0, 5)} />
        <Row icon="server-outline" label="Servidor" value={(baseUrl ?? "").replace(/^https?:\/\//, "")} />
        <Row icon="information-circle-outline" label="Versión" value={appVersionLabel()} onPress={() => router.push("/version")} last />
      </Card>

      <Card style={{ padding: 0 }}>
        <Row icon="key-outline" label="Tokens de acceso" value="MCP, Home Assistant" onPress={() => router.push("/tokens")} last />
      </Card>

      <Button variant="ghost" label="Cerrar sesión" icon={<Ionicons name="log-out-outline" size={18} color={colors.destructive} />} onPress={confirmSignOut} style={{ borderRadius: 24 }} />
    </Screen>
  )
}
