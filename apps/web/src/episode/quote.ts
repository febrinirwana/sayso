/**
 * Ticket preview maths (S4). Pure; prices in whole cents, money in 6-decimal AUSD units, shares in
 * 6-decimal outcome-token units. Every share pays exactly 1 AUSD if its side wins (PRD 5.2), so a
 * payout in AUSD units equals the share count in token units. Rounding always favours showing the
 * player less, never more, than the chain will give them.
 */

export type Side = "yes" | "no";

const MICRO = 1_000_000n;

/** Amount presets on the ticket, 6-decimal AUSD units: 1, 5, 10 and 25 AUSD. */
export const AMOUNT_PRESETS_MICRO: readonly bigint[] = [1n, 5n, 10n, 25n].map((a) => a * MICRO);

/** The house's disclosed bid for YES on every SAID word (PRD section 5), in cents. */
export const SAID_BID_CENTS = 98;

/** Cents for one share of a side: YES costs the YES price, NO costs its complement (PRD 5.2). */
export function sideCents(side: Side, yesCents: number): number {
  return side === "yes" ? yesCents : 100 - yesCents;
}

export type BuyQuote = {
  side: Side;
  /** Cents per share on the chosen side. */
  priceCents: number;
  costMicro: bigint;
  /** Shares received, 6-decimal units, rounded down. */
  sharesMicro: bigint;
  /** AUSD paid if the side wins: one AUSD per share. */
  payoutMicro: bigint;
  /** Payout minus cost. */
  profitMicro: bigint;
};

/**
 * What spending `amountMicro` on `side` buys at the shown YES price. `null` when nothing can be
 * bought: a side priced 0¢ or 100¢ has no seller, and an empty amount has no ticket.
 */
export function buyQuote(side: Side, yesCents: number, amountMicro: bigint): BuyQuote | null {
  const priceCents = sideCents(side, yesCents);
  if (priceCents <= 0 || priceCents >= 100 || amountMicro <= 0n) return null;
  const sharesMicro = (amountMicro * 100n) / BigInt(priceCents);
  return {
    side,
    priceCents,
    costMicro: amountMicro,
    sharesMicro,
    payoutMicro: sharesMicro,
    profitMicro: sharesMicro - amountMicro,
  };
}

/** Outcome-token shares as 6-decimal units, rounded down. */
export function sharesToMicro(shares: number): bigint {
  if (!Number.isFinite(shares) || shares < 0) {
    throw new RangeError(`shares must be a finite non-negative number, got ${shares}`);
  }
  return BigInt(Math.floor(shares * 1_000_000 + 1e-6));
}

/** What `shares` are worth sold at `bidCents`, 6-decimal AUSD units, rounded down. */
export function saleValueMicro(shares: number, bidCents: number): bigint {
  return (sharesToMicro(shares) * BigInt(bidCents)) / 100n;
}

/** Whole outcome-token shares from 6-decimal units, for display through `formatShares`. */
export function sharesFromMicro(sharesMicro: bigint): number {
  return Number(sharesMicro) / 1_000_000;
}
