import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { Platform } from "react-native"
import { logoutRemote, loginForToken, normalizeBaseUrl, setCredentials, setUnauthorizedHandler } from "@/lib/api"
import { queryClient } from "@/lib/query"
import { storage } from "@/lib/storage"

const URL_KEY = "habits.baseUrl"
const TOKEN_KEY = "habits.token"

type Auth = {
  ready: boolean
  baseUrl: string | null
  signedIn: boolean
  signIn: (baseUrl: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<{ baseUrl: string; token: string } | null>(null)
  const [lastUrl, setLastUrl] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([storage.get(URL_KEY), storage.get(TOKEN_KEY)])
      .then(([baseUrl, token]) => {
        setLastUrl(baseUrl)
        if (baseUrl && token) {
          setCredentials({ baseUrl, token })
          setState({ baseUrl, token })
        }
      })
      .finally(() => setReady(true))
  }, [])

  const clear = useCallback(async () => {
    setCredentials(null)
    setState(null)
    queryClient.clear()
    await storage.remove(TOKEN_KEY)
  }, [])

  useEffect(() => setUnauthorizedHandler(() => void clear()), [clear])

  const signIn = useCallback(async (rawUrl: string, email: string, password: string) => {
    const baseUrl = normalizeBaseUrl(rawUrl)
    const { token } = await loginForToken(baseUrl, email.trim(), password, `Hábitos · ${Platform.OS}`)
    await Promise.all([storage.set(URL_KEY, baseUrl), storage.set(TOKEN_KEY, token)])
    setCredentials({ baseUrl, token })
    setLastUrl(baseUrl)
    setState({ baseUrl, token })
  }, [])

  const signOut = useCallback(async () => {
    if (state) await logoutRemote(state.baseUrl, state.token).catch(() => {})
    await clear()
  }, [state, clear])

  const value = useMemo<Auth>(
    () => ({ ready, baseUrl: state?.baseUrl ?? lastUrl, signedIn: !!state, signIn, signOut }),
    [ready, state, lastUrl, signIn, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error("useAuth outside AuthProvider")
  return auth
}
