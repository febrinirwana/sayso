import type { RecordWordState } from "@/screens/results/types";

/** One redeem whose every transaction mined successfully; `amount` is the AUSD paid out. */
export type RedeemConfirmation = { readonly id: number; readonly amount: bigint };

let issued = 0;
let celebrated = 0;

/** A fresh confirmation; ids only grow, so a screen can tell a new redeem from one it has shown. */
export function confirmRedeem(amount: bigint): RedeemConfirmation {
  issued += 1;
  return { id: issued, amount };
}

/**
 * True exactly once per confirmation, however often the screen showing it remounts, so a refetch,
 * a tab switch or a revisit never replays the celebration.
 */
export function claimCelebration(confirmation: RedeemConfirmation): boolean {
  if (confirmation.id <= celebrated) return false;
  celebrated = confirmation.id;
  return true;
}

/** AUSD one `redeem(wordId, amount)` pays: a whole unit per winning share, half per share of a void word. */
export function redeemPayout(state: RecordWordState, amount: bigint): bigint {
  return state === "Void" ? amount / 2n : amount;
}
