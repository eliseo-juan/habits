// Runs the real widget layout (src/widgets/HabitsWidget.android.tsx) in Node against a stub of @expo/ui and writes the
// element tree as JSON, with Material colors resolved from a fixed palette. The Kotlin side turns it into Glance.
// Usage: node tree.cjs <layout.tsx> <props.json> <out.json> [dark|light]
const fs = require("fs"), path = require("path")
const ts = require(path.join(__dirname, "../../node_modules/typescript"))
const [, , src, propsFile, out, scheme = "dark"] = process.argv
// Material 3 tones close to a green wallpaper; the device derives its own from the wallpaper (Material You).
const pal = scheme === "dark"
  ? { primary: "#7fd6b0", onPrimary: "#00382a", primaryContainer: "#0b5240", onPrimaryContainer: "#9cf2cb", secondaryContainer: "#324b41", onSecondaryContainer: "#cde9dc", onSurface: "#dfe4e0", onSurfaceVariant: "#bfc9c3", outline: "#89938d", outlineVariant: "#404944", surfaceContainer: "#15221d", surfaceContainerHigh: "#1f2c27", surface: "#0f1512" }
  : { primary: "#27694f", onPrimary: "#fff", primaryContainer: "#b0f0cf", onPrimaryContainer: "#002115", secondaryContainer: "#cfe9db", onSecondaryContainer: "#0b2018", onSurface: "#171d1a", onSurfaceVariant: "#404944", outline: "#707973", outlineVariant: "#bfc9c3", surfaceContainer: "#eaefeb", surfaceContainerHigh: "#e4eae5", surface: "#f5fbf6" }
const mod = (t) => (...a) => ({ t, a })
const mods = { paddingAll: mod("paddingAll"), padding: mod("padding"), size: mod("size"), width: mod("width"), height: mod("height"), fillMaxSize: mod("fillMaxSize"), fillMaxWidth: mod("fillMaxWidth"), fillMaxHeight: mod("fillMaxHeight"), wrapContentWidth: mod("wrapContentWidth"), wrapContentHeight: mod("wrapContentHeight"), background: mod("background"), cornerRadius: mod("cornerRadius"), weight: mod("IGNORED"), align: mod("IGNORED"), clickable: mod("IGNORED") }
const comp = (type) => ({ children = [], ...props } = {}) => ({ type, props, children })
const ui = { Box: comp("Box"), Row: comp("Row"), Column: comp("Column"), Text: comp("Text"), Spacer: comp("Spacer"), Button: comp("Button"), LazyColumn: comp("LazyColumn"), CircularProgressIndicator: comp("Circ"), LinearProgressIndicator: comp("Lin"), Image: comp("Img"), getMaterialColors: () => pal }
const h = (type, props, ...kids) => {
  const p = { ...(props || {}) }
  const children = (p.children !== undefined ? [].concat(p.children) : kids).flat(Infinity).filter((k) => k !== null && k !== false && k !== undefined)
  delete p.children
  return typeof type === "function" ? type({ ...p, children }) : { type, props: p, children }
}
const jsx = (type, props, key) => h(type, key !== undefined ? { ...props, key } : props)
const code = ts.transpileModule(fs.readFileSync(src, "utf8"), { compilerOptions: { module: "commonjs", jsx: "react-jsx", target: "es2020" } }).outputText
let layout, initial
const req = (m) => {
  if (m === "@expo/ui/jetpack-compose") return ui
  if (m === "@expo/ui/jetpack-compose/modifiers") return mods
  if (m === "expo-widgets") return { createWidget: (n, l, i) => ((layout = l), (initial = i)) }
  if (m === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: (p) => ({ type: "frag", props: {}, children: p.children }) }
  if (m === "./types") return { EMPTY_WIDGET: { signedIn: false, date: "", done: 0, total: 0, habits: [], avoid: [] } }
  throw new Error("unexpected import " + m)
}
new Function("require", "exports", "module", code)(req, {}, { exports: {} })
const tree = layout(JSON.parse(fs.readFileSync(propsFile, "utf8")), {})
fs.writeFileSync(out, JSON.stringify(tree))


