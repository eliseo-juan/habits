export type WidgetHabit = { id: number; name: string; icon: string; color: string; done: boolean; progress: string | null }

export type WidgetProps = {
  signedIn: boolean
  date: string
  done: number
  total: number
  habits: WidgetHabit[]
}

export const EMPTY_WIDGET: WidgetProps = { signedIn: false, date: "", done: 0, total: 0, habits: [] }
