import type { Database } from "bun:sqlite";
import { readFile } from "node:fs/promises";
import { gasLimit } from "@sayso/core";
import type { Hex } from "viem";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
import {
  type Command,
  type EpisodeChain,
  EpisodeRunner,
  FLAG_LEAD_MS,
  PULL_LEAD_MS,
  type Receipt,
} from "./runner.ts";

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
    // The real adapter sleeps until notBeforeMs before signing; the fake advances the clock.
    if (command.notBeforeMs !== undefined && now < command.notBeforeMs) now = command.notBeforeMs;
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

it("wakes one lead before a flag and signs it exactly at its spoken time", async () => {
  await runner.request("on_demand", "judge");
  // Nothing due in a Live window: sleep a full second instead of polling every block.
  now = 165000;
  expect(runner.nextWakeMs()).toBe(1000);
  // Before: the clock woke at t itself and only then began seven serial pre-sign reads.
  now = 166000;
  expect(runner.nextWakeMs()).toBe(167090 - FLAG_LEAD_MS - 166000);
  const sendTimes: number[] = [];
  const broadcast = chain.broadcast.bind(chain);
  chain.broadcast = async (tx) => {
    if (chain.prepared.get(tx.hash)?.kind === "flagSaid") sendTimes.push(now);
    return broadcast(tx);
  };
  now += runner.nextWakeMs();
  await runner.tick();
  expect(chain.prepared.get(hash(3))).toMatchObject({ kind: "flagSaid", notBeforeMs: 167090 });
  expect(sendTimes).toEqual([167090]);
  expect(db.query("SELECT sent_ms FROM actions WHERE kind='flag' AND word_id=2").get()).toEqual({
    sent_ms: 167090,
  });
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
it("streams a flag only once its spoken time arrives and never a future one", async () => {
  await runner.request("on_demand", "judge");
  const events: { event: string; data: unknown; at: number }[] = [];
  const unsubscribe = runner.subscribe(1, (event) => events.push({ ...event, at: now }));
  expect(JSON.stringify(events)).not.toContain("7090");
  now = 166000;
  await runner.tick();
  expect(events.filter((e) => e.event === "flag")).toEqual([]);
  // Picked inside its lead at 167089, the flag streams when the adapter signs it at 167090.
  now = 167089;
  await runner.tick();
  const flags = events.filter((e) => e.event === "flag");
  expect(flags.map((e) => e.at)).toEqual([167090, 167090]);
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

it("drains an admitted OPERATOR receipt before shutdown and rejects subsequent writes", async () => {
  await runner.request("on_demand", "judge");
  now = 167090;
  const hold = Promise.withResolvers<void>();
  chain.hold = hold;
  chain.broadcasting = Promise.withResolvers<void>();
  const ticking = runner.tick();
  await chain.broadcasting.promise;
  let stopped = false;
  const stopping = runner.stop().then(() => {
    stopped = true;
  });
  await expect(runner.request("on_demand", "after-stop")).rejects.toMatchObject({ status: 503 });
  await expect(runner.tick()).rejects.toMatchObject({ status: 503 });
  expect(stopped).toBe(false);
  expect(db.query("SELECT status FROM actions WHERE kind='flag' AND word_id=2").get()).toEqual({
    status: "sent",
  });
  const signatures = chain.prepared.size;
  chain.hold = undefined;
  hold.resolve();
  await ticking;
  await stopping;
  expect(stopped).toBe(true);
  expect(db.query("SELECT status FROM actions WHERE kind='flag' AND word_id=2").get()).toEqual({
    status: "confirmed",
  });
  expect(chain.prepared.size).toBe(signatures);
  expect(db.query("SELECT COUNT(*) AS n FROM episode_requests").get()).toEqual({ n: 1 });
});

it.each(["flagSaid", "markEvidence"] as const)(
  "recovers an unknown signed %s before expiry/state checks and before another signature",
  async (kind) => {
    await runner.request("on_demand", "judge");
    const broadcast = chain.broadcast.bind(chain);
    const attempts: { hash: Hex; raw: Hex }[] = [];
    chain.broadcast = async (tx) => {
      if (chain.prepared.get(tx.hash)!.kind === kind) {
        attempts.push(tx);
        throw new Error("broadcast outcome unknown");
      }
      return broadcast(tx);
    };
    now = kind === "flagSaid" ? 167090 : 172000;
    await expect(runner.tick()).rejects.toMatchObject({ status: 503 });
    const signatures = chain.prepared.size;
    chain.word = async () => ({ state: 2 });
    now = 200000;
    chain.hold = Promise.withResolvers<void>();
    chain.broadcasting = Promise.withResolvers<void>();
    chain.broadcast = async (tx) => {
      attempts.push(tx);
      return broadcast(tx);
    };
    const recovering = runner.tick();
    await chain.broadcasting.promise;
    expect(attempts[1]).toEqual(attempts[0]);
    expect(chain.prepared.size).toBe(signatures);
    expect(db.query("SELECT status FROM actions WHERE tx_hash=?").get(attempts[0]!.hash)).toEqual({
      status: "sent",
    });
    const hold = chain.hold;
    chain.hold = undefined;
    hold.resolve();
    await recovering;
    expect(db.query("SELECT status FROM actions WHERE tx_hash=?").get(attempts[0]!.hash)).toEqual({
      status: "confirmed",
    });
  },
);

it("drains detached maker and receipt hooks before shutdown completes", async () => {
  const maker = Promise.withResolvers<void>();
  const receiptHook = Promise.withResolvers<void>();
  runner = new EpisodeRunner({
    db,
    now: () => now,
    chain,
    log: () => {},
    seed: { ready: seed.ready, seed: seed.seed, tick: () => maker.promise },
    onReceipt: () => receiptHook.promise,
  });
  await runner.request("on_demand", "judge");
  let stopped = false;
  const stopping = runner.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  maker.resolve();
  await Promise.resolve();
  expect(stopped).toBe(false);
  receiptHook.resolve();
  await stopping;
  expect(stopped).toBe(true);
});

it.each(["flag", "create"] as const)(
  "refuses a fresh %s signature after restart until the latest confirmed OPERATOR receipt is observed",
  async (next) => {
    await runner.request("on_demand", "judge");
    const receipt = chain.receipt.bind(chain);
    chain.receipt = async () => null;
    if (next === "create") chain.settled = true;
    else now = 167090;
    runner = new EpisodeRunner({ db, now: () => now, chain, seed, log: () => {} });
    const signatures = chain.prepared.size;
    await expect(
      next === "create" ? runner.request("on_demand", "other") : runner.tick(),
    ).rejects.toMatchObject({ status: 503 });
    expect(chain.prepared.size).toBe(signatures);
    chain.receipt = receipt;
    await runner.tick();
    expect(chain.prepared.size).toBeGreaterThan(signatures);
  },
);

it("kicks the BOT on a flag receipt while later OPERATOR work in the same tick is pending", async () => {
  const kicks: number[] = [];
  runner = new EpisodeRunner({
    db,
    now: () => now,
    chain,
    log: () => {},
    seed: {
      ...seed,
      async tick() {
        kicks.push(now);
      },
    },
  });
  await runner.request("on_demand", "judge");
  await runner.tickMaker();
  kicks.length = 0;
  const evidence = Promise.withResolvers<void>();
  const sending = Promise.withResolvers<void>();
  const broadcast = chain.broadcast.bind(chain);
  chain.broadcast = async (tx) => {
    if (chain.prepared.get(tx.hash)?.kind === "markEvidence") {
      sending.resolve();
      await evidence.promise;
    }
    return broadcast(tx);
  };
  now = 172000;
  const ticking = runner.tick();
  await sending.promise;
  // Both words are SAID and their bids due. Before, the BOT ran only after the whole tick.
  expect(kicks).not.toEqual([]);
  evidence.resolve();
  await ticking;
});

it("runs the BOT clock for a pull lead while an OPERATOR flag receipt is pending", async () => {
  let runs = 0;
  runner = new EpisodeRunner({
    db,
    now: () => now,
    chain,
    log: () => {},
    seed: {
      ...seed,
      async tick() {
        runs++;
      },
    },
  });
  await runner.request("on_demand", "judge");
  db.query("UPDATE actions SET status='confirmed' WHERE kind='seed'").run();
  now = 165000;
  await runner.tickMaker();
  // Word 2's pull is at 166690 (t − 400 ms); the BOT clock wakes PULL_LEAD_MS before it.
  expect(runner.nextMakerWakeMs()).toBe(166690 - PULL_LEAD_MS - 165000);
  chain.hold = Promise.withResolvers<void>();
  chain.broadcasting = Promise.withResolvers<void>();
  now = 167090;
  const ticking = runner.tick();
  await chain.broadcasting.promise;
  runs = 0;
  // Word 1's pull lead begins while word 2's flag receipt is still outstanding.
  now = 170460 - PULL_LEAD_MS;
  await runner.tickMaker();
  expect(runs).toBe(1);
  const release = chain.hold;
  chain.hold = undefined;
  release.resolve();
  await ticking;
});

it("reports a rejected BOT tick and keeps its clock available for the next run", async () => {
  const errors: string[] = [];
  let attempts = 0;
  runner = new EpisodeRunner({
    db,
    now: () => now,
    chain,
    log: () => {},
    seed: {
      ...seed,
      async tick() {
        if (++attempts === 1) throw new Error("BOT read unavailable");
      },
    },
    onBackgroundError(source) {
      errors.push(source);
    },
  });
  await runner.tickMaker();
  expect(errors).toEqual(["maker"]);
  expect(runner.nextMakerWakeMs()).toBe(5000);
  now += runner.nextMakerWakeMs();
  await runner.tickMaker();
  expect(attempts).toBe(2);
  await runner.stop();
});
