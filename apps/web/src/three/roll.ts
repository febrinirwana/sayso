import { useEffect, useRef } from "react";
import { easeInOutCubic } from "./camera";
import { onSignal, type StageSignal } from "./registry";

/** DESIGN section 7: one full turn over a second, locked while spinning. */
export const ROLL_SECONDS = 1;

export type Roll = {
  /** Requests a roll; ignored while one is running. Resolved on the next frame. */
  request(): void;
  /** Roll angle at clock time `t` (0 to 2π); starts a pending roll. */
  angle(t: number): number;
  /** 0 to 1 progress of the running roll, or -1 when idle. */
  progress(t: number): number;
};

/** A barrel roll driven from `useFrame`, started by `request()` or by `signals` sent to `slotId`. */
export function useRoll(slotId?: string, signals: readonly StageSignal[] = ["roll"]): Roll {
  const state = useRef({ start: Number.NEGATIVE_INFINITY, pending: false });
  const roll = useRef<Roll>({
    request() {
      state.current.pending = true;
    },
    progress(t) {
      const s = state.current;
      if (s.pending) {
        s.pending = false;
        if (t - s.start >= ROLL_SECONDS) s.start = t;
      }
      const p = (t - s.start) / ROLL_SECONDS;
      return p >= 0 && p < 1 ? p : -1;
    },
    angle(t) {
      const p = this.progress(t);
      return p < 0 ? 0 : easeInOutCubic(p) * Math.PI * 2;
    },
  }).current;
  const key = signals.join();
  useEffect(() => {
    if (!slotId) return;
    const wanted = key.split(",");
    return onSignal(slotId, (signal) => {
      if (wanted.includes(signal)) roll.request();
    });
  }, [slotId, key, roll]);
  return roll;
}
