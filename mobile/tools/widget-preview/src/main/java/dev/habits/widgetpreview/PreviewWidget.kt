package dev.habits.widgetpreview

import android.content.Context
import android.os.Bundle
import androidx.compose.ui.unit.DpSize
import androidx.glance.Emittable
import androidx.glance.appwidget.AppWidgetId
import io.github.expo.peek.emittables.PeekEmittableAppWidget

// The same base class expo-widgets' ExpoWidgetsPeekWidget uses, fed with a prebuilt tree.
class PreviewWidget(private val root: (Context) -> Emittable) : PeekEmittableAppWidget() {
  override fun provideRoot(context: Context, id: AppWidgetId, options: Bundle, size: DpSize): Emittable = root(context)
}
