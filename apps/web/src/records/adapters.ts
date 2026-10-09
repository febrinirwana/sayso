import {
  CHUNK_MS,
  canonicalTokensJson,
  leafHash,
  nicknameOf,
  PRICE_PRECISION,
  type Token,
  verifyProof,
} from "@sayso/core";
import type { Hex } from "viem";
import type {
  LeaderboardEntry,
  RecordWordState,
  TranscriptEvidence,
} from "@/screens/results/types";

export function redeemableAmount(state: RecordWordState, yes: bigint, no: bigint): bigint {
  if (state === "Yes") return yes;
  if (state === "No") return no;
  if (state === "Void") return yes / 2n + no / 2n;
  return 0n;
}
/** Void chooses YES whenever it covers amount: exhaust YES before requesting NO. */
export function redemptionAmounts(state: RecordWordState, yes: bigint, no: bigint): bigint[] {
  const amounts =
    state === "Yes" ? [yes] : state === "No" ? [no] : state === "Void" ? [yes, no] : [];
  return amounts.filter((amount) => amount > 0n);
}
export function profitFromTrades(
  trades: readonly { side: number; ausdAmount: bigint }[],
  redeemed: bigint,
  remainingValue: bigint,
): bigint {
  return trades.reduce(
    (sum, trade) =>
      sum + (trade.side === 0 || trade.side === 2 ? -trade.ausdAmount : trade.ausdAmount),
    redeemed + remainingValue,
  );
}
/** Envio cashIn includes sells, burns and redemptions; redeemed is a subtotal, not extra cash. */
export function profitFromPosition(
  position: { cashIn: bigint; cashOut: bigint },
  remainingValue: bigint,
): bigint {
  return position.cashIn - position.cashOut + remainingValue;
}
export function averagePrice(
  trades: readonly { side: number; tokenAmount: bigint; ausdAmount: bigint }[],
  side: 0 | 2,
): number | null {
  const buys = trades.filter((trade) => trade.side === side);
  const quantity = buys.reduce((sum, trade) => sum + trade.tokenAmount, 0n);
  return quantity === 0n
    ? null
    : Number(
        (buys.reduce((sum, trade) => sum + trade.ausdAmount, 0n) * BigInt(PRICE_PRECISION)) /
          quantity,
      );
}
export function leaderboardRows(
  rows: readonly { address: string; profit: bigint; trades: number; rank?: number }[],
): LeaderboardEntry[] {
  return rows.map((row, index) => ({
    id: row.address.toLowerCase(),
    nickname: nicknameOf(row.address),
    profit: row.profit,
    trades: row.trades,
    rank: row.rank ?? index + 1,
    previousRank: null,
    avatar: "duck",
  }));
}
const hash = /^0x[0-9a-fA-F]{64}$/;
export function verifyChunk(
  payload: unknown,
  expected: { clipId: Hex; engine: "A" | "B"; index: number; root: Hex },
): TranscriptEvidence {
  if (!payload || typeof payload !== "object") throw new Error("Invalid transcript payload");
  const chunk = payload as Record<string, unknown>;
  if (
    chunk.clipId !== expected.clipId ||
    chunk.engine !== expected.engine ||
    chunk.index !== expected.index ||
    chunk.startMs !== expected.index * CHUNK_MS ||
    chunk.endMs !== (expected.index + 1) * CHUNK_MS ||
    !Array.isArray(chunk.tokens) ||
    !Array.isArray(chunk.proof) ||
    typeof chunk.leaf !== "string" ||
    !hash.test(chunk.leaf) ||
    !chunk.proof.every((entry) => typeof entry === "string" && hash.test(entry))
  )
    throw new Error("Invalid transcript chunk");
  const tokens = chunk.tokens as Token[];
  if (
    !tokens.every(
      (token) =>
        Array.isArray(token) &&
        token.length === 3 &&
        typeof token[0] === "string" &&
        Number.isSafeInteger(token[1]) &&
        Number.isSafeInteger(token[2]) &&
        token[1] >= expected.index * CHUNK_MS &&
        token[1] < (expected.index + 1) * CHUNK_MS &&
        token[2] >= token[1],
    )
  )
    throw new Error("Invalid transcript tokens");
  canonicalTokensJson(tokens);
  const leaf = leafHash(
    expected.clipId,
    expected.engine,
    expected.index,
    chunk.startMs as number,
    chunk.endMs as number,
    tokens,
  );
  if (
    leaf.toLowerCase() !== chunk.leaf.toLowerCase() ||
    !verifyProof(leaf, chunk.proof as Hex[], expected.root)
  )
    throw new Error("Transcript proof does not match the onchain commitment");
  return {
    engine: expected.engine,
    index: expected.index,
    startMs: chunk.startMs as number,
    endMs: chunk.endMs as number,
    tokens,
    leaf,
    proof: chunk.proof as Hex[],
    root: expected.root,
  };
}
