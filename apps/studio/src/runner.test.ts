import type { Database } from "bun:sqlite";
import { readFile } from "node:fs/promises";
import { gasLimit } from "@sayso/core";
import type { Hex } from "viem";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
import { type Command, type EpisodeChain, EpisodeRunner, type Receipt } from "./runner.ts";

const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
let db: Database;
let now: number;
let chain: FakeChain;
let runner: EpisodeRunner;
const seed = {
  async ready() {
    return true;
  },
  async seed(id: number) {
    chain.seeded.add(id);
  },
};
class FakeChain implements EpisodeChain {
  commands: Command[] = [];
  prepared = new Map<Hex, Command>();
  receipts = new Map<Hex, Receipt>();
  flagged = new Set<number>();
  seeded = new Set<number>();
  listed = false;
  closed = false;
  settled = false;
  head = 1;
  episodeId = 0;
  hold: { promise: Promise<void>; resolve(): void } | undefined;
  broadcasting = Promise.withResolvers<void>();
  async prepare(command: Command) {
    const tx = hash(this.prepared.size + 1);
    this.prepared.set(tx, command);
    return { hash: tx, raw: tx };
  }
  async broadcast(tx: { hash: Hex; raw: Hex }) {
    if (this.receipts.has(tx.hash)) return this.receipts.get(tx.hash)!;
    const command = this.prepared.get(tx.hash)!;
    this.commands.push(command);
    if (command.kind === "listEpisode") this.listed = true;
    this.broadcasting.resolve();
    if (this.hold) await this.hold.promise;
    if (command.kind === "flagSaid") this.flagged.add(Number(command.args[0]));
    if (command.kind === "closeEpisode") this.closed = true;
    if (command.kind === "createEpisode") this.episodeId++;
    const receipt: Receipt = {
      hash: tx.hash,
      block: this.head++,
      success: true,
      created:
        command.kind === "createEpisode"
          ? { id: this.episodeId, words: [1, 2, 3, 4, 5, 6] }
          : undefined,
    };
    this.receipts.set(tx.hash, receipt);
    return receipt;
  }
  async receipt(tx: Hex) {
    return this.receipts.get(tx) ?? null;
  }
  async episode() {
    return {
      listed: this.listed,
      closed: this.closed,
      resolvedCount: this.settled ? 6 : 0,
      wordCount: 6,
      startsAt: 160,
      endsAt: 195,
      timestamp: Math.floor(now / 1000),
    };
  }
  async words() {
    return [1, 2, 3, 4, 5, 6];
  }
  async word(id: number) {
    return { state: this.flagged.has(id) ? 1 : 0 };
  }
}
beforeEach(async () => {
  db = openDatabase(":memory:");
  now = 100000;
  chain = new FakeChain();
  const base = new URL("../../../clips/fixtures/tts-market/", import.meta.url);
  const expected = JSON.parse(await readFile(new URL("expected.json", base), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("manifest.json", base), "utf8"));
  db.query("INSERT INTO clips VALUES (?, ?, ?, ?, 'CC0', NULL, ?, ?, ?, 0)").run(
    manifest.id,
    expected.clipId,
    expected.mediaSha256,
    expected.durationMs,
    JSON.stringify(manifest.words),
    expected.rootA,
    expected.rootB,
  );
  for (const engine of ["A", "B"])
    for (let i = 0; i < 4; i++) {
      const chunk = JSON.parse(await readFile(new URL(`chunks/${engine}/${i}.json`, base), "utf8"));
      db.query("INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        expected.clipId,
        engine,
        i,
        chunk.startMs,
        chunk.endMs,
        JSON.stringify(chunk.tokens),
        chunk.leaf,
        JSON.stringify(chunk.proof),
      );
    }
  for (const [word, flag] of Object.entries(expected.flagPlan))
    if (flag) {
      const f = flag as { t_ms: number; chunk_a: number; chunk_b: number };
      db.query("INSERT INTO flag_plan VALUES (?, ?, ?, ?, ?)").run(
        expected.clipId,
        word,
        f.t_ms,
        f.chunk_a,
        f.chunk_b,
      );
    }
  runner = new EpisodeRunner({ db, now: () => now, chain, seed, log: () => {} });
});
afterEach(() => db.close());

it("creates on demand and refuses another request throughout Scheduled, Live and Closed", async () => {
  const app = createApp({
    db,
    now: () => now,
    chain: {
      async snapshot() {
        return { headNumber: "1", headTimestampMs: now, balances: [] };
      },
    },
    runner,
    ip: () => "judge",
  });
  const response = await app.request("/v1/episodes", { method: "POST" });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ episodeId: 1 });
  for (const time of [100000, 160000, 195000]) {
    now = time;
    await runner.tick();
    expect((await app.request("/v1/episodes", { method: "POST" })).status).toBe(409);
  }
  expect(db.query("SELECT state FROM episodes").get()).toEqual({ state: "Closed" });
});
it("persists fixture flag times, reveal batches, and a seconds-safe close margin", async () => {
  await runner.request("on_demand", "judge");
  expect(
    db
      .query(
        "SELECT kind, word_id, scheduled_ms FROM actions WHERE kind IN ('flag','evidence','close') ORDER BY scheduled_ms, id",
      )
      .all(),
  ).toEqual([
    { kind: "flag", word_id: 2, scheduled_ms: 167090 },
    { kind: "flag", word_id: 1, scheduled_ms: 170860 },
    { kind: "evidence", word_id: null, scheduled_ms: 172000 },
    { kind: "evidence", word_id: null, scheduled_ms: 182000 },
    { kind: "close", word_id: null, scheduled_ms: 195000 },
  ]);
  for (const time of [167090, 170860, 172000, 182000, 195000]) {
    now = time;
    await runner.tick();
  }
  expect(chain.flagged).toEqual(new Set([1, 2]));
  expect(chain.closed).toBe(true);
  for (const command of chain.commands)
    expect(command.gas).toBe(
      gasLimit(
        command.kind,
        command.kind === "createEpisode" || command.kind === "listEpisode"
          ? 6
          : command.kind === "markEvidence"
            ? (command.args[1] as number[]).length
            : undefined,
      ),
    );
});
it("never broadcasts a second operator transaction before the first receipt", async () => {
  chain.hold = Promise.withResolvers<void>();
  const creating = runner.request("on_demand", "judge");
  await chain.broadcasting.promise;
  expect(chain.commands.map((c) => c.kind)).toEqual(["createEpisode"]);
  const release = chain.hold;
  chain.hold = undefined;
  release?.resolve();
  await creating;
  expect(chain.commands.map((c) => c.kind)).toEqual(["createEpisode", "listEpisode"]);
});
it("reconciles chain flags after restart without double sending", async () => {
  await runner.request("on_demand", "judge");
  now = 167090;
  await runner.tick();
  db.query(
    "UPDATE actions SET status = 'pending', tx_hash = NULL WHERE kind = 'flag' AND word_id = 2",
  ).run();
  runner = new EpisodeRunner({ db, now: () => now, chain, seed, log: () => {} });
  await runner.tick();
  expect(chain.commands.filter((c) => c.kind === "flagSaid")).toHaveLength(1);
  now = 170860;
  await runner.tick();
  expect(chain.flagged).toEqual(new Set([1, 2]));
});
it("streams only due flags and replays only already-fired flags on reconnect", async () => {
  await runner.request("on_demand", "judge");
  const events: { event: string; data: unknown }[] = [];
  const unsubscribe = runner.subscribe(1, (event) => events.push(event));
  expect(JSON.stringify(events)).not.toContain("7090");
  now = 167089;
  await runner.tick();
  expect(events.filter((e) => e.event === "flag")).toEqual([]);
  now++;
  await runner.tick();
  const flags = events.filter((e) => e.event === "flag");
  expect(flags[0]?.data).toMatchObject({ wordId: 2, t: 7090, scheduledMs: 167090 });
  expect(JSON.stringify(events)).not.toContain("10860");
  unsubscribe?.();
});
it("rate limits the same IP hash after settlement and persists cooldown across restart", async () => {
  await runner.request("on_demand", "judge");
  chain.settled = true;
  runner = new EpisodeRunner({ db, now: () => now, chain, seed, log: () => {} });
  await expect(runner.request("on_demand", "judge")).rejects.toMatchObject({ status: 429 });
});
it("recovers a mined creation receipt when interrupted before inserting the episode", async () => {
  await runner.request("on_demand", "judge");
  db.query("DELETE FROM actions").run();
  db.query("DELETE FROM episodes").run();
  db.query("UPDATE episode_requests SET episode_id = NULL, status = 'creating'").run();
  runner = new EpisodeRunner({ db, now: () => now, chain, seed, log: () => {} });
  await runner.tick();
  expect(db.query("SELECT id, state FROM episodes").get()).toEqual({ id: 1, state: "Scheduled" });
  expect(chain.commands.filter((c) => c.kind === "createEpisode")).toHaveLength(1);
});

it("recovers identical signed bytes after a process stops before broadcasting create", async () => {
  const broadcast = chain.broadcast.bind(chain);
  chain.broadcast = async () => {
    throw new Error("interrupted");
  };
  await expect(runner.request("on_demand", "judge")).rejects.toThrow("interrupted");
  expect(db.query("SELECT create_tx, raw_tx FROM episode_requests").get()).toEqual({
    create_tx: hash(1),
    raw_tx: hash(1),
  });
  chain.broadcast = broadcast;
  runner = new EpisodeRunner({ db, now: () => now, chain, seed, log: () => {} });
  await runner.tick();
  expect(chain.commands.filter((c) => c.kind === "createEpisode")).toHaveLength(1);
  expect(db.query("SELECT state FROM episodes").get()).toEqual({ state: "Scheduled" });
});

it("serves an SSE schedule without including any future transcript-derived flags", async () => {
  await runner.request("on_demand", "judge");
  const app = createApp({
    db,
    now: () => now,
    chain: {
      async snapshot() {
        return { headNumber: "1", headTimestampMs: now, balances: [] };
      },
    },
    runner,
  });
  const response = await app.request("/v1/episodes/1/stream");
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body!.getReader();
  const initial = new TextDecoder().decode((await reader.read()).value);
  expect(initial).toContain("event: schedule");
  expect(initial).not.toContain("7090");
  now = 167089;
  await runner.tick();
  now = 167090;
  await runner.tick();
  let text = "";
  while (!text.includes("event: flag"))
    text += new TextDecoder().decode((await reader.read()).value);
  expect(text).toContain('"wordId":2');
  expect(text).toContain('"t":7090');
  expect(text).not.toContain("10860");
  await reader.cancel();
});

it("starts the hourly slot only once and refuses to overlap an unsettled episode", async () => {
  now = 3_599_999;
  runner = new EpisodeRunner({ db, now: () => now, chain, seed, log: () => {} });
  await runner.tick();
  expect(chain.commands).toEqual([]);
  now = 3_600_000;
  await runner.tick();
  expect(db.query("SELECT origin FROM episodes").get()).toEqual({ origin: "hourly" });
  now = 7_200_000;
  await runner.tick();
  await runner.tick();
  expect(chain.commands.filter((c) => c.kind === "createEpisode")).toHaveLength(1);
});

it("chooses a never-used ingested clip ahead of the previous episode's clip", async () => {
  await runner.request("on_demand", "judge");
  chain.settled = true;
  await runner.tick();
  db.query(`INSERT INTO clips SELECT 'next', ?, media_sha256, duration_ms, licence, source_url,
    words_json, root_a, root_b, created_at + 1 FROM clips WHERE id = 'tts-market'`).run(hash(100));
  await runner.request("on_demand", "other-judge");
  expect(chain.commands.filter((command) => command.kind === "createEpisode").at(-1)?.args[0]).toBe(
    hash(100),
  );
});

it.each([40_000, 39_999])(
  "keeps resolver chunk count equal to the committed chunks for a %i ms clip",
  async (duration) => {
    db.query("UPDATE clips SET duration_ms = ?").run(duration);
    await runner.request("on_demand", "judge");
    const episode = db
      .query<{ starts_at_ms: number; ends_at_ms: number }, []>(
        "SELECT starts_at_ms, ends_at_ms FROM episodes",
      )
      .get()!;
    const committed = db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM chunks WHERE engine = 'A'")
      .get()!.count;
    expect(Math.ceil((episode.ends_at_ms - episode.starts_at_ms) / 10_000)).toBe(committed);
  },
);

it("keeps the final chunk private until delayed playback finishes and the close receipt arrives", async () => {
  db.query("UPDATE clips SET duration_ms = 40000").run();
  await runner.request("on_demand", "judge");
  const app = createApp({
    db,
    now: () => now,
    chain: {
      async snapshot() {
        return { headNumber: "1", headTimestampMs: now, balances: [] };
      },
    },
    runner,
  });
  now = 201999;
  await runner.tick();
  expect(chain.closed).toBe(false);
  expect((await app.request("/v1/episodes/1/chunks/A/3")).status).toBe(425);
  now = 202000;
  await runner.tick();
  expect(chain.closed).toBe(true);
  expect((await app.request("/v1/episodes/1/chunks/A/3")).status).toBe(200);
});

it("refuses a trading episode when the house seed hook is not configured", async () => {
  runner = new EpisodeRunner({ db, now: () => now, chain, log: () => {} });
  await expect(runner.request("on_demand", "judge")).rejects.toMatchObject({ status: 503 });
  expect(chain.commands).toEqual([]);
});

it("publishes all chain word IDs with their public texts so a phone can map a flag to its card", async () => {
  await runner.request("on_demand", "judge");
  const events: { event: string; data: unknown }[] = [];
  const unsubscribe = runner.subscribe(1, (event) => events.push(event));
  expect(events[0]?.data).toMatchObject({
    words: [
      { wordId: 1, text: "block" },
      { wordId: 2, text: "market" },
      { wordId: 3, text: "monad" },
      { wordId: 4, text: "rocket" },
      { wordId: 5, text: "ocean" },
      { wordId: 6, text: "forest" },
    ],
  });
  unsubscribe?.();
});

it("refuses to create books when the house seed dependency reports insufficient funds", async () => {
  runner = new EpisodeRunner({
    db,
    now: () => now,
    chain,
    log: () => {},
    seed: {
      async ready() {
        return false;
      },
      async seed(id) {
        chain.seeded.add(id);
      },
    },
  });
  await expect(runner.request("on_demand", "judge")).rejects.toMatchObject({ status: 503 });
  expect(chain.commands).toEqual([]);
});
