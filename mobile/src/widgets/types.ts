// progress: "" when the habit is once a day (nulls do not survive the trip to native widget storage).
// reminder: "HH:MM" of the next reminder still to be sent today, "" if none (or the habit is already done).
// streak: the current streak in days, only on today's rows (0 elsewhere).
export type WidgetHabit = { id: number; name: string; icon: string; color: string; done: boolean; priority: number; progress: string; fraction: number; subtitle: string; reminder: string; streak: number }

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
  // The last days up to today, oldest first, for the Android widget's day switcher. The widget shows
  // `selectedDate` until `selectedUntil` (epoch ms, as a string), then today again: its arrows set both without the
  // app, five minutes ahead, and the provider schedules a redraw for then. Pushes from the app select today ("")
  // unless they come from a day sheet the widget opened for an earlier day.
  days: WidgetDay[]
  selectedDate: string
  selectedUntil: string
}

export const EMPTY_WIDGET: WidgetProps = { signedIn: false, date: "", done: 0, total: 0, habits: [], avoid: [], days: [], selectedDate: "", selectedUntil: "0" }
