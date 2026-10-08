import { ArrowDown, ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { play } from "@/sound";
import { formatHolding } from "./format";
import type { WordCardProps, WordState } from "./WordCard";

const STICK = { type: "spring", duration: 0.45, bounce: 0.5 } as const;

/**
 * "You hold 40 YES", stuck over the card's top-right edge like a label. Pops in (with `pop`) when
 * a fill changes the holding; quiet on first render.
 */
export function HoldingChip({
  position,
  state,
}: {
  position: WordCardProps["position"];
  state: WordState;
}) {
  const reduce = useReducedMotion() ?? false;
  const label = position ? formatHolding(position) : null;
  const previous = useRef(label);
  useEffect(() => {
    if (label !== null && previous.current !== label) {
      const timer = setTimeout(() => play("pop"), 220);
      previous.current = label;
      return () => clearTimeout(timer);
    }
    previous.current = label;
  }, [label]);

  // Settled: a winning holding wears the gain tint, a losing one goes neutral, never red.
  const settled = state === "yes" || state === "no";
  const tone = !settled
    ? "border-ink bg-sun text-ink"
    : position?.side === state
      ? "border-gain bg-gain-tint text-gain"
      : "border-no bg-paper text-ink-soft";

  return (
    <AnimatePresence initial={false}>
      {label ? (
        <motion.span
          key={label}
          aria-hidden
          className={`tabular pointer-events-none absolute -top-3 right-3 z-20 inline-flex h-6 items-center whitespace-nowrap rounded-full border-2 px-2.5 text-[11px] font-bold leading-none shadow-[0_2px_0_var(--color-ink)] @min-[220px]:h-7 @min-[220px]:text-[12px] ${tone}`}
          initial={
            reduce ? { opacity: 0, rotate: 3 } : { opacity: 0, scale: 0.6, y: 8, rotate: -6 }
          }
          animate={{ opacity: 1, scale: 1, y: 0, rotate: 3 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={reduce ? { duration: 0.15 } : { ...STICK, delay: 0.2 }}
        >
          {label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** A "▲ 4¢" tab that peeks over the top-left edge for a moment after the price moves. */
export function PriceDelta({ delta, pulseKey }: { delta: number; pulseKey: number }) {
  const reduce = useReducedMotion() ?? false;
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <AnimatePresence>
      {pulseKey > 0 && delta !== 0 ? (
        <motion.span
          key={pulseKey}
          aria-hidden
          className={`tabular pointer-events-none absolute -top-3 left-3 z-20 inline-flex h-6 items-center gap-0.5 rounded-full border-2 border-ink px-2 text-[12px] font-bold leading-none shadow-[0_2px_0_var(--color-ink)] ${up ? "bg-gain-tint text-gain" : "bg-sun-tint text-ink"}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: [0, 1, 1, 0], y: reduce ? 0 : [6, 0, 0, -4] }}
          transition={{ duration: 1.2, times: [0, 0.12, 0.8, 1], ease: "easeOut" }}
        >
          <Icon aria-hidden size={12} strokeWidth={3} />
          {Math.abs(delta)}¢
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
