import { useSyncExternalStore } from "react"

const location = () => window.location.hash.slice(1) || "/"
const onToday = () => location().split("?")[0] === "/"
const depth = (): number => window.history.state?.depth ?? 0

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  window.addEventListener("popstate", onChange)
  return () => {
    window.removeEventListener("hashchange", onChange)
    window.removeEventListener("popstate", onChange)
  }
}

export function useRoute() {
  const [path, query = ""] = useSyncExternalStore(subscribe, location).split("?")
  return { path, params: new URLSearchParams(query) }
}

export function navigate(to: string, { replace = false } = {}) {
  if (replace) window.history.replaceState({ depth: depth() }, "", `#${to}`)
  else window.history.pushState({ depth: depth() + 1 }, "", `#${to}`)
  window.dispatchEvent(new HashChangeEvent("hashchange"))
}

// Opened from a link or after a reload there is no in-app entry to return to.
export function goBack(fallback: string) {
  if (depth() > 0) window.history.back()
  else navigate(fallback, { replace: true })
}

// Tabs keep at most one entry above Today, so back from any tab lands on Today and then leaves the app.
export function switchTab(to: string) {
  const land = () => navigate(to, { replace: to === "/" || !onToday() })
  if (depth() === 0) return land()
  window.addEventListener("popstate", land, { once: true })
  window.history.go(-depth())
}
