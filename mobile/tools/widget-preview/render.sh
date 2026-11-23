#!/usr/bin/env bash
# Renders the Android home-screen widget to a PNG through Glance's real RemoteViews pipeline. See README.md.
# Usage: ./render.sh [props.json] [out.png] [width dp] [height dp] [dark|light] [font scale]
set -euo pipefail
cd "$(dirname "$0")"
props=$(realpath "${1:-sample-props.json}")
out=$(realpath -m "${2:-out/widget.png}")
width=${3:-374}
height=${4:-416}
scheme=${5:-dark}
font_scale=${6:-1}
mkdir -p "$(dirname "$out")" build/generated/widget-res/drawable

# 1. The real layout, run in Node, as a JSON tree.
node tree.cjs ../../src/widgets/HabitsWidget.android.tsx "$props" build/tree.json "$scheme"

# 2. The widget's drawables, from the same source as the app's config plugin.
node -e '
  const icons = require("../../plugins/widget-icons.js"), fs = require("fs")
  for (const [name, icon] of Object.entries(icons))
    fs.writeFileSync(`build/generated/widget-res/drawable/widget_${name}.xml`, icons.toVectorXml(icon))'

# 3. The Android image Robolectric runs on (once; Maven Central rate-limits, so retry).
jar=android-all-instrumented-15-robolectric-12650502-i7.jar
cache="$HOME/.cache/robolectric"
if [ ! -f "$cache/$jar" ]; then
  mkdir -p "$cache"
  for attempt in 1 2 3 4 5 6; do
    curl -fsS -o "$cache/$jar.part" "https://repo1.maven.org/maven2/org/robolectric/android-all-instrumented/15-robolectric-12650502-i7/$jar" \
      && mv "$cache/$jar.part" "$cache/$jar" && break
    echo "download failed (attempt $attempt), retrying in 60s" >&2
    sleep 60
  done
fi

# 4. Glance -> RemoteViews -> Android views -> PNG.
[ -f local.properties ] || echo "sdk.dir=${ANDROID_HOME:?set ANDROID_HOME to an Android SDK with platform 36}" > local.properties
gradle -q --max-workers=2 testDebugUnitTest --rerun \
  -Dpreview.tree="$PWD/build/tree.json" -Dpreview.out="$out" -Dpreview.width="$width" -Dpreview.height="$height" -Dpreview.fontScale="$font_scale"
echo "$out"
