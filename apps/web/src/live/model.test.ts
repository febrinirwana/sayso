import { describe, expect, it, vi } from "vitest";
import {
  allowanceApproval,
  driftDecision,
  liveBuyQuote,
  minOutput,
  presentationState,
  scheduleFlip,
  tradeTransition,
} from "./model";

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
});
