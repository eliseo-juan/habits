import { useState } from "react"
import { Text } from "react-native"
import * as Updates from "expo-updates"
import { useToast } from "@/components/toast"
import { Card, Row, Screen, SectionTitle } from "@/components/ui"
import { appVersion, buildNumber, dateTime, shortHash } from "@/lib/version"
import { colors } from "@/theme"

const CHECK_LABELS: Record<Updates.UpdatesCheckAutomaticallyValue, string> = {
  [Updates.UpdatesCheckAutomaticallyValue.ON_LOAD]: "Al abrir la app",
  [Updates.UpdatesCheckAutomaticallyValue.WIFI_ONLY]: "Al abrir la app con Wi-Fi",
  [Updates.UpdatesCheckAutomaticallyValue.ON_ERROR_RECOVERY]: "Solo tras un error",
  [Updates.UpdatesCheckAutomaticallyValue.NEVER]: "Nunca",
}

export default function VersionScreen() {
  const { toast } = useToast()
  const { currentlyRunning, isUpdatePending, lastCheckForUpdateTimeSinceRestart } = Updates.useUpdates()
  const [checking, setChecking] = useState(false)

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

  return (
    <Screen>
      <SectionTitle>App</SectionTitle>
      <Card style={{ padding: 0 }}>
        <Row icon="information-circle-outline" label="Versión" value={appVersion} />
        <Row icon="construct-outline" label="Build" value={buildNumber ?? "–"} />
        <Row icon="git-branch-outline" label="Canal" value={currentlyRunning.channel ?? "–"} />
        <Row icon="finger-print-outline" label="Runtime" value={shortHash(currentlyRunning.runtimeVersion)} last />
      </Card>

      {Updates.isEnabled ? (
        <>
          <SectionTitle>Código en uso</SectionTitle>
          <Card style={{ padding: 0 }}>
            <Row icon="cube-outline" label="Origen" value={currentlyRunning.isEmbeddedLaunch ? "Incluido en el APK" : "Actualización OTA"} />
            <Row icon="pricetag-outline" label="Update" value={shortHash(currentlyRunning.updateId)} />
            <Row icon="calendar-outline" label="Publicado" value={dateTime(currentlyRunning.createdAt)} last />
          </Card>
          {currentlyRunning.isEmergencyLaunch && (
            <Card>
              <Text style={{ fontSize: 13, color: colors.orange }}>
                Arranque de emergencia: se cargó el código del APK porque falló una actualización. {currentlyRunning.emergencyLaunchReason ?? ""}
              </Text>
            </Card>
          )}

          <SectionTitle>Actualizaciones</SectionTitle>
          <Card style={{ padding: 0 }}>
            <Row icon="sync-outline" label="Comprobación automática" value={Updates.checkAutomatically ? CHECK_LABELS[Updates.checkAutomatically] : "–"} />
            <Row icon="time-outline" label="Última comprobación" value={dateTime(lastCheckForUpdateTimeSinceRestart)} />
            {isUpdatePending ? (
              <Row icon="refresh-outline" label="Reiniciar para aplicar la actualización" value="" onPress={() => void Updates.reloadAsync()} last />
            ) : (
              <Row icon="cloud-download-outline" label={checking ? "Comprobando…" : "Buscar actualizaciones"} value="" onPress={checking ? undefined : checkForUpdates} last />
            )}
          </Card>
        </>
      ) : (
        <Card>
          <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Las actualizaciones OTA están desactivadas en esta build.</Text>
        </Card>
      )}
    </Screen>
  )
}
