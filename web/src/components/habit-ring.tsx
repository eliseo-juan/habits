import { Check, Minus, X } from "lucide-react"
import { motion } from "motion/react"
import type { Status } from "@/lib/rules"
import { cn } from "@/lib/utils"

type Props = {
  status: Status
  count: number
  target: number
  color: string
  size?: number
  className?: string
}

export function HabitRing({ status, count, target, color, size = 44, className }: Props) {
  const stroke = 3
  const radius = size / 2 - stroke
  const fraction = status === "done" ? 1 : status === "slipped" ? 0 : Math.min(1, count / target)
  const label =
    status === "done" ? (
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
        <Check className="size-5 text-white" strokeWidth={3} />
      </motion.span>
    ) : status === "skipped" ? (
      <Minus className="size-4 text-muted-foreground" />
    ) : status === "failed" ? (
      <X className="size-4 text-rose-400" />
    ) : status === "slipped" ? (
      <span className="block size-2 rounded-full bg-amber-400" />
    ) : target > 1 && count > 0 ? (
      <span className="text-[11px] font-semibold tabular-nums">
        {count}/{target}
      </span>
    ) : null

  return (
    <span
      className={cn("relative grid shrink-0 place-items-center rounded-full transition-shadow", className)}
      style={{ width: size, height: size, boxShadow: status === "done" ? `0 0 16px -2px ${color}` : undefined }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={status === "failed" ? "stroke-rose-500/40" : status === "slipped" ? "stroke-amber-400/50" : "stroke-white/10"}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill={status === "done" ? color : "transparent"}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: fraction, fillOpacity: status === "done" ? 1 : 0, strokeOpacity: fraction > 0 ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        />
      </svg>
      <span className="relative">{label}</span>
    </span>
  )
}
