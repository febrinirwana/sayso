import { merkleRoot, verifyProof } from "@sayso/core";
import { encodePacked, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { buildOutput, clipIdFor, durationMsFor, parseManifest } from "./output.ts";

const sha = `0x${"11".repeat(32)}` as const;
const manifest = {
  id: "test-clip",
  licence: "CC0",
  words: ["block", "market", "monad", "rocket", "ocean", "forest"],
};

describe("offline clip commitments", () => {
  it.each([
    ["32.090000", 32090],
    ["10.000000", 10000],
    ["10.000001", 10001],
  ])("converts ffprobe decimal duration %s without phantom milliseconds", (seconds, expected) => {
    expect(durationMsFor(seconds)).toBe(expected);
  });
  it("hashes digest bytes followed by UTF-8 manifest id, not digest hex text", () => {
    expect(clipIdFor(sha, "café")).toBe(
      keccak256(encodePacked(["bytes32", "string"], [sha, "café"])),
    );
  });
  it("includes empty and partial-final chunks with independently verifiable proofs", () => {
    const out = buildOutput(parseManifest(manifest), sha, 25001, [["block", 9999, 10100]], []);
    expect(
      out.chunksA.map(({ index, startMs, endMs, tokens }) => ({ index, startMs, endMs, tokens })),
    ).toEqual([
      { index: 0, startMs: 0, endMs: 10000, tokens: [["block", 9999, 10100]] },
      { index: 1, startMs: 10000, endMs: 20000, tokens: [] },
      { index: 2, startMs: 20000, endMs: 30000, tokens: [] },
    ]);
    for (const [chunks, root] of [
      [out.chunksA, out.rootA],
      [out.chunksB, out.rootB],
    ] as const) {
      expect(root).toBe(merkleRoot(chunks.map(({ leaf }) => leaf)));
      for (const chunk of chunks) expect(verifyProof(chunk.leaf, chunk.proof, root)).toBe(true);
    }
    expect(out.rootA).not.toBe(out.rootB);
  });
  it("keeps engine-specific chunk indices across the inclusive agreement boundary", () => {
    const out = buildOutput(
      parseManifest(manifest),
      sha,
      20000,
      [
        ["blocks", 9999, 10000],
        ["market", 12000, 12500],
      ],
      [
        ["block", 11499, 11900],
        ["market", 13501, 14000],
      ],
    );
    expect(out.flagPlan).toEqual({
      block: { t_ms: 9999, chunk_a: 0, chunk_b: 1 },
      market: null,
      monad: null,
      rocket: null,
      ocean: null,
      forest: null,
    });
  });
  it.each([
    { ...manifest, id: "../leak" },
    { ...manifest, words: ["block"] },
    { ...manifest, words: ["block", "block", "monad", "rocket", "ocean", "forest"] },
    { ...manifest, licence: "unknown" },
  ])("rejects unusable curator manifests", (input) => {
    expect(() => parseManifest(input)).toThrow();
  });
});
