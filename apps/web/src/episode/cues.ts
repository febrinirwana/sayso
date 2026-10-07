export type StageMoment = { live: boolean; secondsLeft: number | undefined };

/** Ticks during the final seconds of pre-roll (DESIGN section 10, `tick`). */
const TICK_FROM_SECONDS = 5;

/**
 * Which sound a clip-stage change should play: `tick` when the displayed pre-roll second
 * drops into 5…1, `start` when playback goes live. Silent on first render and during playback.
 */
export function stageCue(prev: StageMoment | null, next: StageMoment): "tick" | "start" | null {
  if (!prev) return null;
  if (!prev.live && next.live) return "start";
  if (next.live || prev.live || next.secondsLeft === undefined) return null;
  const shown = Math.ceil(next.secondsLeft);
  const before = prev.secondsLeft === undefined ? undefined : Math.ceil(prev.secondsLeft);
  if (shown === before || shown < 1 || shown > TICK_FROM_SECONDS) return null;
  return "tick";
}
