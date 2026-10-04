import { concat, encodeAbiParameters, type Hex, keccak256, toBytes } from "viem";
import type { Token } from "./match.ts";

export const CHUNK_MS = 10_000;
export type Engine = "A" | "B";
export type Chunk = {
  index: number;
  startMs: number;
  endMs: number;
  tokens: Token[];
};

export function engineCode(engine: Engine): 0 | 1 {
  return engine === "A" ? 0 : 1;
}

export function chunkCount(durationMs: number): number {
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new RangeError("Transcript duration must be a positive integer");
  }
  return Math.ceil(durationMs / CHUNK_MS);
}

export function chunkIndexOf(ms: number): number {
  return Math.floor(ms / CHUNK_MS);
}

export function chunkTranscript(tokens: readonly Token[], durationMs: number): Chunk[] {
  const chunks = Array.from(
    { length: chunkCount(durationMs) },
    (_, index): Chunk => ({
      index,
      startMs: index * CHUNK_MS,
      endMs: (index + 1) * CHUNK_MS,
      tokens: [],
    }),
  );
  for (const token of tokens) {
    const [, startMs, endMs] = token;
    if (startMs < 0 || endMs < 0 || startMs > endMs || startMs >= durationMs) {
      throw new RangeError("Token times must be ordered, nonnegative and start before duration");
    }
    const chunk = chunks[chunkIndexOf(startMs)];
    if (!chunk) {
      throw new RangeError("Token start must select an existing chunk");
    }
    chunk.tokens.push(token);
  }
  for (const chunk of chunks) {
    chunk.tokens.sort((a, b) => a[1] - b[1]);
  }
  return chunks;
}

export function canonicalTokensJson(tokens: readonly Token[]): string {
  return JSON.stringify(tokens.map((token) => [token[0], token[1], token[2]]));
}

export function tokensHash(tokens: readonly Token[]): Hex {
  return keccak256(toBytes(canonicalTokensJson(tokens)));
}

export function leafHash(
  clipId: Hex,
  engine: Engine,
  index: number,
  startMs: number,
  endMs: number,
  tokens: readonly Token[],
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint32" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "bytes32" },
      ],
      [clipId, engineCode(engine), index, BigInt(startMs), BigInt(endMs), tokensHash(tokens)],
    ),
  );
}

export function evidenceHash(leaves: readonly Hex[]): Hex {
  return keccak256(concat(leaves));
}
