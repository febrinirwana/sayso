import { describe, expect, it } from "vitest";
import { nextTicker, TICKER_SAID_MAX, TICKER_WORDS } from "./ticker";

describe("hero word ticker", () => {
  it("flips one new word per step and never repeats one within a round", () => {
    let said: number[] = [];
    for (let step = 1; step <= TICKER_SAID_MAX; step++) {
      const next = nextTicker(said, 0);
      expect(next).toHaveLength(step);
      expect(new Set(next).size).toBe(step);
      expect(next.slice(0, -1)).toEqual(said);
      said = next;
    }
  });

  it("leaves decoys open, then resets the whole board", () => {
    let said: number[] = [];
    for (let step = 0; step < TICKER_SAID_MAX; step++) said = nextTicker(said, 3);
    expect(TICKER_WORDS.length - said.length).toBeGreaterThanOrEqual(2);
    expect(nextTicker(said, 3)).toEqual([]);
  });

  it("opens each round on a different word", () => {
    const firsts = [0, 1, 2].map((round) => nextTicker([], round)[0]);
    expect(new Set(firsts).size).toBe(3);
  });
});
