import { createContext } from "react";

/** Seconds a card waits before its settle animation, so a board settles as a 40 ms wave. */
export const SettleDelayContext = createContext(0);

export const SETTLE_STAGGER = 0.04;
export const SETTLE_DURATION = 0.24;
export const REDUCED_FADE = 0.15;
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
