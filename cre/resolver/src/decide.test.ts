import {
  chunkTranscript,
  evidenceHash,
  leafHash,
  merkleProof,
  merkleRoot,
  type Token,
} from "@sayso/core";
import { decodeAbiParameters, type Hex, parseAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { decide, type Episode, encodeReport, type Word } from "./decide.ts";

const clipId = `0x${"12".repeat(32)}` as Hex;

function fixture(
  a: Token[] = [["monad", 9_800, 9_950]],
  b: Token[] = [["monads", 10_300, 10_500]],
) {
  const payloads = (engine: "A" | "B", tokens: Token[]) => {
    const chunks = chunkTranscript(tokens, 30_000);
    const leaves = chunks.map((c) =>
      leafHash(clipId, engine, c.index, c.startMs, c.endMs, c.tokens),
    );
    return {
      root: merkleRoot(leaves),
      chunks: chunks.map((c) => ({
        ...c,
        clipId,
        engine,
        leaf: leaves[c.index] as Hex,
        proof: merkleProof(leaves, c.index),
      })),
    };
  };
  const A = payloads("A", a);
  const B = payloads("B", b);
  const episode: Episode = {
    id: 7,
    clipId,
    rootA: A.root,
    rootB: B.root,
    durationMs: 30_000,
    closed: true,
  };
  const word: Word = { id: 9n, episodeId: 7, text: "monad", state: 1, chunkA: 0, chunkB: 1 };
  return { episode, word, chunks: [...A.chunks, ...B.chunks], A, B };
}

describe("committed transcript settlement", () => {
  it("reports Yes from flagged engine-specific chunks across a boundary", () => {
    const f = fixture();
    const result = decide("evidence", f.episode, [f.word], [f.A.chunks[0], f.B.chunks[1]]);
    expect(result.report?.outcomes).toEqual([2]);
    expect(result.report?.wordIds).toEqual([9n]);
  });

  it("leaves a falsely flagged word unresolved until close", () => {
    const f = fixture([["monad", 100, 200]], [["nomad", 200, 300]]);
    expect(
      decide("evidence", f.episode, [f.word], [f.A.chunks[0], f.B.chunks[1]]).report,
    ).toBeNull();
    expect(decide("closed", f.episode, [f.word], f.chunks).report?.outcomes).toEqual([3]);
  });

  it.each([
    ["one engine only", [["monad", 100, 200]], []],
    ["agreement outside 1500 ms", [["monad", 100, 200]], [["monad", 1_601, 1_700]]],
  ] as const)("reports No on close for %s", (_name, a, b) => {
    const f = fixture([...a], [...b]);
    expect(decide("closed", f.episode, [f.word], f.chunks).report?.outcomes).toEqual([3]);
  });

  it("finds late Yes outside the flagged chunks and skips already final words", () => {
    const f = fixture([["monad", 22_000, 22_100]], [["monad", 23_500, 23_600]]);
    const words = [
      f.word,
      { ...f.word, id: 10n, state: 2 },
      { ...f.word, id: 11n, text: "box", state: 0 },
    ];
    const report = decide("closed", f.episode, words, f.chunks).report;
    expect(report?.wordIds).toEqual([9n, 11n]);
    expect(report?.outcomes).toEqual([2, 3]);
  });

  it("withholds the entire report on a tampered token", () => {
    const f = fixture();
    const first = f.A.chunks[0];
    const tampered = { ...first, tokens: [["box", 9_800, 9_950]] };
    expect(
      decide("closed", f.episode, [f.word], [tampered, ...f.chunks.slice(1)]).report,
    ).toBeNull();
  });

  it("withholds the report for a proof against the wrong root", () => {
    const f = fixture();
    expect(
      decide("closed", { ...f.episode, rootA: f.episode.rootB }, [f.word], f.chunks).report,
    ).toBeNull();
  });

  it("requires empty chunks too, so omitted evidence cannot turn Yes into No", () => {
    const f = fixture([], []);
    expect(
      decide(
        "closed",
        f.episode,
        [f.word],
        f.chunks.filter((c) => !(c.engine === "B" && c.index === 2)),
      ).report,
    ).toBeNull();
  });

  it("refuses a proven subset when a shorter episode would hide the last chunk", () => {
    const f = fixture([["monad", 22_000, 22_100]], [["monad", 22_500, 22_600]]);
    const shortened = { ...f.episode, durationMs: 20_000 };
    expect(
      decide(
        "closed",
        shortened,
        [f.word],
        f.chunks.filter((c) => c.index < 2),
      ).report,
    ).toBeNull();
  });

  it("rejects duplicate indices rather than accepting an incomplete full set", () => {
    const f = fixture();
    expect(
      decide("closed", f.episode, [f.word], [...f.chunks.slice(0, 5), f.B.chunks[0]]).report,
    ).toBeNull();
  });

  it("rejects a valid proof supplied for the wrong requested engine or index", () => {
    const f = fixture();
    expect(
      decide("evidence", f.episode, [f.word], [f.A.chunks[0], f.B.chunks[0]]).report,
    ).toBeNull();
  });

  it("rejects a chunk from a different committed clip", () => {
    const f = fixture();
    expect(
      decide(
        "closed",
        f.episode,
        [f.word],
        [{ ...f.A.chunks[0], clipId: `0x${"34".repeat(32)}` }, ...f.chunks.slice(1)],
      ).report,
    ).toBeNull();
  });

  it("cannot report No before the episode has closed", () => {
    const f = fixture([], []);
    expect(decide("closed", { ...f.episode, closed: false }, [f.word], f.chunks).report).toBeNull();
  });

  it("rejects a word belonging to another episode", () => {
    const f = fixture();
    expect(decide("closed", f.episode, [{ ...f.word, episodeId: 8 }], f.chunks).report).toBeNull();
  });

  it("hashes verified leaves deterministically A ascending then B ascending and encodes receiver enums", () => {
    const f = fixture();
    const report = decide("closed", f.episode, [f.word], [...f.chunks].reverse()).report;
    if (!report) throw new Error("Expected report");
    const [episodeId, wordIds, outcomes, hash] = decodeAbiParameters(
      parseAbiParameters("uint32,uint256[],uint8[],bytes32"),
      encodeReport(report),
    );
    expect([episodeId, wordIds, outcomes]).toEqual([7, [9n], [2]]);
    expect(hash).toBe(evidenceHash(f.chunks.map((c) => c.leaf)));
  });
});
