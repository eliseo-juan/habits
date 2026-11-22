import { router, useLocalSearchParams } from "expo-router"
import { DaySheet } from "@/components/day-sheet"

export default function DaySheetScreen() {
  const { habitId, day } = useLocalSearchParams<{ habitId: string; day?: string }>()
  return <DaySheet habitId={habitId} day={day} onClose={() => router.back()} />
}
