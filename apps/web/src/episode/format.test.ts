import { describe, expect, it } from "vitest";
import { formatAusd, formatAusdChange, formatCents, formatClock, formatShares } from "./format";

describe("formatCents", () => {
  it("shows the full price range in cents", () => {
    expect(formatCents(0)).toBe("0¢");
    expect(formatCents(1)).toBe("1¢");
    expect(formatCents(62)).toBe("62¢");
    expect(formatCents(100)).toBe("100¢");
  });

  it("rejects prices a word can never have instead of clamping them", () => {
    expect(() => formatCents(-1)).toThrow(RangeError);
    expect(() => formatCents(101)).toThrow(RangeError);
    expect(() => formatCents(62.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatAusd", () => {
  it("formats zero, sub-cent and whole amounts", () => {
    expect(formatAusd(0n)).toBe("0.00 AUSD");
    expect(formatAusd(9_999n)).toBe("0.00 AUSD");
    expect(formatAusd(10_000n)).toBe("0.01 AUSD");
    expect(formatAusd(1_000_000n)).toBe("1.00 AUSD");
  });

  it("truncates instead of rounding so a balance is never overstated", () => {
    expect(formatAusd(12_349_999n)).toBe("12.34 AUSD");
    expect(formatAusd(999_999n)).toBe("0.99 AUSD");
  });

  it("groups thousands on large balances beyond float precision", () => {
    expect(formatAusd(1_234_567_890_000n)).toBe("1,234,567.89 AUSD");
    expect(formatAusd(123_456_789_012_345_678_901n)).toBe("123,456,789,012,345.67 AUSD");
  });

  it("signs losses and never shows a negative zero", () => {
    expect(formatAusd(-2_105_000n)).toBe("\u22122.10 AUSD");
    expect(formatAusd(-5n)).toBe("0.00 AUSD");
  });
});

describe("formatAusdChange", () => {
  it("marks gains with a plus and leaves flat results unsigned", () => {
    expect(formatAusdChange(6_400_000n)).toBe("+6.40 AUSD");
    expect(formatAusdChange(-2_100_000n)).toBe("\u22122.10 AUSD");
    expect(formatAusdChange(0n)).toBe("0.00 AUSD");
    expect(formatAusdChange(9_999n)).toBe("0.00 AUSD");
  });
});

describe("formatShares", () => {
  it("drops trailing zeros and truncates to two decimals", () => {
    expect(formatShares(40)).toBe("40");
    expect(formatShares(12.5)).toBe("12.5");
    expect(formatShares(1234.567)).toBe("1,234.56");
  });

  it("rejects negative or non-finite amounts", () => {
    expect(() => formatShares(-1)).toThrow(RangeError);
    expect(() => formatShares(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("formatClock", () => {
  it("counts down in m:ss and holds 0:01 until time is up", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(0.2)).toBe("0:01");
    expect(formatClock(42)).toBe("0:42");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(605)).toBe("10:05");
  });

  it("rejects negative or non-finite time", () => {
    expect(() => formatClock(-1)).toThrow(RangeError);
    expect(() => formatClock(Number.NaN)).toThrow(RangeError);
  });
});
