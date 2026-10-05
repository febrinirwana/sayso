import { describe, expect, it } from "vitest";
import {
  centsToKuru,
  formatAmount,
  formatCents,
  kuruToCents,
  kuruToPrice,
  noCost,
  parseAmount,
  priceToKuru,
  QUOTE_UNIT,
  quoteCost,
  quoteProceeds,
  sizeToKuru,
} from "./units.ts";

describe("price conversions", () => {
  it.each([
    ["0.01", 100, 1, "0.01"],
    ["0.5", 5000, 50, "0.50"],
    ["0.50", 5000, 50, "0.50"],
    [".98", 9800, 98, "0.98"],
    ["0.99", 9900, 99, "0.99"],
    ["0.500000000000000000", 5000, 50, "0.50"],
  ] as const)("converts %s exactly", (text, price, cents, display) => {
    expect(priceToKuru(text)).toBe(price);
    expect(centsToKuru(cents)).toBe(price);
    expect(kuruToCents(price)).toBe(cents);
    expect(kuruToPrice(price)).toBe(display);
    expect(formatCents(price)).toBe(`${cents}¢`);
  });

  it.each([
    "0.00",
    "1.00",
    "0.505",
    "0.500000000000000001",
    "-0.5",
    "",
    " ",
    "5e-1",
    "+0.5",
    "0.5x",
    "0.",
  ])("rejects invalid or off-tick price %s", (text) => {
    expect(() => priceToKuru(text)).toThrow();
  });

  it.each([0, 100, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects cents %s", (cents) => {
    expect(() => centsToKuru(cents)).toThrow();
  });

  it.each([0, 10000, 5050, -100, 100.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects Kuru price %s at every display boundary",
    (price) => {
      expect(() => kuruToCents(price)).toThrow();
      expect(() => kuruToPrice(price)).toThrow();
      expect(() => formatCents(price)).toThrow();
    },
  );
});

describe("token amounts", () => {
  it.each([
    ["0", 0n, "0"],
    ["1", 1_000_000n, "1"],
    ["1.5", 1_500_000n, "1.5"],
    ["0.00001", 10n, "0.00001"],
    [".000001", 1n, "0.000001"],
    ["001.500000", 1_500_000n, "1.5"],
    ["9007199254740993.123456", 9_007_199_254_740_993_123456n, "9007199254740993.123456"],
  ] as const)("parses %s without losing base units", (text, units, canonical) => {
    expect(parseAmount(text)).toBe(units);
    expect(formatAmount(units)).toBe(canonical);
    expect(parseAmount(formatAmount(units))).toBe(units);
  });

  it.each(["", " ", "-1", "+1", "1e6", "1.0000000", "0.0000001", "1.", ".", "1.2.3"])(
    "rejects malformed or overprecision amount %s",
    (text) => {
      expect(() => parseAmount(text)).toThrow();
    },
  );

  it("formats signed portfolio amounts without losing fractional precision", () => {
    expect(formatAmount(-1_500_000n)).toBe("-1.5");
    expect(formatAmount(-1n)).toBe("-0.000001");
  });

  it.each([1_000_000n, 1_000_001n, 10_000_000_000n])(
    "accepts size %s without whole-token rounding",
    (size) => {
      expect(sizeToKuru(size)).toBe(size);
    },
  );

  it.each([0n, -1n, 999_999n, 10_000_000_001n])("rejects out-of-range size %s", (size) => {
    expect(() => sizeToKuru(size)).toThrow();
  });
});

describe("quote rounding", () => {
  it("rounds buyer cost up and seller proceeds down to Kuru's 100-unit quote quantum", () => {
    expect(quoteCost(1_000_001n, 5000)).toBe(500_100n);
    expect(quoteProceeds(1_000_001n, 5000)).toBe(500_000n);
    expect(noCost(1_000_001n, 5000)).toBe(500_001n);
    // Fork-observed: selling 9,803,921 YES at the 0.50 bid paid 4,901,900 AUSD units.
    expect(quoteProceeds(9_803_921n, 5000)).toBe(4_901_900n);
    expect(quoteCost(1n, 100)).toBe(QUOTE_UNIT);
  });

  it("keeps exact quotes exact at both price boundaries", () => {
    expect(quoteCost(1_000_000n, 100)).toBe(10_000n);
    expect(quoteProceeds(1_000_000n, 9900)).toBe(990_000n);
    expect(noCost(1_000_000n, 9800)).toBe(20_000n);
    expect(quoteCost(0n, 5000)).toBe(0n);
  });

  it("rejects invalid prices and negative sizes rather than quoting them", () => {
    for (const quote of [quoteCost, quoteProceeds, noCost]) {
      expect(() => quote(1_000_000n, 5050)).toThrow();
      expect(() => quote(-1n, 5000)).toThrow();
    }
  });
});
