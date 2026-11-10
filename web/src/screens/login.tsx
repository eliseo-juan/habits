import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { api, HttpError } from "@/lib/api"
import { meQuery } from "@/lib/data"

const FIELD = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-primary/60"

export function LoginScreen() {
  const client = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await api("/auth/login", { method: "POST", body: { email: form.get("email"), password: form.get("password") } })
      await client.invalidateQueries(meQuery)
    } catch (e) {
      setError(e instanceof HttpError && e.status === 429 ? "Demasiados intentos. Prueba más tarde." : "Email o contraseña incorrectos.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 mx-auto h-72 max-w-md bg-[radial-gradient(ellipse_at_top,var(--color-primary)_0%,transparent_70%)] opacity-15" />
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="w-full max-w-sm space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Hábitos</h1>
        <p className="pb-3 text-sm text-muted-foreground">Entra para ver y marcar tus hábitos.</p>
        <input name="email" type="email" placeholder="Email" autoComplete="username" required className={FIELD} />
        <input name="password" type="password" placeholder="Contraseña" autoComplete="current-password" required className={FIELD} />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          Entrar
        </Button>
      </motion.form>
    </div>
  )
}
