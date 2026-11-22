export type WidgetHabit = { id: number; name: string; icon: string; color: string; done: boolean; priority: number; progress: string; fraction: number; subtitle: string }  // "" when the habit is once a day: nulls do not survive the trip to native widget storage

export type WidgetProps = {
  signedIn: boolean
  date: string
  done: number
  total: number
  habits: WidgetHabit[]
  // Habits to avoid (kind "limit"), shown under their own label on Android.
  avoid: WidgetHabit[]
}

export const EMPTY_WIDGET: WidgetProps = { signedIn: false, date: "", done: 0, total: 0, habits: [], avoid: [] }
