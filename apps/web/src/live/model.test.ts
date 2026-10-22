import { TRADING_CLOSE_LEAD_MS } from "@sayso/core";
import { describe, expect, it, vi } from "vitest";
import {
  allowanceApproval,
  buyPermission,
  canTrade,
  cardPrice,
  driftDecision,
  liveBuyQuote,
  minOutput,
  pickedWords,
  presentationState,
  recordSessionBuy,
  type SessionBuys,
  scheduleFlip,
  sessionBuyKey,
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

describe("pick limit", () => {
  const ME = "0xAbC0000000000000000000000000000000000001";
  const OTHER = "0x0000000000000000000000000000000000000002";
  const episodeWordIds = [1n, 2n, 3n, 4n, 5n, 6n];
  const picks = (over: Partial<Parameters<typeof pickedWords>[0]> = {}) =>
    pickedWords({
      episodeWordIds,
      holdings: [],
      trades: [],
      address: ME,
      sessionBuys: new Set(),
      ...over,
    });
  const trade = (
    word_id: string,
    side: number,
    player_id = ME.toLowerCase(),
    tokenAmount = "1000000",
  ) => ({ word_id, player_id, side, tokenAmount });

  it("counts chain holdings on either side", () => {
    const holdings = [
      { wordId: 1n, yes: 5n, no: 0n },
      { wordId: 2n, yes: 0n, no: 5n },
      { wordId: 3n, yes: 0n, no: 0n },
    ];
    expect([...picks({ holdings })].sort()).toEqual(["1", "2"]);
  });
  it("counts indexed buys of YES and NO, case-insensitively on the address", () => {
    const trades = [trade("1", 0), trade("2", 2, ME.toUpperCase().replace("0X", "0x"))];
    expect([...picks({ trades })].sort()).toEqual(["1", "2"]);
  });
  it("never frees a slot when the player sells out or cashes out", () => {
    const trades = [trade("1", 0), trade("1", 1), trade("2", 2), trade("2", 3)];
    expect([...picks({ trades })].sort()).toEqual(["1", "2"]);
  });
  it("ignores zero-fill buys, which the contract emits for no-op calls", () => {
    const zero = ["1", "2", "3"].map((word) => trade(word, 0, ME.toLowerCase(), "0"));
    expect(picks({ trades: [...zero, trade("4", 2, ME.toLowerCase(), "0")] }).size).toBe(0);
    expect([...picks({ trades: [...zero, trade("4", 2)] })]).toEqual(["4"]);
  });
  it("keeps each account's session fills across A to B to A switches", () => {
    const keyA = sessionBuyKey(ME, 7);
    const keyB = sessionBuyKey(OTHER, 7);
    let session: SessionBuys = new Map();
    for (const word of [1n, 2n, 3n]) session = recordSessionBuy(session, keyA, word);
    session = recordSessionBuy(session, keyB, 4n);
    const forA = (s: SessionBuys) => picks({ sessionBuys: s.get(keyA) ?? new Set() });
    const forB = (s: SessionBuys) =>
      picks({ address: OTHER, sessionBuys: s.get(keyB) ?? new Set() });
    expect([...forB(session)]).toEqual(["4"]);
    expect(forA(session).size).toBe(3);
    expect(buyPermission("trade", forA(session), 5n)).toBe("limit");
    expect(sessionBuyKey(ME.toUpperCase().replace("0X", "0x"), 7)).toBe(keyA);
    expect(sessionBuyKey(ME, 8)).not.toBe(keyA);
  });
  it("does not count a sell alone, nor other players' buys", () => {
    const trades = [trade("1", 1), trade("2", 3), trade("3", 0, OTHER), trade("4", 2, OTHER)];
    expect(picks({ trades }).size).toBe(0);
  });
  it("counts a buy filled this session before the indexer has it, without double counting", () => {
    const holdings = [{ wordId: 1n, yes: 1n, no: 0n }];
    const result = picks({ holdings, trades: [trade("1", 0)], sessionBuys: new Set(["1", "5"]) });
    expect([...result].sort()).toEqual(["1", "5"]);
  });
  it("reads no trades for an unknown address, and ignores words outside this episode", () => {
    const result = picks({
      address: null,
      trades: [trade("1", 0)],
      sessionBuys: new Set(["99"]),
    });
    expect(result.size).toBe(0);
    expect(picks({ trades: [trade("99", 0)] }).size).toBe(0);
  });

  it("opens a new word below the limit and at two picks", () => {
    expect(buyPermission("trade", new Set(), 1n)).toBe("allowed");
    expect(buyPermission("trade", new Set(["1", "2"]), 3n)).toBe("allowed");
  });
  it("refuses a fourth word but keeps buying a picked one", () => {
    const three = new Set(["1", "2", "3"]);
    expect(buyPermission("trade", three, 4n)).toBe("limit");
    expect(buyPermission("trade", three, 3n)).toBe("allowed");
    expect(buyPermission("trade", three, "2")).toBe("allowed");
  });
  it("stays locked once the window closes, picked or not", () => {
    expect(buyPermission("locked", new Set(["1"]), 1n)).toBe("locked");
    expect(buyPermission("locked", new Set(), 2n)).toBe("locked");
    expect(buyPermission("cashout", new Set(), 2n)).toBe("locked");
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

describe("heard-word presentation", () => {
  const heardAt = 3_120;
  const clockDue = 14_620;

  it("waits for the heard margin even without playable media", () => {
    expect(presentationState("SaidPending", 10_000, 2_000, clockDue - 1)).toBe("open");
    expect(presentationState("SaidPending", 10_000, 2_000, clockDue)).toBe("said");
    expect(presentationState("SaidPending", 10_000, 2_000, null)).toBe("open");
  });
  it("gates a synced or lagging video on the actual playhead", () => {
    expect(
      presentationState("SaidPending", 10_000, 2_000, clockDue, { playheadMs: heardAt - 1 }),
    ).toBe("open");
    expect(presentationState("SaidPending", 10_000, 2_000, clockDue, { playheadMs: heardAt })).toBe(
      "said",
    );
    expect(presentationState("SaidPending", 10_000, 2_000, clockDue + 500, { playheadMs: 0 })).toBe(
      "open",
    );
  });
  it("never lets an ahead video beat the delayed studio deadline", () => {
    expect(
      presentationState("SaidPending", 10_000, 2_000, clockDue - 1, { playheadMs: heardAt + 500 }),
    ).toBe("open");
    expect(
      presentationState("SaidPending", 10_000, 2_000, clockDue, { playheadMs: heardAt + 500 }),
    ).toBe("said");
  });
  it("falls back for absent, unloaded, failed or autoplay-blocked media", () => {
    expect(presentationState("SaidPending", 10_000, 2_000, clockDue, { playheadMs: null })).toBe(
      "said",
    );
    expect(presentationState("Open", 10_000, undefined, clockDue + 10_000)).toBe("open");
  });
  it("caps buffering holds so cash-out cannot wait forever", () => {
    expect(
      presentationState("SaidPending", 10_000, 2_000, clockDue + 1_999, {
        playheadMs: 0,
      }),
    ).toBe("open");
    expect(
      presentationState("SaidPending", 10_000, 2_000, clockDue + 2_000, {
        playheadMs: 0,
      }),
    ).toBe("said");
  });
  it("does not undo an observed flip when playback or clock moves backwards", () => {
    expect(
      presentationState("SaidPending", 10_000, 2_000, null, {
        playheadMs: 0,
        alreadySaid: true,
      }),
    ).toBe("said");
  });
  it("preserves closed flags and final outcomes independently of playback", () => {
    expect(
      presentationState("SaidPending", 10_000, 2_000, null, { playheadMs: 0, closed: true }),
    ).toBe("said");
    for (const [chain, card] of [
      ["Yes", "yes"],
      ["No", "no"],
      ["Void", "void"],
    ] as const) {
      expect(
        presentationState(chain, 10_000, undefined, null, { playheadMs: 0, alreadySaid: true }),
      ).toBe(card);
    }
  });
  it("wakes at a supplied deadline and restores elapsed flags immediately", () => {
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
  it("seeks on initialisation and nudges small drift beyond 250 ms", () => {
    expect(driftDecision(10, 0, true)).toEqual({ seek: 10, rate: 1 });
    expect(driftDecision(10, 9.75, false)).toEqual({ seek: null, rate: 1 });
    expect(driftDecision(10, 9.7, false).rate).toBe(1.05);
    expect(driftDecision(10, 10.3, false).rate).toBe(0.95);
  });
  it("seeks in either direction only beyond one second of drift", () => {
    expect(driftDecision(10, 9, false)).toEqual({ seek: null, rate: 1.05 });
    expect(driftDecision(10, 11, false)).toEqual({ seek: null, rate: 0.95 });
    expect(driftDecision(10, 8.999, false)).toEqual({ seek: 10, rate: 1 });
    expect(driftDecision(10, 11.001, false)).toEqual({ seek: 10, rate: 1 });
    expect(driftDecision(-1, 2, false)).toEqual({ seek: 0, rate: 1 });
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
