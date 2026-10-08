/** Hero sample board. Pure sequence so the flip order reads as a round, not as noise. */
export const TICKER_WORDS = ["MOON", "PIZZA", "CHAMPION", "LEGENDARY", "OOPS", "TACO"] as const;

/** Words said before the board resets; two always stay open, like a real round's decoys. */
export const TICKER_SAID_MAX = 4;

/** Flip order across rounds: each round starts somewhere new. */
const ORDER = [1, 3, 0, 5, 2, 4] as const;

/**
 * The board after one more step: the next open word in `ORDER` flips SAID; a full board resets to
 * all open. `round` picks where in `ORDER` this round starts.
 */
export function nextTicker(said: readonly number[], round: number): number[] {
  if (said.length >= TICKER_SAID_MAX) return [];
  const start = (round * 2) % ORDER.length;
  for (let k = 0; k < ORDER.length; k++) {
    const index = ORDER[(start + k) % ORDER.length] as number;
    if (!said.includes(index)) return [...said, index];
  }
  return [];
}
