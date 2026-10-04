import { describe, expect, it } from "vitest";
import {
  agreedSpokenTime,
  isValidTarget,
  matchesTarget,
  normalizeToken,
  type Token,
} from "./match.ts";

const tokens = (starts: readonly number[]): Token[] =>
  starts.map((start) => ["monad", start, start + 100]);

describe("matchesTarget", () => {
  it.each([
    ["monad", "Monad,", true],
    ["monad", "monads", true],
    ["monad", "monad's", true],
    ["monad", "Monad’s", true],
    ["monad", "monads'", true],
    ["monad", "pre-monad", true],
    ["monad", "monadic", false],
    ["monad", "nomad", false],
    ["monad", "monadbft", false],
    ["box", "boxes", true],
    ["class", "CLASSES!", true],
    ["city", "cities", false],
    ["run", "running", false],
    ["ok", '"OK!"', true],
  ] as const)("%s against %s matches: %s", (target, raw, expected) => {
    expect(matchesTarget(target, raw)).toBe(expected);
  });

  it("matches inflected whole compound parts, not partial parts", () => {
    expect(matchesTarget("box", "pre-boxes-post")).toBe(true);
    expect(matchesTarget("monad", "pre-monadic")).toBe(false);
    expect(matchesTarget("late-night", "late-night")).toBe(true);
  });

  it("rejects invalid targets rather than silently normalizing them", () => {
    expect(() => matchesTarget("MONAD", "monad")).toThrow();
    expect(() => agreedSpokenTime("2", [], [])).toThrow();
  });
});

describe("normalizeToken", () => {
  it.each([
    ["（ＭＯＮＡＤ！）", "monad"],
    ["‘Monad’s’", "monad's"],
    ["...pre-monad...", "pre-monad"],
    ['"ÉCOLE!"', "école"],
    ["---１２３---", "123"],
    ["!?", ""],
    ["x.y", "x.y"],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(normalizeToken(raw)).toBe(expected);
  });
});

describe("isValidTarget", () => {
  it.each(["monad", "late-night", "r2d2", "a".repeat(32)])("accepts %s", (target) => {
    expect(isValidTarget(target)).toBe(true);
  });
  it.each([
    "MONAD",
    "2",
    "123",
    "a".repeat(33),
    "",
    "two words",
    "école",
    "-box",
    "box-",
    "box--set",
    "box's",
  ])("rejects %s", (target) => {
    expect(isValidTarget(target)).toBe(false);
  });
});

describe("agreedSpokenTime", () => {
  it.each([
    [[71240], [71900], { atMs: 71240, aStartMs: 71240, bStartMs: 71900 }],
    [[71240], [72741], null],
    [[10000, 50000], [50400], { atMs: 50000, aStartMs: 50000, bStartMs: 50400 }],
    [[], [30000], null],
  ] as const)("pairs A %j with B %j", (a, b, expected) => {
    expect(agreedSpokenTime("monad", tokens(a), tokens(b))).toEqual(expected);
  });

  it("includes the exact 1500 ms boundary and uses the earlier B start", () => {
    expect(agreedSpokenTime("monad", tokens([11500]), tokens([10000]))).toEqual({
      atMs: 10000,
      aStartMs: 11500,
      bStartMs: 10000,
    });
  });

  it("consumes a singleton A with the first B match, not a later or averaged match", () => {
    expect(agreedSpokenTime("monad", tokens([10000]), tokens([10500, 10600]))).toEqual({
      atMs: 10000,
      aStartMs: 10000,
      bStartMs: 10500,
    });
  });

  it("finds the earliest pair from unsorted inputs without mutating them", () => {
    const a = tokens([50000, 10000]);
    const b = tokens([50400, 10600, 10500]);
    expect(agreedSpokenTime("monad", a, b)).toEqual({
      atMs: 10000,
      aStartMs: 10000,
      bStartMs: 10500,
    });
    expect(a.map((token) => token[1])).toEqual([50000, 10000]);
    expect(b.map((token) => token[1])).toEqual([50400, 10600, 10500]);
  });

  it("advances an unmatched B and ignores tokens for different targets", () => {
    const b: Token[] = [["nomad", 9900, 10000], ...tokens([1000, 10100])];
    expect(agreedSpokenTime("monad", tokens([10000]), b)).toEqual({
      atMs: 10000,
      aStartMs: 10000,
      bStartMs: 10100,
    });
    expect(agreedSpokenTime("monad", tokens([10000]), [["nomad", 10000, 10100]])).toBeNull();
  });
});
