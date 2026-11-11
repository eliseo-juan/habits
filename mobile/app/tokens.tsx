import { useState } from "react"
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Clipboard from "expo-clipboard"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/components/toast"
import { Button, Card, Loading, Screen, SectionTitle } from "@/components/ui"
import { api, HttpError } from "@/lib/api"
import { colors, radius } from "@/theme"

type Scope = "read" | "write" | "device"
type ApiToken = { id: number; name: string; scope: Scope; created_at: string; last_used: string | null; revoked_at: string | null; current: boolean }
type Created = ApiToken & { token: string }

const SCOPE_LABELS: Record<Scope, string> = { read: "Solo lectura", write: "Lectura y escritura", device: "App móvil" }
const date = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })

export default function TokensScreen() {
  const client = useQueryClient()
  const { toast } = useToast()
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => api<ApiToken[]>("/tokens"), retry: false })
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"read" | "write">("read")
  const [fresh, setFresh] = useState<Created | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: ["tokens"] })
  const onError = (error: Error) => toast(error.message, { error: true })

  const create = useMutation({
    mutationFn: () => api<Created>("/tokens", { method: "POST", body: { name: name.trim(), scope } }),
    onSuccess: (created) => {
      setFresh(created)
      setName("")
      refresh()
    },
    onError,
  })
  const revoke = useMutation({ mutationFn: (id: number) => api(`/tokens/${id}/revoke`, { method: "POST" }), onSuccess: refresh, onError })
  const remove = useMutation({ mutationFn: (id: number) => api(`/tokens/${id}`, { method: "DELETE" }), onSuccess: refresh, onError })

  const confirm = (title: string, action: string, onConfirm: () => void) =>
    Alert.alert(title, undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: action, style: "destructive", onPress: onConfirm },
    ])

  async function copy(text: string) {
    await Clipboard.setStringAsync(text)
    toast("Copiado")
  }

  if (tokens.error instanceof HttpError && tokens.error.status === 403) {
    return (
      <Screen>
        <Text style={styles.hint}>Esta sesión se inició con una versión anterior de la app. Cierra sesión y vuelve a entrar para gestionar tokens desde el móvil.</Text>
      </Screen>
    )
  }
  if (!tokens.data) return <Loading />

  return (
    <Screen contentStyle={{ paddingBottom: 40 }}>
      <Text style={styles.hint}>Para el MCP, Home Assistant o scripts. El valor solo se muestra al crearlo.</Text>

      {fresh && (
        <Card style={{ gap: 12, borderColor: "rgba(77,219,165,0.3)", backgroundColor: "rgba(77,219,165,0.1)" }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>Copia «{fresh.name}» ahora: no volverás a verlo</Text>
          <Text selectable style={styles.secret}>
            {fresh.token}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button style={{ flex: 1 }} label="Copiar" icon={<Ionicons name="copy-outline" size={18} color={colors.primaryForeground} />} onPress={() => copy(fresh.token)} />
            <Button style={{ flex: 1 }} variant="secondary" label="Listo" onPress={() => setFresh(null)} />
          </View>
        </Card>
      )}

      <View style={{ gap: 8 }}>
        <SectionTitle>Nuevo token</SectionTitle>
        <TextInput style={styles.field} value={name} onChangeText={setName} maxLength={64} placeholder="Nombre (p. ej. Home Assistant)" placeholderTextColor={colors.mutedForeground} />
        <View style={styles.segments}>
          {(["read", "write"] as const).map((s) => (
            <Pressable key={s} onPress={() => setScope(s)} style={[styles.segment, scope === s && { backgroundColor: colors.primary }]}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: scope === s ? colors.primaryForeground : colors.mutedForeground }}>{SCOPE_LABELS[s]}</Text>
            </Pressable>
          ))}
        </View>
        <Button label="Generar" icon={<Ionicons name="add" size={18} color={colors.primaryForeground} />} disabled={!name.trim()} busy={create.isPending} onPress={() => create.mutate()} />
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>Tokens</SectionTitle>
        <Card style={{ padding: 0 }}>
          {tokens.data.length === 0 && <Text style={[styles.hint, { padding: 16, textAlign: "center" }]}>Sin tokens</Text>}
          {tokens.data.map((t, i) => (
            <View key={t.id} style={[styles.row, i === tokens.data.length - 1 && { borderBottomWidth: 0 }, t.revoked_at && { opacity: 0.6 }]}>
              <Ionicons name={t.current ? "phone-portrait-outline" : "key-outline"} size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: colors.foreground, textDecorationLine: t.revoked_at ? "line-through" : "none" }}>
                  {t.name}
                  {t.current ? " · este móvil" : ""}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  {t.revoked_at ? `Deprecado el ${date(t.revoked_at)}` : SCOPE_LABELS[t.scope]} · {t.last_used ? `usado ${date(t.last_used)}` : "sin usar"}
                </Text>
              </View>
              {!t.current && !t.revoked_at && (
                <Pressable hitSlop={8} accessibilityLabel="Deprecar" disabled={revoke.isPending} onPress={() => confirm(`¿Deprecar «${t.name}»? Dejará de funcionar.`, "Deprecar", () => revoke.mutate(t.id))}>
                  <Ionicons name="ban-outline" size={20} color={colors.mutedForeground} />
                </Pressable>
              )}
              {!t.current && (
                <Pressable hitSlop={8} accessibilityLabel="Eliminar" disabled={remove.isPending} onPress={() => confirm(`¿Eliminar «${t.name}»?`, "Eliminar", () => remove.mutate(t.id))}>
                  <Ionicons name="trash-outline" size={20} color={colors.rose} />
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hint: { paddingHorizontal: 4, fontSize: 13, color: colors.mutedForeground },
  secret: { borderRadius: radius.sm, padding: 10, fontSize: 12, fontFamily: "monospace", color: colors.foreground, backgroundColor: "rgba(0,0,0,0.3)" },
  field: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white10, paddingHorizontal: 16, fontSize: 16, color: colors.foreground },
  segments: { flexDirection: "row", gap: 6, padding: 4, borderRadius: radius.md, backgroundColor: colors.white10 },
  segment: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
})
