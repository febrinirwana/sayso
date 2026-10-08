import { motion, useReducedMotion } from "motion/react";
import { formatClock } from "./format";

export type SaidMark = { word: string; atSeconds: number };

/**
 * Playback progress along the bottom of the clip, with a red dot where each word was SAID. Only
 * past flags appear, so the bar never hints at a word still to come.
 */
export function ClipTimeline({
  durationSeconds,
  secondsLeft,
  marks = [],
}: {
  durationSeconds: number;
  secondsLeft: number;
  marks?: readonly SaidMark[];
}) {
  const reduce = useReducedMotion() ?? false;
  const elapsed = Math.min(durationSeconds, Math.max(0, durationSeconds - secondsLeft));
  const share = durationSeconds > 0 ? elapsed / durationSeconds : 0;
  return (
    <div
      role="progressbar"
      aria-label="Clip progress"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationSeconds)}
      aria-valuenow={Math.round(elapsed)}
      aria-valuetext={`${formatClock(elapsed)} of ${formatClock(durationSeconds)}`}
      className="relative h-3 w-full rounded-full border-2 border-ink bg-card shadow-[0_2px_0_var(--color-ink)]"
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 block origin-left rounded-full bg-ink"
        initial={false}
        animate={{ scaleX: share }}
        transition={{ duration: reduce ? 0 : 0.3, ease: "linear" }}
      />
      {marks.map((mark) => (
        <motion.span
          key={mark.word}
          aria-hidden
          title={`${mark.word} said at ${formatClock(mark.atSeconds)}`}
          className="absolute top-1/2 block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-said"
          style={{ left: `${Math.min(100, (mark.atSeconds / durationSeconds) * 100)}%` }}
          initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduce ? { duration: 0.15 } : { type: "spring", duration: 0.4, bounce: 0.5 }}
        />
      ))}
    </div>
  );
}
