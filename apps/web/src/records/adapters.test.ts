import { leafHash, merkleProof, merkleRoot, nicknameOf, type Token } from "@sayso/core";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  leaderboardRows,
  profitFromPosition,
  profitFromTrades,
  redeemableAmount,
  redemptionAmounts,
  verifyChunk,
} from "./adapters";

const address = "0x0000000000000000000000000000000000000001";
describe("winning chain balances", () => {
  it.each([
    ["Yes", 5n],
    ["No", 3n],
    ["Void", 3n],
    ["Open", 0n],
    ["SaidPending", 0n],
  ] as const)("pays only the final %s side", (state, expected) => {
    expect(redeemableAmount(state, 5n, 3n)).toBe(expected);
  });
  it("floors each odd Void side independently and burns YES first", () => {
    expect(redeemableAmount("Void", 3n, 3n)).toBe(2n);
    expect(redemptionAmounts("Void", 3n, 3n)).toEqual([3n, 3n]);
    expect(redemptionAmounts("Yes", 5n, 3n)).toEqual([5n]);
  });
});
it("accounts for buys, cash-outs, past redemption and remaining winning value", () => {
  const trades = [
    { side: 0, ausdAmount: 2_000_000n },
    { side: 2, ausdAmount: 1_000_000n },
    { side: 1, ausdAmount: 1_500_000n },
    { side: 3, ausdAmount: 400_000n },
  ];
  expect(profitFromTrades(trades, 500_000n, 2_000_000n)).toBe(1_400_000n);
  expect(profitFromTrades([], 0n, 0n)).toBe(0n);
});
describe("indexed position profit", () => {
  it.each([
    [1_921_500n, 1_000_000n, 0n, 0n, 921_500n],
    [2_000_000n, 1_000_000n, 2_000_000n, 0n, 1_000_000n],
    [1_000_000n, 1_000_000n, 1_000_000n, 1_000_000n, 1_000_000n],
    [0n, 1_000_000n, 0n, 0n, -1_000_000n],
  ])(
    "counts cash received %s minus cash spent %s without adding redeemed %s twice",
    (cashIn, cashOut, redeemed, remainingValue, expected) => {
      const position = { cashIn, cashOut, redeemed };
      expect(profitFromPosition(position, remainingValue)).toBe(expected);
    },
  );
});
describe("revealed proof verification", () => {
  const clipId = `0x${"ab".repeat(32)}` as Hex;
  const tokens: Token[] = [["markets", 100, 200]];
  const leaf = leafHash(clipId, "A", 0, 0, 10000, tokens);
  const other = leafHash(clipId, "A", 1, 10000, 20000, []);
  const root = merkleRoot([leaf, other]);
  const chunk = {
    clipId,
    engine: "A",
    index: 0,
    startMs: 0,
    endMs: 10000,
    tokens,
    leaf,
    proof: merkleProof([leaf, other], 0),
  };
  it("accepts a chunk against its onchain root", () => {
    expect(verifyChunk(chunk, { clipId, engine: "A", index: 0, root }).tokens).toEqual(tokens);
  });
  it("rejects a tampered token before exposing it", () => {
    expect(() =>
      verifyChunk(
        { ...chunk, tokens: [["different", 100, 200]] },
        { clipId, engine: "A", index: 0, root },
      ),
    ).toThrow();
  });
  it("rejects the wrong requested chunk even with a valid proof", () => {
    expect(() => verifyChunk(chunk, { clipId, engine: "B", index: 0, root })).toThrow();
  });
});
it("maps deterministic nicknames and profit ranks without inventing rank changes", () => {
  const rows = leaderboardRows([
    { address, profit: 12n, trades: 3 },
    { address: "0x0000000000000000000000000000000000000002", profit: -2n, trades: 1 },
  ]);
  expect(rows[0]).toMatchObject({
    id: address,
    nickname: nicknameOf(address),
    profit: 12n,
    trades: 3,
    rank: 1,
    previousRank: null,
  });
  expect(rows[1]?.rank).toBe(2);
  expect(leaderboardRows([{ address, profit: 12n, trades: 3, rank: 7 }])[0]?.rank).toBe(7);
});
