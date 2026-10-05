import { describe, expect, it } from "vitest";
import { gasLimit } from "./gas.ts";

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
