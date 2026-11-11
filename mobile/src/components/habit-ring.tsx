import { useEffect } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated"
import Svg, { Circle } from "react-native-svg"
import { Ionicons } from "@expo/vector-icons"
import type { Status } from "@/lib/rules"
import { colors, motion } from "@/theme"

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

type Props = { status: Status; count: number; target: number; color: string; size?: number }

export function HabitRing({ status, count, target, color, size = 44 }: Props) {
  const stroke = 3
  const radius = size / 2 - stroke
  const circumference = 2 * Math.PI * radius
  const fraction = status === "done" ? 1 : status === "slipped" ? 0 : Math.min(1, count / target)
  const progress = useSharedValue(fraction)
  const filled = useSharedValue(status === "done" ? 1 : 0)

  useEffect(() => {
    progress.value = withTiming(fraction, { duration: motion.duration, easing: Easing.out(Easing.cubic) })
    filled.value = withTiming(status === "done" ? 1 : 0, { duration: 200 })
  }, [fraction, status, progress, filled])

  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
    strokeOpacity: progress.value > 0.001 ? 1 : 0,
    fillOpacity: filled.value,
  }))

  const track = status === "failed" ? "rgba(244,63,94,0.4)" : status === "slipped" ? "rgba(251,191,36,0.5)" : colors.white20
  const iconSize = size > 60 ? 28 : 20

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", ...(status === "done" ? { shadowColor: color, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } } : null) }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: "-90deg" }] }]}>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill={color}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={arc}
        />
      </Svg>
      {status === "done" ? (
        <Ionicons name="checkmark" size={iconSize} color="#fff" />
      ) : status === "skipped" ? (
        <Ionicons name="remove" size={16} color={colors.mutedForeground} />
      ) : status === "failed" ? (
        <Ionicons name="close" size={16} color="#fb7185" />
      ) : status === "slipped" ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fbbf24" }} />
      ) : target > 1 && count > 0 ? (
        <Text style={{ fontSize: size > 60 ? 16 : 11, fontWeight: "600", color: colors.foreground }}>
          {count}/{target}
        </Text>
      ) : null}
    </View>
  )
}
