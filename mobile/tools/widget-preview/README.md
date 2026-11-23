# Widget preview

Renders the Android home-screen widget to a PNG without a device, through the same pipeline a launcher uses:
Glance composes `RemoteViews`, Android inflates them into views, and Robolectric draws those views with its native
graphics. It catches what only shows up on Android, such as text weights Glance does not have, tints that keep the
drawable's alpha, or Glance components that ignore their size.

## How it works

1. `tree.cjs` runs the real layout (`src/widgets/HabitsWidget.android.tsx`) in Node against a stub of `@expo/ui` and
   writes the element tree as JSON. Material You colors come from a fixed palette (the device derives them from the
   wallpaper).
2. `src/main/.../Tree.kt` turns that tree into Glance emittables, following expo-widgets' own converter
   (`ExpoWidgetEmittableTree.kt`) node by node: same supported nodes and modifiers, same alignment and text rules.
3. `RenderTest` feeds it to a `PeekEmittableAppWidget` (the base class expo-widgets uses), calls Glance's
   `compose()` for the `RemoteViews`, applies them and saves the bitmap.

Known differences from a device: `cornerRadius` is a view outline clip that Robolectric does not draw (corners come out
square; the widget draws its circles as drawables, so only the chip and the frame are affected), the lazy list is laid
out as a column because Robolectric never fills a remote list adapter, and fonts and emoji are Robolectric's. Ripples are not drawn either: `compose()` is Glance's preview composition, which drops click actions and with them the ripple overlay Glance adds on a device. `-Dpreview.clicks=1` (with `gradle -i`) lists the clickable views.

## Run

Needs Node with `mobile/node_modules` installed, JDK 21, Gradle 8.13+ and an Android SDK with platform 36
(`ANDROID_HOME`). The first run downloads Gradle dependencies from Google Maven and Maven Central, and the Android image
Robolectric runs on (about 200 MB, cached in `~/.cache/robolectric`).

```sh
./render.sh                                   # sample-props.json -> out/widget.png, 374x416 dp, dark
./render.sh my-props.json out/narrow.png 300 260 light
./render.sh sample-props.json out/big-font.png 374 416 dark 1.3   # system font size raised
```

Props have the shape of `WidgetProps` (`src/widgets/types.ts`); `sample-props.json` covers every row state.
