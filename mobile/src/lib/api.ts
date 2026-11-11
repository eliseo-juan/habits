export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Credentials = { baseUrl: string; token: string }

let credentials: Credentials | null = null
let onUnauthorized: () => void = () => {}

export const setCredentials = (next: Credentials | null) => {
  credentials = next
}
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler
}

// "mi-servidor.com" and "http://192.168.1.5:8000/" both become a clean origin.
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "")
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

async function request<T>(baseUrl: string, path: string, init: { method?: string; body?: unknown; token?: string }): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new HttpError(0, "Sin conexión con el servidor")
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new HttpError(response.status, error.message ?? response.statusText)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!credentials) throw new HttpError(401, "No has iniciado sesión")
  try {
    return await request<T>(credentials.baseUrl, path, { ...init, token: credentials.token })
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) onUnauthorized()
    throw error
  }
}

export type DeviceToken = { token: string }

export const loginForToken = (baseUrl: string, email: string, password: string, deviceName: string) =>
  request<DeviceToken>(baseUrl, "/auth/token", { method: "POST", body: { email, password, device_name: deviceName } })

export const logoutRemote = (baseUrl: string, token: string) => request<void>(baseUrl, "/auth/logout", { method: "POST", token })
