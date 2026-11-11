import { useEffect, useRef } from "react"

// The habit detail view and overlays (sheets, forms) each push a history entry,
// so the system/browser back gesture closes them instead of leaving the app.
let layers = 0 // mounted overlays
let pushed = 0 // overlay entries currently on the history stack

window.addEventListener("popstate", () => {
  if (!history.state?.layer) pushed = 0
})

/** Pushes a detail entry onto the history stack. */
export function pushDetail(id: number) {
  if (pushed > 0) {
    // An overlay is closing as we navigate: reuse its entry.
    pushed--
    history.replaceState({ detail: id }, "")
  } else {
    history.pushState({ detail: id }, "")
  }
}

/** Leaves the detail view (and any overlay on top of it) through the history. */
export function goBack() {
  const steps = pushed + 1
  pushed = 0
  history.go(-steps)
}

/** While mounted, the back gesture calls onClose instead of navigating away. */
export function useBackLayer(onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    layers++
    if (pushed < layers) {
      history.pushState({ ...history.state, layer: true }, "")
      pushed++
    }
    const onPop = () => close.current()
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      layers--
      // Deferred so a StrictMode remount reuses the entry instead of popping it.
      setTimeout(() => {
        if (pushed > layers) {
          pushed--
          history.back()
        }
      }, 0)
    }
  }, [])
}
