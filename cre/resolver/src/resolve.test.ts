import { chunkTranscript, leafHash, merkleProof, merkleRoot } from "@sayso/core";
import type { Hex } from "viem";
import { expect, it } from "vitest";
import type { Report, Word } from "./decide.ts";
import { type ResolverIO, resolve } from "./resolve.ts";

function environment() {
  const clipId = `0x${"ab".repeat(32)}` as Hex;
  const chunks = (["A", "B"] as const).flatMap((engine) => {
    const parts = chunkTranscript(
      engine === "A" ? [["monad", 9_800, 9_900]] : [["monad", 10_000, 10_100]],
      20_000,
    );
    const leaves = parts.map((p) =>
      leafHash(clipId, engine, p.index, p.startMs, p.endMs, p.tokens),
    );
    return parts.map((p) => ({
      ...p,
      clipId,
      engine,
      leaf: leaves[p.index] as Hex,
      proof: merkleProof(leaves, p.index),
    }));
  });
  const words: Word[] = [
    { id: 1n, episodeId: 1, state: 1, text: "monad", chunkA: 0, chunkB: 1 },
    { id: 2n, episodeId: 1, state: 0, text: "box", chunkA: 0, chunkB: 0 },
  ];
  const delivered: Report[] = [];
  const io: ResolverIO = {
    readEpisode: () => ({
      id: 1,
      clipId,
      rootA: merkleRoot(chunks.filter((c) => c.engine === "A").map((c) => c.leaf)),
      rootB: merkleRoot(chunks.filter((c) => c.engine === "B").map((c) => c.leaf)),
      durationMs: 20_000,
      closed: true,
      wordCount: 2,
    }),
    readWord: (id) => {
      const word = words.find((w) => w.id === id);
      if (!word) throw new Error("Unknown word");
      return word;
    },
    episodeWords: () => [1n, 2n],
    fetchChunk: (_id, engine, index) =>
      chunks.find((c) => c.engine === engine && c.index === index),
    submitReport: (report) => {
      delivered.push(report);
      return "submitted";
    },
    log: () => {},
  };
  return { io, delivered };
}

it("close resolves every remaining word using both complete engine sets", () => {
  const f = environment();
  resolve("closed", 1, [], f.io);
  expect(f.delivered.map((r) => [r.wordIds, r.outcomes])).toEqual([
    [
      [1n, 2n],
      [2, 3],
    ],
  ]);
});

it("evidence never settles a word No", () => {
  const f = environment();
  resolve("evidence", 1, [1n], f.io);
  expect(f.delivered.map((r) => [r.wordIds, r.outcomes])).toEqual([[[1n], [2]]]);
});

it("a failed chunk fetch withholds every outcome in the close batch", () => {
  const f = environment();
  const fetch = f.io.fetchChunk;
  f.io.fetchChunk = (id, engine, index) => {
    if (engine === "B" && index === 1) throw new Error("Fetch failed");
    return fetch(id, engine, index);
  };
  resolve("closed", 1, [], f.io);
  expect(f.delivered).toEqual([]);
});

it("cannot settle a subset when onchain word enumeration is incomplete", () => {
  const f = environment();
  f.io.episodeWords = () => [1n];
  resolve("closed", 1, [], f.io);
  expect(f.delivered).toEqual([]);
});

it("identifies a terminal false-flag no-write result so close remains runnable", () => {
  const f = environment();
  const logs: string[] = [];
  const read = f.io.readWord;
  f.io.readWord = (id) => ({ ...read(id), text: "box", state: 1 });
  f.io.log = (message) => logs.push(message);
  expect(resolve("evidence", 1, [1n], f.io)).toBe("no-report");
  expect(f.delivered).toEqual([]);
  const marker = logs.find((message) => message.startsWith("SAYSO_CRE_STATUS:"));
  expect(marker).toBeDefined();
  expect(JSON.parse(marker?.slice("SAYSO_CRE_STATUS:".length) ?? "{}")).toEqual({
    episodeId: 1,
    phase: "prewrite",
    result: "no-report",
    retryable: false,
  });
});

it.each(["fetch", "proof"] as const)("allows safe retry of a pre-write %s failure", (failure) => {
  const f = environment();
  const logs: string[] = [];
  f.io.log = (message) => logs.push(message);
  f.io.fetchChunk = () => {
    if (failure === "fetch") throw new Error("private-upstream-response");
    return {};
  };
  expect(resolve("closed", 1, [], f.io)).toBe("no-report");
  expect(f.delivered).toEqual([]);
  const marker = logs.find((message) => message.startsWith("SAYSO_CRE_STATUS:"));
  expect(JSON.parse(marker?.slice("SAYSO_CRE_STATUS:".length) ?? "{}")).toEqual({
    episodeId: 1,
    phase: "prewrite",
    result: "no-report",
    retryable: true,
  });
  expect(logs.join("")).not.toContain("private-upstream-response");
});

it("never certifies no-write after report submission was entered", () => {
  const f = environment();
  const logs: string[] = [];
  f.io.log = (message) => logs.push(message);
  f.io.submitReport = () => {
    throw new Error("ambiguous-broadcast");
  };
  expect(resolve("closed", 1, [], f.io)).toBe("no-report");
  expect(logs.some((message) => message.startsWith("SAYSO_CRE_STATUS:"))).toBe(false);
});
