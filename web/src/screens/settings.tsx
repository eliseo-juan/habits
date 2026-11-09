import { BellRing, Clock, Globe, KeyRound, LogOut } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { useSession } from "@/lib/data"

export function SettingsScreen() {
  const { me } = useSession()
  const client = useQueryClient()
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => api<unknown[]>("/tokens") }).data

  async function logout() {
    await api("/auth/logout", { method: "POST" })
    await client.resetQueries()
  }

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <p className="text-sm text-muted-foreground">{me.email}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Ajustes</h1>
      </header>

      <section className="rounded-3xl border border-white/5 bg-card/60 p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary/15 text-primary">
            <BellRing className="size-5" />
          </span>
          <div className="flex-1">
            <p className="font-medium">Recordatorios en este móvil</p>
            <p className="text-xs text-muted-foreground">Próximamente</p>
          </div>
          <Switch checked={false} disabled />
        </div>
      </section>

      <section className="divide-y divide-white/5 rounded-3xl border border-white/5 bg-card/60">
        <Row icon={<Globe />} label="Zona horaria" value={me.timezone} />
        <Row icon={<Clock />} label="El día termina a las" value={me.day_cutoff.slice(0, 5)} />
        <Row icon={<KeyRound />} label="Tokens de acceso" value={tokens ? `${tokens.length} ${tokens.length === 1 ? "activo" : "activos"}` : "–"} />
      </section>

      <Button variant="ghost" className="w-full text-rose-400" onClick={logout}>
        <LogOut /> Cerrar sesión
      </Button>
    </div>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-4 [&_svg]:size-4 [&_svg]:text-muted-foreground">
      {icon}
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  )
}
