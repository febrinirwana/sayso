import type { Database } from "bun:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CHUNK_MS,
  canonicalTokensJson,
  chunkCount,
  isValidTarget,
  leafHash,
  merkleRoot,
  verifyProof,
} from "@sayso/core";
import type { Hex } from "viem";
import { z } from "zod";

const hash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hex);
const ms = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const clipSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  clip_id: hash,
  media_sha256: hash,
  duration_ms: ms.positive(),
  licence: z.enum(["team-recorded", "public-domain", "CC0"]),
  source_url: z.string().nullable(),
  words_json: z.string(),
  root_a: hash,
  root_b: hash,
});
const chunkSchema = z.object({
  clipId: hash,
  engine: z.enum(["A", "B"]),
  index: ms,
  startMs: ms,
  endMs: ms,
  tokens: z.array(z.tuple([z.string(), ms, ms])),
  leaf: hash,
  proof: z.array(hash),
});
const planSchema = z.record(
  z.string(),
  z.object({ t_ms: ms, chunk_a: ms, chunk_b: ms }).nullable(),
);

export async function ingestClip(db: Database, directory: string, createdAt: number) {
  const clip = clipSchema.parse(JSON.parse(await readFile(join(directory, "clip.json"), "utf8")));
  const words = z
    .array(z.string().refine(isValidTarget))
    .length(6)
    .parse(JSON.parse(clip.words_json));
  if (new Set(words).size !== 6) throw new Error("Clip words must be distinct");
  const count = chunkCount(clip.duration_ms);
  const chunks: z.infer<typeof chunkSchema>[] = [];
  for (const engine of ["A", "B"] as const) {
    const chunkDirectory = join(directory, "chunks", engine);
    const files = await readdir(chunkDirectory);
    if (
      files.length !== count ||
      Array.from({ length: count }, (_, index) => `${index}.json`).some(
        (name) => !files.includes(name),
      )
    ) {
      throw new Error("Incomplete clip chunk set");
    }
    const engineChunks = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const chunk = chunkSchema.parse(
          JSON.parse(await readFile(join(chunkDirectory, `${index}.json`), "utf8")),
        );
        if (
          chunk.clipId !== clip.clip_id ||
          chunk.engine !== engine ||
          chunk.index !== index ||
          chunk.startMs !== index * CHUNK_MS ||
          chunk.endMs !== (index + 1) * CHUNK_MS ||
          chunk.tokens.some(
            ([, start, end]) => start < chunk.startMs || start >= chunk.endMs || end < start,
          )
        ) {
          throw new Error("Chunk metadata does not match clip");
        }
        return chunk;
      }),
    );
    const leaves = engineChunks.map((chunk) =>
      leafHash(chunk.clipId, engine, chunk.index, chunk.startMs, chunk.endMs, chunk.tokens),
    );
    const root = engine === "A" ? clip.root_a : clip.root_b;
    if (
      merkleRoot(leaves) !== root ||
      engineChunks.some(
        (chunk, index) =>
          chunk.leaf !== leaves[index] || !verifyProof(chunk.leaf, chunk.proof, root),
      )
    ) {
      throw new Error("Clip chunks do not match committed root");
    }
    chunks.push(...engineChunks);
  }
  const plan = planSchema.parse(
    JSON.parse(await readFile(join(directory, "flag-plan.json"), "utf8")),
  );
  if (Object.keys(plan).length !== words.length || words.some((word) => !(word in plan)))
    throw new Error("Flag plan must cover clip words");
  for (const entry of Object.values(plan)) {
    if (
      entry &&
      (entry.t_ms >= clip.duration_ms || entry.chunk_a >= count || entry.chunk_b >= count)
    )
      throw new Error("Flag plan outside clip");
  }
  db.transaction(() => {
    const existing = db
      .query<z.infer<typeof clipSchema>, [string]>(
        "SELECT id, clip_id, media_sha256, duration_ms, licence, source_url, words_json, root_a, root_b FROM clips WHERE id = ?",
      )
      .get(clip.id);
    if (existing) {
      if (
        Object.entries(clip).some(
          ([key, value]) => existing[key as keyof typeof existing] !== value,
        )
      )
        throw new Error("Existing clip metadata differs");
      return;
    }
    db.query("INSERT INTO clips VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      clip.id,
      clip.clip_id,
      clip.media_sha256,
      clip.duration_ms,
      clip.licence,
      clip.source_url,
      clip.words_json,
      clip.root_a,
      clip.root_b,
      createdAt,
    );
    const insertChunk = db.query("INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const chunk of chunks)
      insertChunk.run(
        chunk.clipId,
        chunk.engine,
        chunk.index,
        chunk.startMs,
        chunk.endMs,
        canonicalTokensJson(chunk.tokens),
        chunk.leaf,
        JSON.stringify(chunk.proof),
      );
    const insertFlag = db.query("INSERT INTO flag_plan VALUES (?, ?, ?, ?, ?)");
    for (const [word, entry] of Object.entries(plan))
      if (entry) insertFlag.run(clip.clip_id, word, entry.t_ms, entry.chunk_a, entry.chunk_b);
  })();
  return clip.clip_id;
}

export async function loadClipLibrary(db: Database, directory: string, now: () => number) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await ingestClip(db, join(directory, entry.name), now());
  }
}
