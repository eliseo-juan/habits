// progress: "" when the habit is once a day (nulls do not survive the trip to native widget storage).
// reminder: "HH:MM" of the next reminder still to be sent today, "" if none (or the habit is already done).
export type WidgetHabit = { id: number; name: string; icon: string; color: string; done: boolean; priority: number; progress: string; fraction: number; subtitle: string; reminder: string }

// One day the Android widget can show: its habits to do and, under their own label, those to avoid (kind "limit").
export type WidgetDay = { date: string; label: string; habits: WidgetHabit[]; avoid: WidgetHabit[] }

export type WidgetProps = {
  signedIn: boolean
  // Today, as the iOS widget shows it.
  date: string
  done: number
  total: number
  habits: WidgetHabit[]
  avoid: WidgetHabit[]
  // The last days up to today, oldest first, for the Android widget's day switcher; `selected` indexes the one on
  // screen. Every push from the app selects today; the widget's arrows change it without the app.
  days: WidgetDay[]
  selected: number
}

export const EMPTY_WIDGET: WidgetProps = { signedIn: false, date: "", done: 0, total: 0, habits: [], avoid: [], days: [], selected: 0 }
