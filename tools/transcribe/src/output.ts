import {
  agreedSpokenTime,
  CHUNK_MS,
  chunkTranscript,
  type Engine,
  isValidTarget,
  leafHash,
  merkleProof,
  merkleRoot,
  type Token,
} from "@sayso/core";
import { concat, type Hex, keccak256, toBytes } from "viem";
import { object } from "./parsers.ts";

export type Manifest = {
  id: string;
  licence: "team-recorded" | "public-domain" | "CC0";
  sourceUrl: string | null;
  words: string[];
};
export type ChunkPayload = {
  clipId: Hex;
  engine: Engine;
  index: number;
  startMs: number;
  endMs: number;
  tokens: Token[];
  leaf: Hex;
  proof: Hex[];
};
export type FlagPlan = Record<string, { t_ms: number; chunk_a: number; chunk_b: number } | null>;

export function parseManifest(value: unknown): Manifest {
  const entry = object(value);
  if (typeof entry.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
    throw new Error("Manifest id must be a lowercase ASCII slug");
  }
  const licence = entry.licence;
  if (licence !== "team-recorded" && licence !== "public-domain" && licence !== "CC0") {
    throw new Error("Manifest licence must be team-recorded, public-domain or CC0");
  }
  if (
    !Array.isArray(entry.words) ||
    entry.words.length !== 6 ||
    !entry.words.every((word: unknown) => typeof word === "string" && isValidTarget(word)) ||
    new Set(entry.words).size !== 6
  ) {
    throw new Error("Manifest must have six distinct valid target words in curator order");
  }
  if (entry.sourceUrl != null && typeof entry.sourceUrl !== "string") {
    throw new Error("Manifest sourceUrl must be a string or null");
  }
  return { id: entry.id, licence, sourceUrl: entry.sourceUrl ?? null, words: entry.words };
}

export function durationMsFor(seconds: string): number {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(seconds.trim());
  if (!match?.[1]) throw new Error("ffprobe must return a decimal duration");
  const fraction = match[2] ?? "";
  const milliseconds =
    BigInt(match[1]) * 1000n +
    BigInt(fraction.slice(0, 3).padEnd(3, "0")) +
    (/[1-9]/.test(fraction.slice(3)) ? 1n : 0n);
  const result = Number(milliseconds);
  if (!Number.isSafeInteger(result) || result <= 0) throw new RangeError("Invalid clip duration");
  return result;
}

export function clipIdFor(mediaSha256: Hex, manifestId: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(mediaSha256)) throw new Error("Media SHA256 must be bytes32");
  return keccak256(concat([toBytes(mediaSha256), toBytes(manifestId)]));
}

function engineChunks(clipId: Hex, engine: Engine, tokens: readonly Token[], durationMs: number) {
  const chunks = chunkTranscript(tokens, durationMs);
  const leaves = chunks.map((chunk) =>
    leafHash(clipId, engine, chunk.index, chunk.startMs, chunk.endMs, chunk.tokens),
  );
  return {
    root: merkleRoot(leaves),
    chunks: chunks.map(
      (chunk, index): ChunkPayload => ({
        clipId,
        engine,
        ...chunk,
        leaf: leaves[index] as Hex,
        proof: merkleProof(leaves, index),
      }),
    ),
  };
}

export function buildOutput(
  manifest: Manifest,
  mediaSha256: Hex,
  durationMs: number,
  tokensA: readonly Token[],
  tokensB: readonly Token[],
) {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new RangeError("Clip duration must be positive safe-integer milliseconds");
  }
  const clipId = clipIdFor(mediaSha256, manifest.id);
  const a = engineChunks(clipId, "A", tokensA, durationMs);
  const b = engineChunks(clipId, "B", tokensB, durationMs);
  const flagPlan: FlagPlan = {};
  for (const word of manifest.words) {
    const agreed = agreedSpokenTime(word, tokensA, tokensB);
    flagPlan[word] =
      agreed === null
        ? null
        : {
            t_ms: agreed.atMs,
            chunk_a: Math.floor(agreed.aStartMs / CHUNK_MS),
            chunk_b: Math.floor(agreed.bStartMs / CHUNK_MS),
          };
  }
  return { clipId, rootA: a.root, rootB: b.root, chunksA: a.chunks, chunksB: b.chunks, flagPlan };
}
