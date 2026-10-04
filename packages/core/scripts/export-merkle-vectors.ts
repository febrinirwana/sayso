import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";
import type { Token } from "../src/match.ts";
import { merkleProof, merkleRoot } from "../src/merkle.ts";
import {
  canonicalTokensJson,
  chunkTranscript,
  engineCode,
  leafHash,
  tokensHash,
} from "../src/transcript.ts";

// Synthetic public evidence only; no real clip outcomes belong in this fixture.
const clipId = keccak256(toBytes("sayso-fixture"));
const engine = "A";
const durationMs = 47_000;
const tokens: readonly Token[] = [
  ["welcome", 300, 800],
  ["café", 9_700, 10_080],
  ["monad", 10_000, 10_600],
  ['say "hi"', 18_000, 18_400],
  ["replay", 31_000, 31_500],
  ["final", 46_900, 47_000],
];
const chunks = chunkTranscript(tokens, durationMs);
const leaves = chunks.map((chunk) =>
  leafHash(clipId, engine, chunk.index, chunk.startMs, chunk.endMs, chunk.tokens),
);
const fixture = {
  durationMs,
  chunkCount: chunks.length,
  root: merkleRoot(leaves),
  chunks: chunks.map((chunk, index) => ({
    clipId,
    engine: engineCode(engine),
    index: chunk.index,
    startMs: chunk.startMs,
    endMs: chunk.endMs,
    tokensJson: canonicalTokensJson(chunk.tokens),
    tokensHash: tokensHash(chunk.tokens),
    leaf: leaves[index],
    proof: merkleProof(leaves, index),
  })),
};
const json = `${JSON.stringify(fixture, null, 2)}\n`;
const destination = new URL("../../../contracts/test/fixtures/merkle.json", import.meta.url);
const file = Bun.file(destination);

if (Bun.argv.includes("--check")) {
  if (!(await file.exists()) || (await file.text()) !== json) {
    console.error("Merkle vectors differ; run bun packages/core/scripts/export-merkle-vectors.ts");
    process.exit(1);
  }
  console.log(`Merkle vectors match: ${chunks.length} chunks, root ${fixture.root}`);
} else {
  await mkdir(fileURLToPath(new URL(".", destination)), { recursive: true });
  await Bun.write(destination, json);
  console.log(`Exported ${chunks.length} Merkle chunks, root ${fixture.root}`);
}
