// Vector drawables the Android widget draws, tinted at runtime. The widget runtime can only show images from the app's
// drawables, so withWidgetOpenApp writes each entry to res/drawable/widget_<name>.xml.
// Icons are Material icons (24x24 fill paths). Rings are progress arcs in 12 steps (ring_0 … ring_12, 44x44, drawn
// clockwise from the top): Glance's own circular progress ignores its size on some launchers, images do not.
const RING = { size: 44, stroke: 3.5 }
const icons = {
  check: { fill: "M9,16.17L4.83,12l-1.42,1.41L9,19 21,7l-1.41,-1.41z" },
  bell: { fill: "M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.89,2 2,2zM18,16v-5c0,-3.07 -1.64,-5.64 -4.5,-6.32V4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z" },
  flag: { fill: "M14.4,6L14,4H5v17h2v-7h5.6l0.4,2h7V6z" },
}
const c = RING.size / 2, r = c - RING.stroke / 2
const point = (a) => `${(c + r * Math.sin(a)).toFixed(3)},${(c - r * Math.cos(a)).toFixed(3)}`
for (let step = 0; step <= 12; step++) {
  const a = (2 * Math.PI * step) / 12
  const d =
    step === 0 ? "" // nothing to draw: the track is ring_12 in a faint tint
    : step === 12 ? `M${point(0)}A${r},${r} 0 1,1 ${point(Math.PI)}A${r},${r} 0 1,1 ${point(0)}`
    : `M${point(0)}A${r},${r} 0 ${step > 6 ? 1 : 0},1 ${point(a)}`
  icons[`ring_${step}`] = { stroke: d, size: RING.size, width: RING.stroke }
}
module.exports = icons

// Android vector drawable XML for one entry.
module.exports.toVectorXml = (icon) => {
  const size = icon.size ?? 24
  const body = icon.fill !== undefined
    ? `<path android:fillColor="#FFFFFFFF" android:pathData="${icon.fill}" />`
    : icon.stroke ? `<path android:strokeColor="#FFFFFFFF" android:strokeWidth="${icon.width}" android:strokeLineCap="round" android:fillColor="#00000000" android:pathData="${icon.stroke}" />` : ""
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="${size}dp" android:height="${size}dp" android:viewportWidth="${size}" android:viewportHeight="${size}">
  ${body || '<path android:fillColor="#00000000" android:pathData="M0,0" />'}
</vector>
`
}
Object.defineProperty(module.exports, "toVectorXml", { enumerable: false })
