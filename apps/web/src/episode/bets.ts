import { TRADING_CLOSE_LEAD_MS } from "@sayso/core";
import { MAX_PICKED_WORDS, type TradingWindow } from "@/live/model";
import { formatClock } from "./format";

/** How the board, the stage and the ticket tell the player where the bets window stands. */
export type BetsView = {
  tone: "open" | "closing" | "locked";
  /** Board caption. */
  caption: string;
  /** Seconds until bets close, only while they are open. */
  closesInSeconds: number | undefined;
  /** Why an open word cannot take a bet; undefined while bets are open. */
  lockedReason: string | undefined;
};

/** Below this many seconds the countdown turns urgent. */
const CLOSING_SECONDS = 10;
const LEAD_SECONDS = TRADING_CLOSE_LEAD_MS / 1_000;

export function betsView(trading: TradingWindow, clipOver: boolean): BetsView {
  if (trading.status === "open") {
    const seconds = trading.closesInMs / 1_000;
    return {
      tone: seconds <= CLOSING_SECONDS ? "closing" : "open",
      caption: `Bets close in ${formatClock(seconds)} · tap a word`,
      closesInSeconds: seconds,
      lockedReason: undefined,
    };
  }
  if (trading.status === "unsynced")
    return {
      tone: "locked",
      caption: "Syncing the studio clock",
      closesInSeconds: undefined,
      lockedReason: "Bets wait for the studio clock, so nobody can slip one in after kickoff.",
    };
  return {
    tone: "locked",
    caption: clipOver ? "Clip over · results next" : "Bets locked · watch",
    closesInSeconds: undefined,
    lockedReason: clipOver
      ? `Bets closed ${LEAD_SECONDS} s before kickoff. The clip is over; this word settles next.`
      : `Bets closed ${LEAD_SECONDS} s before kickoff, so nobody bets on what they hear. If it's said, YES cashes out right here.`,
  };
}

/**
 * The "2/3 words picked" counter. Only while bets are open (it is about opening positions), and
 * only once the count is known: a half-loaded count would read low and invite a fourth word.
 */
export function picksLabel(bets: BetsView, picked: number, known: boolean): string | undefined {
  if (bets.closesInSeconds === undefined || !known) return undefined;
  return `${Math.min(picked, MAX_PICKED_WORDS)}/${MAX_PICKED_WORDS} words picked`;
}
