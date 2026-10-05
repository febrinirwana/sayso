import {
  agreedSpokenTime,
  CHUNK_MS,
  chunkCount,
  evidenceHash,
  leafHash,
  merkleRoot,
  type Token,
  verifyProof,
} from "@sayso/core";
import { encodeAbiParameters, type Hex, parseAbiParameters } from "viem";
import { z } from "zod";

const hashSchema = z
  .string()
  .regex(/^0x[\da-fA-F]{64}$/)
  .transform((value) => value as Hex);
const timeSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const chunkSchema = z.object({
  clipId: hashSchema,
  engine: z.enum(["A", "B"]),
  index: z.number().int().nonnegative().max(0xffff_ffff),
  startMs: timeSchema,
  endMs: timeSchema,
  tokens: z.array(z.tuple([z.string(), timeSchema, timeSchema])),
  leaf: hashSchema,
  proof: z.array(hashSchema),
});
export type ChunkPayload = z.infer<typeof chunkSchema>;
export type Mode = "evidence" | "closed";
export type Episode = {
  id: number;
  clipId: Hex;
  rootA: Hex;
  rootB: Hex;
  durationMs: number;
  closed: boolean;
};
export type Word = {
  id: bigint;
  episodeId: number;
  text: string;
  state: number;
  chunkA: number;
  chunkB: number;
};
export type Report = {
  episodeId: number;
  wordIds: bigint[];
  outcomes: (2 | 3)[];
  evidenceHash: Hex;
};
export type Decision = { report: Report | null; reason: string | null };

// These same requests drive fetching and verification. No API-provided count is trusted.
export function requiredChunks(mode: Mode, episode: Episode, words: readonly Word[]) {
  const count = chunkCount(episode.durationMs);
  const remaining = words.filter((w) =>
    mode === "evidence" ? w.state === 1 : w.state === 0 || w.state === 1,
  );
  return (["A", "B"] as const).flatMap((engine) => {
    const indices =
      mode === "closed"
        ? Array.from({ length: count }, (_, index) => index)
        : [...new Set(remaining.map((w) => (engine === "A" ? w.chunkA : w.chunkB)))].sort(
            (a, b) => a - b,
          );
    return indices.map((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= count) {
        throw new Error("Flagged chunk index is outside the committed clip");
      }
      return { engine, index };
    });
  });
}

export function decide(
  mode: Mode,
  episode: Episode,
  words: readonly Word[],
  payloads: readonly unknown[],
): Decision {
  try {
    if (mode === "closed" && !episode.closed) throw new Error("Episode is not closed");
    if (words.some((word) => word.episodeId !== episode.id)) {
      throw new Error("Word belongs to another episode");
    }
    if (new Set(words.map((word) => word.id)).size !== words.length) {
      throw new Error("Duplicate word id");
    }
    const remaining = words.filter((w) =>
      mode === "evidence" ? w.state === 1 : w.state === 0 || w.state === 1,
    );
    if (remaining.length === 0) return { report: null, reason: "No unresolved eligible words" };
    const requests = requiredChunks(mode, episode, remaining);
    if (payloads.length !== requests.length) throw new Error("Incomplete chunk set");
    const chunks = payloads.map((payload) => chunkSchema.parse(payload));
    const tokens = { A: [] as Token[], B: [] as Token[] };
    const leaves: Hex[] = [];
    for (const { engine, index } of requests) {
      const matches = chunks.filter((c) => c.engine === engine && c.index === index);
      const chunk = matches[0];
      if (matches.length !== 1 || !chunk) {
        throw new Error(`Missing or duplicate ${engine}/${index} chunk`);
      }
      if (chunk.clipId.toLowerCase() !== episode.clipId.toLowerCase()) {
        throw new Error(`Wrong clip for ${engine}/${index}`);
      }
      if (chunk.startMs !== index * CHUNK_MS || chunk.endMs !== (index + 1) * CHUNK_MS) {
        throw new Error(`Invalid chunk bounds for ${engine}/${index}`);
      }
      for (const [, start, end] of chunk.tokens) {
        if (
          start < chunk.startMs ||
          start >= chunk.endMs ||
          start >= episode.durationMs ||
          start > end
        ) {
          throw new Error(`Invalid token bounds for ${engine}/${index}`);
        }
      }
      const leaf = leafHash(
        episode.clipId,
        engine,
        index,
        chunk.startMs,
        chunk.endMs,
        chunk.tokens,
      );
      if (
        leaf.toLowerCase() !== chunk.leaf.toLowerCase() ||
        !verifyProof(leaf, chunk.proof, engine === "A" ? episode.rootA : episode.rootB)
      ) {
        throw new Error(`Invalid leaf or proof for ${engine}/${index}`);
      }
      leaves.push(leaf);
      tokens[engine].push(...chunk.tokens);
    }
    if (mode === "closed") {
      const count = chunkCount(episode.durationMs);
      if (
        merkleRoot(leaves.slice(0, count)).toLowerCase() !== episode.rootA.toLowerCase() ||
        merkleRoot(leaves.slice(count)).toLowerCase() !== episode.rootB.toLowerCase()
      ) {
        throw new Error("Full chunk sets do not reconstruct both committed roots");
      }
    }
    const report: Report = {
      episodeId: episode.id,
      wordIds: [],
      outcomes: [],
      evidenceHash: evidenceHash(leaves),
    };
    for (const word of remaining) {
      // Evidence uses only this word's flagged pair, not other words' partial transcripts.
      const a =
        mode === "closed"
          ? tokens.A
          : (chunks.find((c) => c.engine === "A" && c.index === word.chunkA)?.tokens ?? []);
      const b =
        mode === "closed"
          ? tokens.B
          : (chunks.find((c) => c.engine === "B" && c.index === word.chunkB)?.tokens ?? []);
      const agreed = agreedSpokenTime(word.text, a, b) !== null;
      if (agreed || mode === "closed") {
        report.wordIds.push(word.id);
        report.outcomes.push(agreed ? 2 : 3);
      }
    }
    return report.wordIds.length === 0
      ? { report: null, reason: "Flagged words lack two-engine agreement; defer until close" }
      : { report, reason: null };
  } catch (error) {
    // Never include parsed payloads (which can contain transcripts) in diagnostics.
    return {
      report: null,
      reason:
        error instanceof z.ZodError
          ? "Malformed chunk payload"
          : error instanceof Error
            ? error.message
            : "Evidence verification failed",
    };
  }
}

export function encodeReport(report: Report): Hex {
  return encodeAbiParameters(
    parseAbiParameters("uint32 episodeId,uint256[] wordIds,uint8[] outcomes,bytes32 evidenceHash"),
    [report.episodeId, report.wordIds, report.outcomes, report.evidenceHash],
  );
}
