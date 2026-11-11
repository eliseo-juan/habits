import { useState } from "react"
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Button } from "@/components/ui"
import { HttpError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { colors, radius } from "@/theme"

export default function LoginScreen() {
  const { signIn, baseUrl } = useAuth()
  const [server, setServer] = useState(baseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await signIn(server, email, password)
    } catch (e) {
      setError(
        e instanceof HttpError
          ? e.status === 429
            ? "Demasiados intentos. Prueba más tarde."
            : e.status === 401
              ? "Email o contraseña incorrectos."
              : e.message
          : "No se pudo conectar con el servidor.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <LinearGradient colors={["rgba(77,219,165,0.18)", "transparent"]} style={styles.glow} />
      <View style={styles.form}>
        <Text style={styles.title}>Hábitos</Text>
        <Text style={styles.subtitle}>Entra para ver y marcar tus hábitos.</Text>
        <TextInput style={styles.field} value={server} onChangeText={setServer} placeholder="Servidor (https://…)" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <TextInput style={styles.field} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoComplete="username" keyboardType="email-address" textContentType="username" />
        <TextInput style={styles.field} value={password} onChangeText={setPassword} placeholder="Contraseña" placeholderTextColor={colors.mutedForeground} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button size="lg" label="Entrar" busy={busy} disabled={!server.trim() || !email.trim() || !password} onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: colors.background },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 288 },
  form: { gap: 12, width: "100%", maxWidth: 384, alignSelf: "center" },
  title: { fontSize: 30, fontWeight: "600", letterSpacing: -0.5, color: colors.foreground },
  subtitle: { fontSize: 14, color: colors.mutedForeground, paddingBottom: 12 },
  field: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.foreground },
  error: { fontSize: 14, color: "#fb7185" },
})
