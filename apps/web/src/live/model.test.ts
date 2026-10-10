import { TRADING_CLOSE_LEAD_MS } from "@sayso/core";
import { describe, expect, it, vi } from "vitest";
import {
  allowanceApproval,
  canTrade,
  cardPrice,
  driftDecision,
  liveBuyQuote,
  minOutput,
  presentationState,
  scheduleFlip,
  tradeTransition,
  tradingWindow,
  wordAction,
} from "./model";
import { bookCents } from "./readers";

describe("bets window", () => {
  const startsAt = 100_000;
  const closeAt = startsAt - TRADING_CLOSE_LEAD_MS;

  it("is open before the close and counts down to it", () => {
    expect(tradingWindow(closeAt - 12_000, startsAt, false)).toEqual({
      status: "open",
      closesInMs: 12_000,
    });
    expect(tradingWindow(closeAt - 1, startsAt, false).status).toBe("open");
  });
  it("closes at the close instant, through playback and after the clip", () => {
    expect(tradingWindow(closeAt, startsAt, false).status).toBe("closed");
    expect(tradingWindow(startsAt + 10_000, startsAt, false).status).toBe("closed");
    expect(tradingWindow(closeAt - 30_000, startsAt, true).status).toBe("closed");
  });
  it("never reads open without a synchronized clock", () => {
    expect(tradingWindow(null, startsAt, false).status).toBe("unsynced");
  });
  it("buys and sells any open word before the close", () => {
    const action = wordAction("open", tradingWindow(closeAt - 1, startsAt, false));
    expect(action).toBe("trade");
    expect(canTrade(action, "buy")).toBe(true);
    expect(canTrade(action, "sell")).toBe(true);
  });
  it("locks an unflagged word during playback: no buy, no sell", () => {
    const playing = tradingWindow(startsAt + 4_000, startsAt, false);
    expect(wordAction("open", playing)).toBe("locked");
    expect(canTrade("locked", "buy")).toBe(false);
    expect(canTrade("locked", "sell")).toBe(false);
    expect(wordAction("open", tradingWindow(null, startsAt, false))).toBe("locked");
  });
  it("keeps the SAID cash-out during playback but takes no new bet on it", () => {
    const playing = tradingWindow(startsAt + 4_000, startsAt, false);
    expect(wordAction("said", playing)).toBe("cashout");
    expect(canTrade("cashout", "sell")).toBe(true);
    expect(canTrade("cashout", "buy")).toBe(false);
  });
  it("leaves settled words to redeem", () => {
    const open = tradingWindow(closeAt - 1, startsAt, false);
    for (const state of ["yes", "no", "void"] as const) {
      expect(wordAction(state, open)).toBe("settled");
    }
    expect(canTrade("settled", "sell")).toBe(false);
  });
});

describe("card price", () => {
  // Episode 9, BLOCK (word 49): bestBidAsk after the house pull, then after its 0.98 bid
  // (block 69,309,287). The player's own buy printed the last trade at 51¢.
  const EMPTY_BID = (1n << 256n) - 1n;
  const pulled = { bid: bookCents(EMPTY_BID), ask: bookCents(0n) };
  const houseBid = { bid: bookCents(980_000_000_000_000_000n), ask: bookCents(0n) };

  it("never shows a pre-flag trade on a SAID card, only the house cash-out bid", () => {
    expect(cardPrice("said", pulled, 51)).toBeNull();
    expect(cardPrice("said", houseBid, 51)).toBe(98);
    expect(cardPrice("said", undefined, 51)).toBeNull();
  });
  it("prices an open card at the ask, then the bid, then the last trade", () => {
    expect(cardPrice("open", { bid: 49, ask: 51 }, 40)).toBe(51);
    expect(cardPrice("open", { bid: 49, ask: null }, 40)).toBe(49);
    expect(cardPrice("open", pulled, 40)).toBe(40);
  });
  it("pays out settled words regardless of the book", () => {
    expect(cardPrice("yes", houseBid, 51)).toBe(100);
    expect(cardPrice("no", houseBid, 51)).toBe(0);
    expect(cardPrice("void", houseBid, 51)).toBe(50);
  });
});

describe("presentation clock", () => {
  it("never presents a flag before its delayed spoken timestamp", () => {
    expect(presentationState("SaidPending", 10_000, 2_000, 13_499)).toBe("open");
    expect(presentationState("SaidPending", 10_000, 2_000, 13_500)).toBe("said");
    expect(presentationState("SaidPending", 10_000, 2_000, 20_000)).toBe("said");
    expect(presentationState("SaidPending", 10_000, 2_000, null)).toBe("open");
    expect(presentationState("Void", 10_000, 0, null)).toBe("void");
  });
  it("schedules exactly at t plus 1500 ms and restores elapsed flags immediately", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    let flippedAt = 0;
    const cancel = scheduleFlip(
      () => Date.now(),
      13_500,
      () => {
        flippedAt = Date.now();
      },
    );
    vi.advanceTimersByTime(3_499);
    expect(flippedAt).toBe(0);
    vi.advanceTimersByTime(1);
    expect(flippedAt).toBe(13_500);
    cancel();
    scheduleFlip(
      () => Date.now(),
      12_000,
      () => {
        flippedAt = Date.now();
      },
    );
    expect(flippedAt).toBe(13_500);
    vi.useRealTimers();
  });
});

describe("video drift", () => {
  it("seeks only on initialisation and nudges drift beyond 250 ms", () => {
    expect(driftDecision(10, 0, true)).toEqual({ seek: 10, rate: 1 });
    expect(driftDecision(10, 9.75, false)).toEqual({ seek: null, rate: 1 });
    expect(driftDecision(10, 9.7, false).rate).toBe(1.05);
    expect(driftDecision(10, 10.3, false).rate).toBe(0.95);
  });
});

describe("IOC guards", () => {
  it("rounds minimum outputs down with a one percent slippage bound", () => {
    expect(minOutput(101n)).toBe(99n);
    expect(minOutput(1_000_000n)).toBe(990_000n);
    expect(() => minOutput(1n, 10_000)).toThrow();
  });
  it("uses ask for YES and complement of bid for NO, reserving the NO cost cap", () => {
    expect(liveBuyQuote("yes", 40, 60, 5_000_000n)?.sharesMicro).toBe(8_333_333n);
    const no = liveBuyQuote("no", 40, 60, 5_000_000n);
    expect(no?.priceCents).toBe(60);
    expect(no?.maxAusdIn).toBeLessThanOrEqual(5_000_000n);
    expect(liveBuyQuote("yes", 40, null, 5_000_000n)).toBeNull();
    expect(liveBuyQuote("no", null, 60, 5_000_000n)).toBeNull();
  });
  it("approves only short allowance and covers the larger of spend and balance", () => {
    expect(allowanceApproval(5n, 5n, 100n)).toBeNull();
    expect(allowanceApproval(4n, 5n, 100n)).toBe(100n);
    expect(allowanceApproval(0n, 5n, 2n)).toBe(5n);
  });
  it("requires sending before a fill and permits retry after failure", () => {
    expect(tradeTransition("idle", "filled")).toBe("idle");
    expect(tradeTransition("idle", "sending")).toBe("sending");
    expect(tradeTransition("sending", "filled")).toBe("filled");
    expect(tradeTransition("sending", "failed")).toBe("failed");
    expect(tradeTransition("failed", "sending")).toBe("sending");
  });
  it("resets a completed buy for cash out without interrupting a pending receipt", () => {
    expect(tradeTransition("filled", "idle")).toBe("idle");
    expect(tradeTransition("failed", "idle")).toBe("idle");
    expect(tradeTransition("sending", "idle")).toBe("sending");
  });
});
