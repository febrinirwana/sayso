import { MAX_SIZE, MIN_SIZE } from "@sayso/core";
import type { WordState as ChainState } from "@/data/chain";
import { buyQuote, type Side } from "@/episode/quote";
import type { TicketStatus } from "@/episode/Ticket";
import type { WordState } from "@/episode/WordCard";

export const PRESENTATION_DELAY_MS = 1_500;
export function presentationState(
  state: ChainState,
  startsAtMs: number,
  offsetMs: number | undefined,
  nowMs: number | null,
): WordState {
  if (state === "Yes") return "yes";
  if (state === "No") return "no";
  if (state === "Void") return "void";
  return offsetMs !== undefined &&
    nowMs !== null &&
    nowMs >= startsAtMs + offsetMs + PRESENTATION_DELAY_MS
    ? "said"
    : "open";
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
  if (initial) return { seek: Math.max(0, targetSeconds), rate: 1 };
  const drift = targetSeconds - actualSeconds;
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
