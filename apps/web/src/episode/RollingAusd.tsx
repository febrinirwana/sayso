import {
  type AnimationPlaybackControls,
  animate,
  cancelFrame,
  frame,
  useReducedMotion,
} from "motion/react";
import { useEffect, useRef } from "react";
import { formatAusdAmount } from "./format";
import { EASE_OUT } from "./settle";

/**
 * A two-decimal AUSD amount (no unit) that counts to its new value when it changes: the balance
 * counting up as cash-out coins land (DESIGN section 6, 0.8 s). Exact once it lands; animates in
 * float only between whole cents, so precision loss never reaches the final figure.
 */
export function RollingAusd({
  micro,
  className,
  duration = 0.8,
}: {
  micro: bigint;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(micro);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    const el = ref.current;
    if (!el || shown.current === micro) return;
    const target = micro;
    const write = (value: bigint) => {
      shown.current = value;
      el.textContent = formatAusdAmount(value);
    };
    if (reduce) {
      write(target);
      return;
    }
    const fromCents = Number(shown.current / 10_000n);
    const toCents = Number(target / 10_000n);
    let controls: AnimationPlaybackControls | undefined;
    const start = () => {
      controls = animate(fromCents, toCents, {
        duration,
        ease: EASE_OUT,
        onUpdate: (cents) => write(BigInt(Math.round(cents)) * 10_000n),
        onComplete: () => write(target),
      });
    };
    frame.update(start);
    return () => {
      cancelFrame(start);
      controls?.stop();
    };
  }, [micro, reduce, duration]);

  return (
    <span ref={ref} className={className}>
      {formatAusdAmount(shown.current)}
    </span>
  );
}
