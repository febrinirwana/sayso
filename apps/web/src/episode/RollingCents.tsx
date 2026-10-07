import {
  type AnimationPlaybackControls,
  animate,
  cancelFrame,
  frame,
  useReducedMotion,
} from "motion/react";
import { useEffect, useRef } from "react";
import { formatCents } from "./format";
import { EASE_OUT } from "./settle";

const ROLL = { duration: 0.18, ease: EASE_OUT } as const;

/** A cents price that counts through each 1¢ step when it changes (DESIGN section 6). */
export function RollingCents({ cents, className }: { cents: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(cents);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    const el = ref.current;
    if (!el || shown.current === cents) return;
    const write = (value: number) => {
      shown.current = value;
      el.textContent = formatCents(value);
    };
    if (reduce) {
      write(cents);
      return;
    }
    // Start inside the next frame so a slow commit cannot swallow the roll.
    let controls: AnimationPlaybackControls | undefined;
    const start = () => {
      controls = animate(shown.current, cents, {
        ...ROLL,
        onUpdate: (value) => write(Math.round(value)),
        onComplete: () => write(cents),
      });
    };
    frame.update(start);
    return () => {
      cancelFrame(start);
      controls?.stop();
    };
  }, [cents, reduce]);

  return (
    <span ref={ref} className={className}>
      {formatCents(shown.current)}
    </span>
  );
}
