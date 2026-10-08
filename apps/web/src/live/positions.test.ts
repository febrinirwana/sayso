import { expect, it } from "vitest";
import { remainingCost } from "./positions";

it("keeps average entry cost on partial sales rather than treating sale proceeds as cost", () => {
  const trades = [
    { player_id: "0xabc", word_id: "1", side: 0, tokenAmount: "10000000", ausdAmount: "5000000" },
    { player_id: "0xabc", word_id: "1", side: 1, tokenAmount: "4000000", ausdAmount: "3920000" },
  ];
  expect(remainingCost(trades, "0xabc", 1n, "yes", 6_000_000n)).toBe(3_000_000n);
  expect(remainingCost(trades, "0xabc", 1n, "yes", 7_000_000n)).toBeNull();
});
