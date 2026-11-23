// Vector drawables the Android widget draws, tinted at runtime. The widget runtime can only show images from the app's
// drawables, so withWidgetOpenApp writes each entry to res/drawable/widget_<name>.xml.
// Icons are Material icons (24x24 fill paths). Rings are progress arcs in 12 steps (ring_0 … ring_12, 44x44, drawn
// clockwise from the top): Glance's own circular progress ignores its size on some launchers, images do not.
const RING = { size: 44, stroke: 3.5 }
const icons = {
  check: { fill: "M9,16.17L4.83,12l-1.42,1.41L9,19 21,7l-1.41,-1.41z" },
  bell: { fill: "M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.89,2 2,2zM18,16v-5c0,-3.07 -1.64,-5.64 -4.5,-6.32V4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z" },
  chevron_left: { fill: "M15.41,7.41L14,6l-6,6 6,6 1.41,-1.41L10.83,12z" },
  chevron_right: { fill: "M10,6L8.59,7.41 13.17,12l-4.58,4.59L10,18l6,-6z" },
  fire: { fill: "M12,12.9l-2.13,2.09C9.31,15.55 9,16.28 9,17.06C9,18.68 10.35,20 12,20s3,-1.32 3,-2.94c0,-0.78 -0.31,-1.52 -0.87,-2.07L12,12.9zM16,6l-0.44,0.55C14.38,8.02 12,7.19 12,5.3V2c0,0 -8,4 -8,11c0,2.92 1.56,5.47 3.89,6.86C7.33,19.07 7,18.1 7,17.06c0,-1.32 0.52,-2.56 1.47,-3.5L12,10.1l3.53,3.47c0.95,0.93 1.47,2.17 1.47,3.5c0,1.02 -0.31,1.96 -0.85,2.75c1.89,-1.15 3.29,-3.06 3.71,-5.3C20.52,10.97 18.79,7.62 16,6z" },
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
// The ring's track: a full circle drawn at low opacity. Glance tints images keeping the drawable's own alpha, not the
// tint's, so a faint track needs the transparency in the drawable and a solid tint.
icons.ring_track = { ...icons.ring_12, alpha: 0.22 }
// Filled circles (the done state and the priority dot), drawn instead of relying on cornerRadius,
// which is a view outline clip that only exists on Android 12+.
const disc = "M24,0A24,24 0 1,1 24,48A24,24 0 1,1 24,0z"
icons.circle = { fill: disc, size: 48 }
module.exports = icons

// Android vector drawable XML for one entry.
module.exports.toVectorXml = (icon) => {
  const size = icon.size ?? 24
  const body = icon.fill !== undefined
    ? `<path android:fillColor="#FFFFFFFF"${icon.alpha !== undefined ? ` android:fillAlpha="${icon.alpha}"` : ""} android:pathData="${icon.fill}" />`
    : icon.stroke ? `<path android:strokeColor="#FFFFFFFF" android:strokeWidth="${icon.width}" android:strokeLineCap="round"${icon.alpha !== undefined ? ` android:strokeAlpha="${icon.alpha}"` : ""} android:fillColor="#00000000" android:pathData="${icon.stroke}" />` : ""
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="${size}dp" android:height="${size}dp" android:viewportWidth="${size}" android:viewportHeight="${size}">
  ${body || '<path android:fillColor="#00000000" android:pathData="M0,0" />'}
</vector>
`
}
Object.defineProperty(module.exports, "toVectorXml", { enumerable: false })
