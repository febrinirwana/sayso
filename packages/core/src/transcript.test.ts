import { concat, type Hex, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import type { Token } from "./match.ts";
import {
  canonicalTokensJson,
  chunkCount,
  chunkIndexOf,
  chunkTranscript,
  engineCode,
  evidenceHash,
  leafHash,
  tokensHash,
} from "./transcript.ts";

const CLIP: Hex = `0x${"ab".repeat(32)}`;

// Each field is one ABI word, not the packed encoding used for Merkle pairs.
const abiWord = (value: number): string => value.toString(16).padStart(64, "0");

describe("transcript chunks", () => {
  it.each([
    [1, 1],
    [10_000, 1],
    [10_001, 2],
    [47_000, 5],
  ])("derives the complete chunk count for duration %i", (duration, count) => {
    expect(chunkCount(duration)).toBe(count);
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid duration %s",
    (duration) => {
      expect(() => chunkCount(duration)).toThrow();
      expect(() => chunkTranscript([], duration)).toThrow();
    },
  );

  it("assigns the boundary to the next chunk", () => {
    expect(chunkIndexOf(9_999)).toBe(0);
    expect(chunkIndexOf(10_000)).toBe(1);
    expect(chunkIndexOf(46_999)).toBe(4);
  });

  it("keeps empty chunks and stable start order without mutating input", () => {
    const tokens: readonly Token[] = [
      ["late", 46_999, 47_100],
      ["boundary", 10_000, 10_100],
      ["first tie", 3, 4],
      ["crossing", 9_999, 10_100],
      ["second tie", 3, 5],
    ];
    const before = tokens.map((token) => [...token]);
    expect(chunkTranscript(tokens, 47_000)).toEqual([
      {
        index: 0,
        startMs: 0,
        endMs: 10_000,
        tokens: [tokens[2], tokens[4], tokens[3]],
      },
      { index: 1, startMs: 10_000, endMs: 20_000, tokens: [tokens[1]] },
      { index: 2, startMs: 20_000, endMs: 30_000, tokens: [] },
      { index: 3, startMs: 30_000, endMs: 40_000, tokens: [] },
      { index: 4, startMs: 40_000, endMs: 50_000, tokens: [tokens[0]] },
    ]);
    expect(tokens).toEqual(before);
  });

  it("commits every chunk even when the transcript has no tokens", () => {
    expect(chunkTranscript([], 10_001)).toEqual([
      { index: 0, startMs: 0, endMs: 10_000, tokens: [] },
      { index: 1, startMs: 10_000, endMs: 20_000, tokens: [] },
    ]);
  });

  it.each<Token>([
    ["after", 10_001, 10_002],
    ["at end", 10_000, 10_000],
    ["reverse", 2, 1],
    ["negative start", -1, 1],
    ["negative end", 0, -1],
  ])("rejects an invalid token %s", (word, start, end) => {
    expect(() => chunkTranscript([[word, start, end]], 10_000)).toThrow();
  });
});

describe("transcript commitments", () => {
  const tokens: readonly Token[] = [
    ["café", 12, 34],
    ['say "hi"', 40, 50],
  ];

  it("hashes compact JSON as UTF-8 including accents and escaped quotes", () => {
    expect(canonicalTokensJson(tokens)).toBe('[["café",12,34],["say \\"hi\\"",40,50]]');
    expect(tokensHash(tokens)).toBe(
      "0xefaa26d32daedbae18e744c1f4f0c17f02c5e9ac5757eeaa2745be57f898bcaa",
    );
    expect(tokensHash([])).toBe(
      "0x518674ab2b227e5f11e9084f615d57663cde47bce1ba168b4c19c7ee22a73d70",
    );
  });

  it.each([
    ["A", 0],
    ["B", 1],
  ] as const)("commits engine %s with its numeric ABI code", (engine, code) => {
    const expected = keccak256(
      `0x${CLIP.slice(2)}${abiWord(code)}${abiWord(7)}${abiWord(70_000)}${abiWord(80_000)}${tokensHash([]).slice(2)}`,
    );
    expect(engineCode(engine)).toBe(code);
    expect(leafHash(CLIP, engine, 7, 70_000, 80_000, [])).toBe(expected);
  });

  it("hashes evidence leaves in verified order without ABI padding", () => {
    const first = leafHash(CLIP, "A", 0, 0, 10_000, tokens);
    const second = leafHash(CLIP, "B", 0, 0, 10_000, tokens);
    expect(evidenceHash([first, second])).toBe(keccak256(concat([first, second])));
    expect(evidenceHash([first, second])).not.toBe(evidenceHash([second, first]));
    expect(evidenceHash([])).toBe(keccak256("0x"));
  });
});
