import { useEffect } from "react"
import { useDay, useSession } from "@/lib/data"
import { registerWidgetRefresh } from "@/widgets/background"
import { buildWidgetProps } from "@/widgets/props"
import { pushWidget } from "@/widgets/sync"

// Mounted while signed in: keeps the home-screen widget in step with whatever the app just loaded or wrote
// (every write invalidates the day query), and schedules the OS-driven refresh for when the app is closed.
export function WidgetSync() {
  const { today, habits } = useSession()
  const items = useDay(today).data?.items

  useEffect(() => {
    if (items) pushWidget(buildWidgetProps(today, habits, items))
  }, [today, habits, items])

  useEffect(() => {
    void registerWidgetRefresh()
  }, [])

  return null
}
