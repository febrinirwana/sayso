import { MAX_SIZE, MIN_SIZE, tradingClosesAtMs } from "@sayso/core";
import type { WordState as ChainState } from "@/data/chain";
import { buyQuote, type Side } from "@/episode/quote";
import type { TicketStatus } from "@/episode/Ticket";
import type { WordState } from "@/episode/WordCard";
import type { BookQuote } from "./readers";

export const PRESENTATION_DELAY_MS = 1_500;
// VPS studio flag_plan/chunks, 2026-10-22, n=17, later-engine end minus chain offset:
// min 300, median 560, p90 1,120, max 1,660 ms. Use p90 to finish most words without
// delaying every flip by the sample's worst case. This is presentation only, not flag timing.
export const HEARD_MARGIN_MS = 1_120;
// Two seconds gives resync ten 200 ms ticks, but never indefinitely withholds cash-out.
export const MAX_PRESENTATION_HOLD_MS = 2_000;

type Presentation = {
  playheadMs: number | null;
  closed?: boolean;
  alreadySaid?: boolean;
};
export function presentationState(
  state: ChainState,
  startsAtMs: number,
  offsetMs: number | undefined,
  nowMs: number | null,
  presentation?: Presentation,
): WordState {
  if (state === "Yes") return "yes";
  if (state === "No") return "no";
  if (state === "Void") return "void";
  if (offsetMs === undefined) return "open";
  if (presentation?.closed || presentation?.alreadySaid) return "said";
  const heardAtMs = offsetMs + HEARD_MARGIN_MS;
  const clockDueMs = startsAtMs + heardAtMs + PRESENTATION_DELAY_MS;
  // An ahead player must meet both deadlines; no media uses only the studio deadline.
  if (nowMs === null || nowMs < clockDueMs) return "open";
  const playhead = presentation?.playheadMs;
  return playhead == null || playhead >= heardAtMs || nowMs >= clockDueMs + MAX_PRESENTATION_HOLD_MS
    ? "said"
    : "open";
}

/**
 * A card's YES price in cents, or null when there is no honest one. Settled words pay out; a SAID
 * word is worth the house cash-out bid alone, never a trade from before the flag; an open word
 * shows the ask, then the bid, then the last trade.
 */
export function cardPrice(
  state: WordState,
  book: BookQuote | undefined,
  lastYes: number | null,
): number | null {
  if (state === "yes") return 100;
  if (state === "no") return 0;
  if (state === "void") return 50;
  if (state === "said") return book?.bid ?? null;
  return book?.ask ?? book?.bid ?? lastYes;
}

/**
 * The bets window on the studio clock. New positions open only before the clip: they close
 * `TRADING_CLOSE_LEAD_MS` before startsAt, the instant the house pulls its quotes. Without a
 * synchronized clock nobody can show the window is still open, so it reads unsynced, never open.
 */
export type TradingWindow =
  | { status: "open"; closesInMs: number }
  | { status: "closed" }
  | { status: "unsynced" };

export function tradingWindow(
  nowMs: number | null,
  startsAtMs: number,
  episodeClosed: boolean,
): TradingWindow {
  if (episodeClosed) return { status: "closed" };
  if (nowMs === null) return { status: "unsynced" };
  const closesInMs = tradingClosesAtMs(startsAtMs) - nowMs;
  return closesInMs > 0 ? { status: "open", closesInMs } : { status: "closed" };
}

/** What a word's ticket offers: bets while the window is open, the SAID cash-out, or nothing. */
export type WordAction = "trade" | "cashout" | "locked" | "settled";

export function wordAction(state: WordState, trading: TradingWindow): WordAction {
  if (state === "said") return "cashout";
  if (state === "open") return trading.status === "open" ? "trade" : "locked";
  return "settled";
}

/** Buys need an open window; a sell is a cash-out of a SAID word or an exit before the close. */
export function canTrade(action: WordAction, order: "buy" | "sell"): boolean {
  return action === "trade" || (action === "cashout" && order === "sell");
}

/** Owner rule, enforced in the UI only: a player opens positions on at most this many words. */
export const MAX_PICKED_WORDS = 3;

type PickHolding = { wordId: bigint; yes: bigint; no: bigint };
type PickTrade = { word_id: string; player_id: string; side: number; tokenAmount: string };

/**
 * The episode words this player has picked: chain holdings on either side, indexed buys by this
 * address that actually filled (side 0 is buy YES, 2 is buy NO; the contract also emits zero-fill
 * `Traded` events for no-op buys, which do not count), and buys confirmed in this page session
 * while the indexer lags. A sell or cash-out never frees a slot, and other players' trades never
 * count.
 */
export function pickedWords(input: {
  episodeWordIds: readonly bigint[];
  holdings: readonly PickHolding[];
  trades: readonly PickTrade[];
  address: string | null | undefined;
  sessionBuys: ReadonlySet<string>;
}): Set<string> {
  const inEpisode = new Set(input.episodeWordIds.map(String));
  const picked = new Set<string>();
  for (const holding of input.holdings)
    if (holding.yes > 0n || holding.no > 0n) picked.add(String(holding.wordId));
  const me = input.address?.toLowerCase();
  if (me)
    for (const trade of input.trades)
      if (
        (trade.side === 0 || trade.side === 2) &&
        trade.player_id.toLowerCase() === me &&
        BigInt(trade.tokenAmount) > 0n
      )
        picked.add(trade.word_id);
  for (const wordId of input.sessionBuys) picked.add(wordId);
  for (const wordId of picked) if (!inEpisode.has(wordId)) picked.delete(wordId);
  return picked;
}

/** Session fills are kept per account and episode, so switching accounts back and forth keeps them. */
export type SessionBuys = ReadonlyMap<string, ReadonlySet<string>>;

export function sessionBuyKey(address: string | null | undefined, episodeId: number): string {
  return `${address?.toLowerCase()}:${episodeId}`;
}

export function recordSessionBuy(previous: SessionBuys, key: string, wordId: bigint): SessionBuys {
  const next = new Map(previous);
  next.set(key, new Set(previous.get(key)).add(String(wordId)));
  return next;
}

export type BuyPermission = "allowed" | "locked" | "limit";

/** A buy needs an open window, then either an already picked word or a free pick slot. */
export function buyPermission(
  action: WordAction,
  picked: ReadonlySet<string>,
  wordId: bigint | string,
): BuyPermission {
  if (!canTrade(action, "buy")) return "locked";
  return picked.has(String(wordId)) || picked.size < MAX_PICKED_WORDS ? "allowed" : "limit";
}

/** Re-check studio time when the timer wakes, including background-tab delays and offset changes. */
export function scheduleFlip(now: () => number | null, atMs: number, flip: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const check = () => {
    if (cancelled) return;
    const current = now();
    if (current !== null && current >= atMs) {
      flip();
      return;
    }
    timer = setTimeout(check, current === null ? 400 : Math.min(400, Math.max(1, atMs - current)));
  };
  check();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

export function driftDecision(targetSeconds: number, actualSeconds: number, initial: boolean) {
  const drift = targetSeconds - actualSeconds;
  // A 1 s error takes 20 s to recover at 1.05x. Seek larger errors instead.
  if (initial || Math.abs(drift) > 1) return { seek: Math.max(0, targetSeconds), rate: 1 };
  return { seek: null, rate: Math.abs(drift) <= 0.25 ? 1 : drift > 0 ? 1.05 : 0.95 };
}

export function minOutput(amount: bigint, slippageBps = 100): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000)
    throw new RangeError("Invalid slippage");
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function liveBuyQuote(
  side: Side,
  bidCents: number | null,
  askCents: number | null,
  budget: bigint,
) {
  const cents = side === "yes" ? askCents : bidCents;
  if (cents === null) return null;
  // NO is exact-base and must fill completely. Reserve 1% inside the chosen spend budget.
  const quote = buyQuote(side, cents, side === "no" ? (budget * 10_000n) / 10_100n : budget);
  if (!quote || quote.sharesMicro < MIN_SIZE || quote.sharesMicro > MAX_SIZE) return null;
  const maxAusdIn = (quote.costMicro * 10_100n + 9_999n) / 10_000n;
  return {
    ...quote,
    maxAusdIn: side === "no" ? maxAusdIn : budget,
    minOut: minOutput(quote.sharesMicro),
  };
}

export function allowanceApproval(
  allowance: bigint,
  required: bigint,
  balance: bigint,
): bigint | null {
  return allowance >= required ? null : required > balance ? required : balance;
}
export function tradeTransition(current: TicketStatus, next: TicketStatus): TicketStatus {
  if (next === "idle") return current === "sending" ? current : "idle";
  if (next === "sending") return current === "sending" ? current : "sending";
  return current === "sending" ? next : current;
}
