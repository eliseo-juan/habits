// Android glue for the home-screen widget, on top of what expo-widgets generates:
// - expo-widgets only reports taps to JavaScript, which is not running when the app is closed. This replaces the
//   generated widget provider with one that acts on buttons whose target starts with "open:":
//     "open:log/<habitId>[/<date>]"  opens WidgetSheetActivity, the habit's day sheet (today's, or that date's)
//                                    alone over the home screen;
//     "open:<path>"         opens the app on the deep link <scheme>://<path>.
//   Every touch also schedules a redraw five minutes later, when the widget goes back to today.
// - WidgetSheetActivity: a translucent activity, in its own task and out of recents, rendering the JS component
//   "WidgetSheet" (src/widget-sheet/root.tsx, registered in index.ts) on the app's React Native host.
// - The widget's icons (widget-icons.js) as vector drawables, the only images the widget can show.
// It must be listed BEFORE "expo-widgets" in the plugins: mods run in reverse order, so it then writes last.
const fs = require("fs")
const path = require("path")
const { withAndroidManifest, withAndroidStyles, withDangerousMod } = require("expo/config-plugins")
const icons = require("./widget-icons")

const SHEET_ACTIVITY = "WidgetSheetActivity"
const SHEET_THEME = "Theme.App.WidgetSheet"

const providerKt = (pkg, scheme, name) => `package ${pkg}

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import expo.modules.widgets.ExpoWidgetsAppWidgetProvider

class ${name}Provider : ExpoWidgetsAppWidgetProvider("${name}") {
  override fun onReceive(context: Context, intent: Intent) {
    val target = intent.getStringExtra("expo.modules.widgets.extra.TARGET")
    val interaction = intent.action == "expo.modules.widgets.ACTION_WIDGET_INTERACTION"
    // A widget only redraws when told to. The layout shows an earlier day for five minutes after the last touch
    // (WIDGET_DAY_HOLD_MS in src/widgets/props.ts), so every touch moves a redraw to just after that.
    if (interaction) scheduleRedraw(context)
    if (interaction && target != null && target.startsWith("open:")) {
      val path = target.removePrefix("open:")
      val open = if (path.startsWith("log/")) {
        // A fresh sheet for every tap, in its own task, so closing it goes back to the home screen.
        val (habitId, day) = path.removePrefix("log/").split("/").let { it[0] to it.getOrNull(1) }
        Intent(context, ${SHEET_ACTIVITY}::class.java)
          .putExtra("habitId", habitId)
          .putExtra("day", day)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      } else {
        Intent(Intent.ACTION_VIEW, Uri.parse("${scheme}://" + path))
          .setPackage(context.packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      context.startActivity(open)
      return
    }
    super.onReceive(context, intent)
  }

  private fun scheduleRedraw(context: Context) {
    val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, ${name}Provider::class.java))
    val redraw = Intent(context, ${name}Provider::class.java)
      .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
      .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    // Same request code every time: a new touch replaces the pending redraw instead of adding one.
    val pending = PendingIntent.getBroadcast(context, 1, redraw, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    context.getSystemService(AlarmManager::class.java)
      .set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 5 * 60_000L + 5_000L, pending)
  }
}
`

// Mirrors the MainActivity expo prebuild generates, rendering "WidgetSheet" with the habit id (and day) as initial props.
const sheetActivityKt = (pkg) => `package ${pkg}

import android.os.Build
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class ${SHEET_ACTIVITY} : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "WidgetSheet"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    val activity = this
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle = Bundle().apply {
          putString("habitId", activity.intent.getStringExtra("habitId"))
          activity.intent.getStringExtra("day")?.let { putString("day", it) }
        }
      },
    )
  }

  // Closing the sheet finishes the activity (the app's MainActivity moves its task back instead).
  override fun invokeDefaultOnBackPressed() {
    finish()
  }

  override fun finish() {
    super.finish()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, android.R.anim.fade_out)
    } else {
      @Suppress("DEPRECATION")
      overridePendingTransition(0, android.R.anim.fade_out)
    }
  }
}
`

module.exports = function withWidgetOpenApp(config, { widgets }) {
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0]
    const pkg = cfg.android?.package
    app.activity = (app.activity ?? []).filter((a) => a.$["android:name"] !== `.${SHEET_ACTIVITY}`)
    app.activity.push({
      $: {
        "android:name": `.${SHEET_ACTIVITY}`,
        "android:theme": `@style/${SHEET_THEME}`,
        "android:exported": "false",
        "android:excludeFromRecents": "true",
        "android:taskAffinity": `${pkg}.widgetsheet`,
        "android:launchMode": "singleTask",
        "android:screenOrientation": "portrait",
        "android:windowSoftInputMode": "adjustResize",
        "android:configChanges": "keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize",
      },
    })
    return cfg
  })

  config = withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults.resources
    styles.style = (styles.style ?? []).filter((s) => s.$.name !== SHEET_THEME)
    const item = (name, value) => ({ $: { name }, _: value })
    styles.style.push({
      $: { name: SHEET_THEME, parent: "Theme.AppCompat.DayNight.NoActionBar" },
      item: [
        item("android:windowIsTranslucent", "true"),
        item("android:windowBackground", "@android:color/transparent"),
        item("android:windowNoTitle", "true"),
        // The sheet draws its own dimmed backdrop.
        item("android:backgroundDimEnabled", "false"),
        item("android:windowAnimationStyle", "@android:style/Animation.Translucent"),
        item("android:statusBarColor", "@android:color/transparent"),
        item("android:navigationBarColor", "@android:color/transparent"),
        item("android:editTextBackground", "@drawable/rn_edit_text_material"),
      ],
    })
    return cfg
  })

  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = cfg.android?.package
      const scheme = Array.isArray(cfg.scheme) ? cfg.scheme[0] : cfg.scheme
      if (!pkg || !scheme) throw new Error("withWidgetOpenApp needs android.package and scheme")
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/java", ...pkg.split("."))
      fs.mkdirSync(dir, { recursive: true })
      for (const name of widgets) fs.writeFileSync(path.join(dir, `${name}Provider.kt`), providerKt(pkg, scheme, name))
      fs.writeFileSync(path.join(dir, `${SHEET_ACTIVITY}.kt`), sheetActivityKt(pkg))
      const drawables = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/drawable")
      fs.mkdirSync(drawables, { recursive: true })
      for (const [name, icon] of Object.entries(icons)) {
        fs.writeFileSync(path.join(drawables, `widget_${name}.xml`), icons.toVectorXml(icon))
      }
      return cfg
    },
  ])
}
