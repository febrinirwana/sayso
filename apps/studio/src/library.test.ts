import type { Database } from "bun:sqlite";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
import { ingestClip } from "./library.ts";

const fixture = fileURLToPath(new URL("../../../clips/fixtures/tts-market/", import.meta.url));
let directory: string;
let db: Database;
let clipDirectory: string;
let clock = 111999;
const chain = {
  async snapshot() {
    return { headNumber: "1", headTimestampMs: clock, balances: [] };
  },
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "sayso-studio-"));
  clipDirectory = join(directory, "tts-market");
  await cp(fixture, clipDirectory, { recursive: true });
  const expected = JSON.parse(await readFile(join(clipDirectory, "expected.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(clipDirectory, "manifest.json"), "utf8"));
  await writeFile(
    join(clipDirectory, "clip.json"),
    JSON.stringify({
      id: manifest.id,
      clip_id: expected.clipId,
      media_sha256: expected.mediaSha256,
      duration_ms: expected.durationMs,
      licence: manifest.licence,
      source_url: manifest.sourceUrl,
      words_json: JSON.stringify(manifest.words),
      root_a: expected.rootA,
      root_b: expected.rootB,
    }),
  );
  db = openDatabase(":memory:");
  clock = 111999;
});
afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

async function loadEpisode() {
  await ingestClip(db, clipDirectory, 777);
  db.query(
    "INSERT INTO episodes (id, clip_id, origin, starts_at_ms, ends_at_ms, state) SELECT 1, clip_id, 'on_demand', 100000, 132090, 'Live' FROM clips",
  ).run();
  return createApp({ db, now: () => clock, chain });
}

it("ingests both engines and agreed flags with a studio creation timestamp", async () => {
  await ingestClip(db, clipDirectory, 777);
  expect(db.query("SELECT id, duration_ms, created_at FROM clips").get()).toEqual({
    id: "tts-market",
    duration_ms: 32090,
    created_at: 777,
  });
  expect(
    db.query("SELECT engine, COUNT(*) AS count FROM chunks GROUP BY engine ORDER BY engine").all(),
  ).toEqual([
    { engine: "A", count: 4 },
    { engine: "B", count: 4 },
  ]);
  expect(
    db.query("SELECT word, t_ms, chunk_a, chunk_b FROM flag_plan ORDER BY word").all(),
  ).toEqual([
    { word: "block", t_ms: 10860, chunk_a: 1, chunk_b: 1 },
    { word: "market", t_ms: 7090, chunk_a: 0, chunk_b: 0 },
  ]);
});

it("rejects a token-tampered chunk before committing any clip rows", async () => {
  const path = join(clipDirectory, "chunks", "B", "0.json");
  const chunk = JSON.parse(await readFile(path, "utf8"));
  chunk.tokens[0][0] = "tampered";
  await writeFile(path, JSON.stringify(chunk));
  await expect(ingestClip(db, clipDirectory, 777)).rejects.toThrow();
  expect(db.query("SELECT COUNT(*) AS count FROM clips").get()).toEqual({ count: 0 });
});

it("refuses mismatched committed roots", async () => {
  const path = join(clipDirectory, "clip.json");
  const clip = JSON.parse(await readFile(path, "utf8"));
  clip.root_b = clip.root_a;
  await writeFile(path, JSON.stringify(clip));
  await expect(ingestClip(db, clipDirectory, 777)).rejects.toThrow();
});

it("refuses a missing final chunk rather than accepting incomplete NO evidence", async () => {
  await rm(join(clipDirectory, "chunks", "B", "3.json"));
  await expect(ingestClip(db, clipDirectory, 777)).rejects.toThrow();
  expect(db.query("SELECT COUNT(*) AS count FROM chunks").get()).toEqual({ count: 0 });
});

it("reveals no bytes one millisecond early and serves the exact payload at the boundary", async () => {
  const app = await loadEpisode();
  const early = await app.request("/v1/episodes/1/chunks/A/0");
  expect(early.status).toBe(425);
  expect(await early.text()).toBe("");
  clock = 112000;
  const ready = await app.request("/v1/episodes/1/chunks/A/0");
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual(
    JSON.parse(await readFile(join(clipDirectory, "chunks", "A", "0.json"), "utf8")),
  );
  const later = await app.request("/v1/episodes/1/chunks/B/3");
  expect(later.status).toBe(425);
  expect(await later.text()).toBe("");
});

it.each(["Closed", "Settled"])(
  "makes every chunk public after episode state becomes %s",
  async (state) => {
    const app = await loadEpisode();
    db.query("UPDATE episodes SET state = ? WHERE id = 1").run(state);
    clock = 100000;
    for (const engine of ["A", "B"]) {
      for (const index of [0, 1, 2, 3]) {
        const response = await app.request(`/v1/episodes/1/chunks/${engine}/${index}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(
          JSON.parse(
            await readFile(join(clipDirectory, "chunks", engine, `${index}.json`), "utf8"),
          ),
        );
      }
    }
  },
);

it.each([
  "/2/chunks/A/0",
  "/1/chunks/C/0",
  "/1/chunks/a/0",
  "/1/chunks/A/4",
  "/1/chunks/A/-1",
  "/1/chunks/A/0.0",
  "/x/chunks/A/0",
])("returns 404 without evidence for unknown selection %s", async (suffix) => {
  const app = await loadEpisode();
  const response = await app.request(`/v1/episodes${suffix}`);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("");
});
