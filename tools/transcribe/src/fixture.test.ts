import { readFile } from "node:fs/promises";
import { canonicalTokensJson, leafHash, merkleRoot, verifyProof } from "@sayso/core";
import type { Hex } from "viem";
import { expect, it } from "vitest";
import { buildOutput, type ChunkPayload, type FlagPlan, parseManifest } from "./output.ts";

const fixture = new URL("../../../clips/fixtures/tts-market/", import.meta.url);

it("recomputes the tracked fixture commitments and flag plan byte for byte", async () => {
  const manifest = parseManifest(
    JSON.parse(await readFile(new URL("manifest.json", fixture), "utf8")),
  );
  const expected: {
    clipId: Hex;
    rootA: Hex;
    rootB: Hex;
    mediaSha256: Hex;
    durationMs: number;
    flagPlan: FlagPlan;
  } = JSON.parse(await readFile(new URL("expected.json", fixture), "utf8"));
  const groups: ChunkPayload[][] = [];
  for (const engine of ["A", "B"] as const) {
    const chunks: ChunkPayload[] = [];
    const root = engine === "A" ? expected.rootA : expected.rootB;
    for (let index = 0; index < Math.ceil(expected.durationMs / 10000); index++) {
      const chunk: ChunkPayload = JSON.parse(
        await readFile(new URL(`chunks/${engine}/${index}.json`, fixture), "utf8"),
      );
      expect(chunk.clipId).toBe(expected.clipId);
      expect(chunk.engine).toBe(engine);
      expect(chunk.index).toBe(index);
      const leaf = leafHash(
        expected.clipId,
        engine,
        index,
        chunk.startMs,
        chunk.endMs,
        chunk.tokens,
      );
      expect(chunk.leaf).toBe(leaf);
      expect(verifyProof(leaf, chunk.proof, root)).toBe(true);
      expect(JSON.stringify(chunk.tokens)).toBe(canonicalTokensJson(chunk.tokens));
      chunks.push(chunk);
    }
    expect(merkleRoot(chunks.map(({ leaf }) => leaf))).toBe(root);
    groups.push(chunks);
  }
  const output = buildOutput(
    manifest,
    expected.mediaSha256,
    expected.durationMs,
    groups[0]?.flatMap(({ tokens }) => tokens) ?? [],
    groups[1]?.flatMap(({ tokens }) => tokens) ?? [],
  );
  expect(output.clipId).toBe(expected.clipId);
  expect(output.rootA).toBe(expected.rootA);
  expect(output.rootB).toBe(expected.rootB);
  expect(output.flagPlan).toEqual(expected.flagPlan);
  expect(`${JSON.stringify(output.flagPlan, null, 2)}\n`).toBe(
    await readFile(new URL("flag-plan.json", fixture), "utf8"),
  );
  for (const chunks of [output.chunksA, output.chunksB]) {
    for (const chunk of chunks) {
      expect(`${JSON.stringify(chunk, null, 2)}\n`).toBe(
        await readFile(new URL(`chunks/${chunk.engine}/${chunk.index}.json`, fixture), "utf8"),
      );
    }
  }
});
