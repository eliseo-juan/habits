@file:SuppressLint("RestrictedApi")
@file:Suppress("RestrictedApiAndroidX", "INVISIBLE_MEMBER", "INVISIBLE_REFERENCE")

// JSON widget tree -> Glance emittables, following expo-widgets' ExpoWidgetEmittableTree.kt (58.0.29) node by node:
// same supported nodes and modifiers, same alignment, text and button rules. The tree comes from running the real
// widget layout in Node (tree.cjs).
package dev.habits.widgetpreview

import android.annotation.SuppressLint
import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.Emittable
import androidx.glance.EmittableImage
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.TintColorFilterParams
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.EmittableLazyColumn
import androidx.glance.appwidget.lazy.EmittableLazyListItem
import androidx.glance.appwidget.lazy.ReservedItemIdRangeEnd
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.ContentScale
import androidx.glance.layout.EmittableBox
import androidx.glance.layout.EmittableColumn
import androidx.glance.layout.EmittableRow
import androidx.glance.layout.EmittableSpacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.layout.wrapContentHeight
import androidx.glance.layout.wrapContentWidth
import androidx.glance.text.EmittableText
import androidx.glance.text.FontWeight
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextDefaults
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import io.github.expo.peek.glance.determinateCircularProgressIndicatorEmittable
import org.json.JSONArray
import org.json.JSONObject

fun JSONObject.toRoot(context: Context): Emittable = EmittableColumn().also { it.children += toNodes(context) }

private fun JSONObject.props(): JSONObject = optJSONObject("props") ?: JSONObject()

private fun JSONObject.kids(): List<JSONObject> {
  val out = mutableListOf<JSONObject>()
  fun walk(value: Any?) {
    when (value) {
      is JSONArray -> for (i in 0 until value.length()) walk(value.get(i))
      is JSONObject -> out += value
      is String -> out += JSONObject().put("type", "Text").put("children", JSONArray().put(value))
    }
  }
  walk(opt("children"))
  return out
}

// Text content of a Text node (its string children joined), like textContent() upstream.
private fun JSONObject.text(): String {
  val parts = StringBuilder()
  val children = opt("children")
  if (children is JSONArray) for (i in 0 until children.length()) {
    when (val c = children.get(i)) {
      is String -> parts.append(c)
      is Number -> parts.append(c.toString())
    }
  }
  return parts.toString()
}

private fun JSONObject.toNodes(context: Context): List<Emittable> = when (getString("type")) {
  "frag" -> kids().flatMap { it.toNodes(context) }
  "Box" -> listOf(EmittableBox().also {
    it.modifier = props().modifier()
    it.contentAlignment = props().optString("contentAlignment").contentAlignment() ?: Alignment.TopStart
    it.children += kids().flatMap { c -> c.toNodes(context) }
  })
  "Row" -> listOf(EmittableRow().also {
    it.modifier = props().modifier()
    it.horizontalAlignment = props().horizontal()
    it.verticalAlignment = props().vertical()
    it.children += kids().flatMap { c -> c.toNodes(context) }
  })
  "Column" -> listOf(EmittableColumn().also {
    it.modifier = props().modifier()
    it.verticalAlignment = props().vertical()
    it.horizontalAlignment = props().horizontal()
    it.children += kids().flatMap { c -> c.toNodes(context) }
  })
  // RemoteViews lists are a ListView filled by a remote adapter, which Robolectric never populates. For a still
  // capture, lay the items out as the ListView would: one full-width row per item, aligned like a lazy item.
  "LazyColumn" -> if (System.getProperty("preview.realLazy") == null) {
    val alignment = props().horizontal()
    listOf(EmittableColumn().also { column ->
      column.modifier = props().modifier()
      kids().flatMap { it.toNodes(context) }.forEach { child ->
        column.children += EmittableBox().also { item ->
          item.modifier = GlanceModifier.fillMaxWidth()
          item.contentAlignment = Alignment(alignment, Alignment.Vertical.CenterVertically)
          item.children += child
        }
      }
    })
  } else {
    val alignment = props().horizontal()
    listOf(EmittableLazyColumn().also { list ->
      list.modifier = props().modifier()
      list.horizontalAlignment = alignment
      kids().flatMap { it.toNodes(context) }.forEachIndexed { index, child ->
        list.children += EmittableLazyListItem().also { item ->
          item.itemId = ReservedItemIdRangeEnd - index
          item.alignment = Alignment(alignment, Alignment.Vertical.CenterVertically)
          item.children += child
        }
      }
    })
  }
  "Spacer" -> listOf(EmittableSpacer().also { it.modifier = props().modifier() })
  "Text" -> listOf(EmittableText().also {
    val p = props()
    val style = p.optJSONObject("style") ?: JSONObject()
    it.text = text()
    it.modifier = p.modifier()
    it.style = TextStyle(
      color = p.optString("color").color()?.let(::ColorProvider) ?: TextDefaults.defaultTextColor,
      fontSize = if (style.has("fontSize")) style.getDouble("fontSize").toFloat().sp else null,
      fontWeight = when (style.optString("fontWeight")) { "bold", "700", "800", "900" -> FontWeight.Bold; "" -> null; else -> FontWeight.Normal },
      textDecoration = when (style.optString("textDecoration")) { "lineThrough" -> TextDecoration.LineThrough; "underline" -> TextDecoration.Underline; "none" -> TextDecoration.None; else -> null },
    )
    it.maxLines = if (p.has("maxLines")) p.getInt("maxLines") else Int.MAX_VALUE
  })
  "Img" -> listOf(EmittableImage().also {
    val p = props()
    val name = p.getJSONObject("source").getString("uri")
    val id = context.resources.getIdentifier(name, "drawable", context.packageName)
    require(id != 0) { "drawable $name not found" }
    it.provider = ImageProvider(id)
    it.modifier = p.modifier()
    it.contentScale = ContentScale.Fit
    it.colorFilterParams = p.optString("tint").color()?.let { c -> TintColorFilterParams(ColorProvider(c)) }
  })
  "Circ" -> {
    val p = props()
    listOf(determinateCircularProgressIndicatorEmittable(
      progress = p.optDouble("progress", 0.0).toFloat(),
      modifier = p.modifier(),
      color = ColorProvider(p.optString("color").color() ?: Color(0xff6750a4)),
      trackColor = ColorProvider(p.optString("trackColor").color() ?: Color(0xffe7e0ec)),
    ))
  }
  // Buttons with non-text children become a clickable Box with centered content (the click is irrelevant here).
  "Button" -> listOf(EmittableBox().also {
    val p = props()
    var modifier = p.modifier()
    p.optJSONObject("colors")?.optString("containerColor")?.color()?.let { c -> modifier = modifier.background(ColorProvider(c)) }
    it.modifier = modifier
    it.contentAlignment = Alignment.Center
    it.children += kids().flatMap { c -> c.toNodes(context) }
  })
  else -> error("unsupported node ${getString("type")}")
}

private fun JSONObject.modifier(): GlanceModifier {
  val list = optJSONArray("modifiers") ?: return GlanceModifier
  var m: GlanceModifier = GlanceModifier
  for (i in 0 until list.length()) {
    val mod = list.getJSONObject(i)
    val a = mod.optJSONArray("a") ?: JSONArray()
    fun f(n: Int) = a.getDouble(n).toFloat()
    m = m.then(
      when (mod.getString("t")) {
        "paddingAll" -> GlanceModifier.padding(f(0).dp)
        "padding" -> GlanceModifier.padding(start = f(0).dp, top = f(1).dp, end = f(2).dp, bottom = f(3).dp)
        "size" -> GlanceModifier.size(f(0).dp, f(1).dp)
        "width" -> GlanceModifier.width(f(0).dp)
        "height" -> GlanceModifier.height(f(0).dp)
        "wrapContentWidth" -> GlanceModifier.wrapContentWidth()
        "wrapContentHeight" -> GlanceModifier.wrapContentHeight()
        "fillMaxSize" -> GlanceModifier.fillMaxSize()
        "fillMaxWidth" -> GlanceModifier.fillMaxWidth()
        "fillMaxHeight" -> GlanceModifier.fillMaxHeight()
        "background" -> a.optString(0).color()?.let { GlanceModifier.background(ColorProvider(it)) } ?: GlanceModifier
        "cornerRadius" -> GlanceModifier.cornerRadius(f(0).dp)
        else -> GlanceModifier // unsupported upstream too (weight, align, …)
      }
    )
  }
  return m
}

private fun JSONObject.horizontal(): Alignment.Horizontal = when (optString("horizontalAlignment").ifEmpty { optString("horizontalArrangement") }) {
  "center" -> Alignment.CenterHorizontally
  "end" -> Alignment.End
  else -> Alignment.Start
}

private fun JSONObject.vertical(): Alignment.Vertical = when (optString("verticalAlignment").ifEmpty { optString("verticalArrangement") }) {
  "center" -> Alignment.CenterVertically
  "bottom" -> Alignment.Bottom
  else -> Alignment.Top
}

private fun String.contentAlignment(): Alignment? = when (this) {
  "topStart" -> Alignment.TopStart; "topCenter" -> Alignment.TopCenter; "topEnd" -> Alignment.TopEnd
  "centerStart" -> Alignment.CenterStart; "center" -> Alignment.Center; "centerEnd" -> Alignment.CenterEnd
  "bottomStart" -> Alignment.BottomStart; "bottomCenter" -> Alignment.BottomCenter; "bottomEnd" -> Alignment.BottomEnd
  else -> null
}

// "#RRGGBB" or CSS-style "#RRGGBBAA", as React Native colors.
private fun String?.color(): Color? {
  if (this == null || !startsWith("#")) return null
  val hex = substring(1)
  return when (hex.length) {
    6 -> Color(("ff$hex").toLong(16))
    8 -> Color((hex.substring(6) + hex.substring(0, 6)).toLong(16))
    else -> null
  }
}
