import { describe, expect, it } from "vitest";
import { gasLimit, gasWithMargin } from "./gas.ts";

// Reject unmeasured sizes rather than billing an arbitrary or undersized gas limit.
describe("measured transaction bounds", () => {
  it.each(["createEpisode", "listEpisode"] as const)(
    "rejects unmeasured word counts for %s",
    (kind) => {
      for (const count of [0, 1, 9, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => gasLimit(kind, count)).toThrow(RangeError);
      }
    },
  );
  it("rejects empty, fractional and oversized evidence batches", () => {
    for (const count of [0, 9, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => gasLimit("markEvidence", count)).toThrow(RangeError);
    }
  });
});

describe("runtime gas estimates", () => {
  it("rounds fractional margins upward without losing bigint precision", () => {
    expect(gasWithMargin(100_001n)).toBe(120_002n);
    expect(gasWithMargin(10n ** 20n + 1n)).toBe(12n * 10n ** 19n + 2n);
  });
  it("refuses zero and negative estimates before a transaction can be signed", () => {
    expect(() => gasWithMargin(0n)).toThrow(RangeError);
    expect(() => gasWithMargin(-1n)).toThrow(RangeError);
  });
});
