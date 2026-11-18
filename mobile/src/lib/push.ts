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

// Android runs this when a notification button is tapped, even with the app closed. It needs no login: the signed,
// single-use link in the push is the credential, so a leaked notification never exposes a token.
const ACTION_URLS: Record<string, string> = { done: "doneUrl", skip: "skipUrl", snooze: "snoozeUrl" }

TaskManager.defineTask<Notifications.NotificationTaskPayload>(ACTION_TASK, async ({ data }) => {
  if ("actionIdentifier" in data) {
    const key = ACTION_URLS[data.actionIdentifier]
    const url = key ? data.notification.request.content.data?.[key] : undefined
    if (typeof url === "string") await fetch(url, { method: "POST" }).catch(() => {})
    return
  }
  // Android shows a push with a title and body by itself when the app is in the background, without the buttons. So
  // the server sends reminders to Android as data only, and this shows them, with the buttons, whatever the app's state.
  const raw = (data.data as { dataString?: string } | undefined)?.dataString
  let payload: { title?: string; message?: string; doneUrl?: string } | undefined
  try {
    payload = raw ? JSON.parse(raw) : undefined
  } catch {
    return
  }
  if (!payload?.title || !payload.doneUrl) return
  await Notifications.scheduleNotificationAsync({
    content: { title: payload.title, body: payload.message || undefined, data: payload, categoryIdentifier: CATEGORY },
    trigger: { channelId: "reminders" },
  }).catch(() => {})
})
if (Platform.OS === "android") void Notifications.registerTaskAsync(ACTION_TASK).catch(() => {})

const registerCategory = () =>
  Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: "done", buttonTitle: "Hecho", options: { opensAppToForeground: false } },
    { identifier: "skip", buttonTitle: "Ignorar", options: { opensAppToForeground: false } },
    { identifier: "snooze", buttonTitle: "Posponer", options: { opensAppToForeground: false } },
  ])

// Register the buttons on every launch, not only when pushes are enabled: the category is what gives a push its
// buttons, and it must exist before a notification arrives.
if (Platform.OS !== "web") void registerCategory().catch(() => {})

export const pushEnabled = async () => (await storage.get(FLAG)) === "1"

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
  await api("/push-devices", { method: "PUT", body: { token, platform: Platform.OS } })
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
