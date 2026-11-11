import { useEffect, useRef } from "react"
import { motion } from "motion/react"
import { useSession, useStatuses } from "@/lib/data"
import { addDays, dayOfMonth, weekday, WEEKDAYS } from "@/lib/rules"
import { cn } from "@/lib/utils"

export function DayStrip({ selected, onSelect }: { selected: string; onSelect: (day: string) => void }) {
  const { today, habits } = useSession()
  const statusOf = useStatuses()
  const ref = useRef<HTMLDivElement>(null)
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i - 14))

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-selected=true]")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
  }, [selected])

  return (
    <div className="flow-root">
    <div ref={ref} className="no-scrollbar -mx-4 -my-4 flex snap-x gap-2 overflow-x-auto px-4 py-4">
      {days.map((day) => {
        const statuses = habits.map((h) => statusOf(h.id, day)).filter((s) => s !== "not_due")
        const done = statuses.filter((s) => s === "done").length
        const isSelected = day === selected
        const isFuture = day > today
        return (
          <button
            key={day}
            data-selected={isSelected}
            onClick={() => onSelect(day)}
            className={cn(
              "relative flex w-12 shrink-0 snap-center flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors",
              isFuture ? "text-muted-foreground/60" : "text-muted-foreground",
              isSelected && "text-primary-foreground",
            )}
          >
            {isSelected && (
              <motion.span
                layoutId="day-pill"
                className="absolute inset-0 rounded-2xl bg-primary shadow-[0_0_24px_-4px] shadow-primary/60"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative text-[11px] font-medium capitalize">{WEEKDAYS[weekday(day)]}</span>
            <span className={cn("relative text-lg font-semibold tabular-nums", !isSelected && !isFuture && "text-foreground")}>
              {dayOfMonth(day)}
            </span>
            <span className="relative h-1 w-6 overflow-hidden rounded-full bg-white/15">
              {!isFuture && statuses.length > 0 && (
                <span
                  className={cn("block h-full rounded-full", isSelected ? "bg-primary-foreground" : "bg-primary")}
                  style={{ width: `${(100 * done) / statuses.length}%` }}
                />
              )}
            </span>
          </button>
        )
      })}
    </div>
    </div>
  )
}
