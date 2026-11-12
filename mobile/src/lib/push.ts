import { Platform } from "react-native"
import * as Notifications from "expo-notifications"
import { api } from "@/lib/api"
import { storage } from "@/lib/storage"

const FLAG = "habits.push"
const TOKEN = "habits.pushToken"

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
})

export const pushEnabled = async () => (await storage.get(FLAG)) === "1"

// The server owns the reminders and sends them as native pushes (FCM / APNs through Expo's push service), skipping
// habits already done. This only gives the server a token for this phone.
async function currentToken(): Promise<string | null> {
  if (Platform.OS === "web") return null
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", { name: "Recordatorios", importance: Notifications.AndroidImportance.HIGH })
  }
  const current = await Notifications.getPermissionsAsync()
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted
  if (!granted) return null
  return (await Notifications.getExpoPushTokenAsync()).data
}

export async function enablePush(): Promise<boolean> {
  const token = await currentToken()
  if (!token) return false
  await api("/push-devices", { method: "PUT", body: { token } })
  await storage.set(TOKEN, token)
  await storage.set(FLAG, "1")
  return true
}

export async function disablePush() {
  const token = await storage.get(TOKEN)
  await storage.set(FLAG, "0")
  if (token) await api("/push-devices/unregister", { method: "POST", body: { token } }).catch(() => {})
}

// Tokens can rotate, so refresh the registration on each launch while pushes are on.
export async function refreshPush() {
  if (await pushEnabled()) await enablePush().catch(() => {})
}
