import { describe, expect, it } from "vitest";
import {
  AMOUNT_PRESETS_MICRO,
  buyQuote,
  saleValueMicro,
  sharesFromMicro,
  sharesToMicro,
  sideCents,
} from "./quote";

const AUSD = 1_000_000n;

describe("sideCents", () => {
  it("prices NO as the complement of the YES price", () => {
    expect(sideCents("yes", 62)).toBe(62);
    expect(sideCents("no", 62)).toBe(38);
  });
});

describe("buyQuote", () => {
  it("shows what 5 AUSD on YES at 62¢ pays if the word is said", () => {
    const quote = buyQuote("yes", 62, 5n * AUSD);
    expect(quote).not.toBeNull();
    expect(quote?.priceCents).toBe(62);
    expect(quote?.costMicro).toBe(5n * AUSD);
    expect(quote?.sharesMicro).toBe(8_064_516n);
    expect(quote?.payoutMicro).toBe(8_064_516n);
    expect(quote?.profitMicro).toBe(3_064_516n);
  });

  it("buys NO at the complement, so a cheap YES makes NO pay little", () => {
    const quote = buyQuote("no", 90, 10n * AUSD);
    expect(quote?.priceCents).toBe(10);
    expect(quote?.payoutMicro).toBe(100n * AUSD);
    const pricey = buyQuote("no", 10, 9n * AUSD);
    expect(pricey?.priceCents).toBe(90);
    expect(pricey?.payoutMicro).toBe(10n * AUSD);
  });

  it("rounds shares down so the payout is never overstated", () => {
    // 1 AUSD at 3¢ is 33.333… shares; the preview must not promise the extra fraction.
    expect(buyQuote("yes", 3, AUSD)?.payoutMicro).toBe(33_333_333n);
  });

  it("offers nothing when a side has no seller or the amount is empty", () => {
    expect(buyQuote("yes", 100, AUSD)).toBeNull();
    expect(buyQuote("no", 100, AUSD)).toBeNull();
    expect(buyQuote("yes", 0, AUSD)).toBeNull();
    expect(buyQuote("yes", 50, 0n)).toBeNull();
  });

  it("presets are 1, 5, 10 and 25 AUSD", () => {
    expect(AMOUNT_PRESETS_MICRO).toEqual([1n, 5n, 10n, 25n].map((a) => a * AUSD));
  });
});

describe("saleValueMicro", () => {
  it("cashes 40 YES out at the 98¢ SAID bid for 39.20 AUSD", () => {
    expect(saleValueMicro(40, 98)).toBe(39_200_000n);
  });

  it("rounds fractional shares down", () => {
    expect(saleValueMicro(12.5, 98)).toBe(12_250_000n);
    expect(saleValueMicro(0.0000019, 98)).toBe(0n);
  });
});

describe("share units", () => {
  it("round-trips whole and fractional shares through 6-decimal units", () => {
    expect(sharesToMicro(40)).toBe(40_000_000n);
    expect(sharesToMicro(0.29)).toBe(290_000n);
    expect(sharesFromMicro(8_064_516n)).toBeCloseTo(8.064516);
    expect(() => sharesToMicro(-1)).toThrow(RangeError);
  });
});
