import { Platform } from "react-native"
import * as Notifications from "expo-notifications"
import * as TaskManager from "expo-task-manager"
import { api } from "@/lib/api"
import { storage } from "@/lib/storage"

const FLAG = "habits.push"
const TOKEN = "habits.pushToken"

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
})

const CATEGORY = "habit-reminder"
const ACTION_TASK = "habits-notification-action"

// Android runs this when the "Hecho" button is tapped, even with the app closed. It needs no login: the signed,
// single-use link in the push is the credential, so a leaked notification never exposes a token.
TaskManager.defineTask<Notifications.NotificationTaskPayload>(ACTION_TASK, async ({ data }) => {
  if (!("actionIdentifier" in data) || data.actionIdentifier !== "done") return
  const doneUrl = data.notification.request.content.data?.doneUrl
  if (typeof doneUrl === "string") await fetch(doneUrl, { method: "POST" }).catch(() => {})
})
if (Platform.OS === "android") void Notifications.registerTaskAsync(ACTION_TASK).catch(() => {})

const registerCategory = () =>
  Notifications.setNotificationCategoryAsync(CATEGORY, [{ identifier: "done", buttonTitle: "Hecho", options: { opensAppToForeground: false } }])

// Register the buttons on every launch, not only when pushes are enabled: the category is what gives a push its
// "Hecho" button, and it must exist before a notification arrives.
if (Platform.OS !== "web") void registerCategory().catch(() => {})

export const pushEnabled =async () => (await storage.get(FLAG)) === "1"

// The server owns the reminders and sends them as native pushes (FCM / APNs through Expo's push service), skipping
// habits already done. This only gives the server a token for this phone.
async function currentToken(): Promise<string | null> {
  if (Platform.OS === "web") return null
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", { name: "Recordatorios", importance: Notifications.AndroidImportance.HIGH })
  }
  await registerCategory()
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
