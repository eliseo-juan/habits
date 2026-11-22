// expo-widgets only reports taps to JavaScript, which is not running when the app is closed. This plugin replaces the
// generated widget provider with one that turns a tap on a button whose target is "open:<path>" into a deep link
// (<scheme>://<path>), so the widget can open the app straight on a screen (e.g. the day sheet of a habit).
// It also writes the widget's icons (widget-icons.js) as vector drawables, the only images the widget can show.
// It must be listed BEFORE "expo-widgets" in the plugins: mods run in reverse order, so it then writes last.
const fs = require("fs")
const path = require("path")
const { withDangerousMod } = require("expo/config-plugins")
const icons = require("./widget-icons")

module.exports = function withWidgetOpenApp(config, { widgets }) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = cfg.android?.package
      const scheme = Array.isArray(cfg.scheme) ? cfg.scheme[0] : cfg.scheme
      if (!pkg || !scheme) throw new Error("withWidgetOpenApp needs android.package and scheme")
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/java", ...pkg.split("."))
      fs.mkdirSync(dir, { recursive: true })
      for (const name of widgets) {
        fs.writeFileSync(
          path.join(dir, `${name}Provider.kt`),
          `package ${pkg}

import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.widgets.ExpoWidgetsAppWidgetProvider

class ${name}Provider : ExpoWidgetsAppWidgetProvider("${name}") {
  override fun onReceive(context: Context, intent: Intent) {
    val target = intent.getStringExtra("expo.modules.widgets.extra.TARGET")
    if (intent.action == "expo.modules.widgets.ACTION_WIDGET_INTERACTION" && target != null && target.startsWith("open:")) {
      val link = Intent(Intent.ACTION_VIEW, Uri.parse("${scheme}://" + target.removePrefix("open:")))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      context.startActivity(link)
      return
    }
    super.onReceive(context, intent)
  }
}
`,
        )
      }
      const drawables = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/drawable")
      fs.mkdirSync(drawables, { recursive: true })
      for (const [icon, pathData] of Object.entries(icons)) {
        fs.writeFileSync(
          path.join(drawables, `widget_${icon}.xml`),
          `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="${pathData}" />
</vector>
`,
        )
      }
      return cfg
    },
  ])
}
