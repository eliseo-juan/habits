// Renders the Android widget through Glance's real RemoteViews pipeline under Robolectric. See README.md.
plugins {
  id("com.android.library") version "8.11.1"
  id("org.jetbrains.kotlin.android") version "2.1.20"
}

android {
  namespace = "dev.habits.widgetpreview"
  compileSdk = 36
  defaultConfig { minSdk = 26 }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
  }
  // Generated from ../../plugins/widget-icons.js by render.sh, like the app's config plugin does.
  sourceSets["main"].res.srcDir("build/generated/widget-res")
  testOptions {
    unitTests {
      isIncludeAndroidResources = true
      all { test ->
        System.getProperties().forEach { (key, value) -> if (key.toString().startsWith("preview.")) test.systemProperty(key.toString(), value) }
        test.maxHeapSize = "3g"
        // render.sh downloads the Android image Robolectric runs on; Robolectric's own fetch is often rate-limited.
        test.systemProperty("robolectric.offline", "true")
        test.systemProperty("robolectric.dependency.dir", System.getProperty("user.home") + "/.cache/robolectric")
      }
    }
  }
}

kotlin { jvmToolchain(21) }

dependencies {
  // Same versions as expo-widgets 58.0.29 (mobile/node_modules/expo-widgets/android/build.gradle).
  implementation("io.github.expo.peek:peek-emittables:0.3.3")
  implementation("androidx.glance:glance-appwidget:1.2.0")
  implementation("androidx.compose.ui:ui-unit:1.8.3")
  implementation("androidx.compose.ui:ui-graphics:1.8.3")
  testImplementation("junit:junit:4.13.2")
  testImplementation("androidx.test:core:1.6.1")
  testImplementation("org.robolectric:robolectric:4.15.1")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}
