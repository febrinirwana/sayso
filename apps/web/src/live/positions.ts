import type { Side } from "@/episode/quote";

type BasisTrade = {
  player_id: string;
  word_id: string;
  side: number;
  tokenAmount: string;
  ausdAmount: string;
};
/** Average cost of remaining shares, unavailable when transfers/redemptions or indexer lag disagree with chain. */
export function remainingCost(
  trades: readonly BasisTrade[],
  address: string,
  wordId: bigint,
  side: Side,
  balance: bigint,
): bigint | null {
  let shares = 0n;
  let cost = 0n;
  const buySide = side === "yes" ? 0 : 2;
  for (const trade of trades) {
    if (trade.player_id.toLowerCase() !== address.toLowerCase() || trade.word_id !== String(wordId))
      continue;
    const amount = BigInt(trade.tokenAmount);
    if (trade.side === buySide) {
      shares += amount;
      cost += BigInt(trade.ausdAmount);
    } else if (trade.side === buySide + 1) {
      if (amount > shares) return null;
      cost = shares === 0n ? 0n : cost - (cost * amount) / shares;
      shares -= amount;
    }
  }
  return shares === balance ? cost : null;
}
