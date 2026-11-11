import { useState } from "react"
import { Ban, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export type ApiToken = {
  id: number
  name: string
  scope: "read" | "write"
  created_at: string
  last_used: string | null
  revoked_at: string | null
}
type Created = ApiToken & { token: string }

export const tokensQuery = { queryKey: ["tokens"], queryFn: () => api<ApiToken[]>("/tokens") }

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("Copiado")
  } catch {
    toast.error("No se pudo copiar")
  }
}

const date = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })

export function TokensSheet({ onClose }: { onClose: () => void }) {
  const client = useQueryClient()
  const tokens = useQuery(tokensQuery).data ?? []
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"read" | "write">("read")
  const [fresh, setFresh] = useState<Created | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: ["tokens"] })
  const onError = (e: Error) => toast.error(e.message)

  const create = useMutation({
    mutationFn: () => api<Created>("/tokens", { method: "POST", body: { name: name.trim(), scope } }),
    onSuccess: (created) => {
      setFresh(created)
      setName("")
      refresh()
    },
    onError,
  })
  const revoke = useMutation({
    mutationFn: (id: number) => api(`/tokens/${id}/revoke`, { method: "POST" }),
    onSuccess: refresh,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/tokens/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  })

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-t-[2rem] border-white/10 bg-background/95 px-5 pb-8 backdrop-blur-xl">
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-white/15" />
        <SheetHeader className="px-0 text-left">
          <SheetTitle className="text-lg">Tokens de acceso</SheetTitle>
          <SheetDescription>Para el MCP, Home Assistant o scripts. El valor solo se muestra al crearlo.</SheetDescription>
        </SheetHeader>

        {fresh && (
          <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/10 p-3">
            <p className="text-sm font-medium">Copia «{fresh.name}» ahora: no volverás a verlo</p>
            <code className="block break-all rounded-xl bg-black/30 p-2 text-xs">{fresh.token}</code>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => copy(fresh.token)}>
                <Copy /> Copiar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>
                <Check /> Listo
              </Button>
            </div>
          </div>
        )}

        <form
          className="space-y-2 rounded-2xl border border-white/5 bg-card/60 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder="Nombre (p. ej. Home Assistant)"
            className="w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2">
            {(["read", "write"] as const).map((s) => (
              <Button key={s} type="button" size="sm" variant={scope === s ? "default" : "secondary"} onClick={() => setScope(s)}>
                {s === "read" ? "Solo lectura" : "Lectura y escritura"}
              </Button>
            ))}
            <Button type="submit" size="sm" className="ml-auto" disabled={!name.trim() || create.isPending}>
              <Plus /> Generar
            </Button>
          </div>
        </form>

        <ul className="space-y-2">
          {tokens.length === 0 && <li className="py-2 text-center text-sm text-muted-foreground">Sin tokens</li>}
          {tokens.map((t) => (
            <li key={t.id} className={cn("flex items-center gap-3 rounded-2xl border border-white/5 bg-card/60 p-3", t.revoked_at && "opacity-60")}>
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", t.revoked_at && "line-through")}>{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.revoked_at ? `Deprecado el ${date(t.revoked_at)}` : t.scope === "write" ? "Lectura y escritura" : "Solo lectura"} ·{" "}
                  {t.last_used ? `usado ${date(t.last_used)}` : "sin usar"}
                </p>
              </div>
              {!t.revoked_at && (
                <Button size="icon" variant="ghost" aria-label="Deprecar" disabled={revoke.isPending} onClick={() => confirm(`¿Deprecar «${t.name}»? Dejará de funcionar.`) && revoke.mutate(t.id)}>
                  <Ban />
                </Button>
              )}
              <Button size="icon" variant="ghost" aria-label="Eliminar" className="text-rose-400" disabled={remove.isPending} onClick={() => confirm(`¿Eliminar «${t.name}»?`) && remove.mutate(t.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
