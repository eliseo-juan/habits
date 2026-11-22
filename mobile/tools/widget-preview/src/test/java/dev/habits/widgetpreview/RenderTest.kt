package dev.habits.widgetpreview

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.compose
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

// Renders the widget tree through Glance's real RemoteViews pipeline and saves a PNG.
// -Ppreview.tree=<json> -Ppreview.out=<png> -Ppreview.width=<dp> -Ppreview.height=<dp>
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class RenderTest {
  @Test
  fun render() = runTest {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val tree = JSONObject(File(System.getProperty("preview.tree")!!).readText())
    val width = System.getProperty("preview.width", "374").toFloat()
    val height = System.getProperty("preview.height", "416").toFloat()
    val remoteViews = PreviewWidget { tree.toRoot(it) }.compose(context, size = DpSize(width.dp, height.dp))
    val density = context.resources.displayMetrics.density
    val w = (width * density).toInt()
    val h = (height * density).toInt()
    val host = FrameLayout(context)
    val view = remoteViews.apply(context, host)
    host.addView(view)
    host.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
    host.layout(0, 0, w, h)
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    bitmap.eraseColor(0xff3a3f3a.toInt())
    host.draw(Canvas(bitmap))
    File(System.getProperty("preview.out")!!).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    // -Dpreview.clicks: list the clickable views and the drawables that give them touch feedback.
    if (System.getProperty("preview.clicks") != null) {
      fun walk(v: View, depth: Int) {
        val drawables = listOfNotNull(v.background, v.foreground, (v as? android.widget.ImageView)?.drawable)
        if (v.isClickable || drawables.any { it is android.graphics.drawable.RippleDrawable }) println("CLICK ${"  ".repeat(depth)}${v.javaClass.simpleName} ${v.width}x${v.height} clickable=${v.isClickable} bg=${v.background?.javaClass?.simpleName} fg=${v.foreground?.javaClass?.simpleName} img=${(v as? android.widget.ImageView)?.drawable?.javaClass?.simpleName}")
        if (v is android.view.ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i), depth + 1)
      }
      walk(host, 0)
    }
  }
}
