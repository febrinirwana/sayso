import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { type GasKind, gasLimit } from "@sayso/core";
import type { Hex } from "viem";

export const ActionKind = {
  Create: "create",
  List: "list",
  Seed: "seed",
  Pull: "pull",
  Bid: "bid",
  Flag: "flag",
  Evidence: "evidence",
  Close: "close",
  Redeem: "redeem",
} as const;
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];
export type Command = { kind: GasKind; args: readonly unknown[]; gas: bigint };
export type Prepared = { hash: Hex; raw: Hex };
export type Receipt = {
  hash: Hex;
  block: number;
  success: boolean;
  created?: { id: number; words: number[] } | undefined;
};
export type EpisodeChain = {
  prepare(command: Command): Promise<Prepared>;
  broadcast(transaction: Prepared): Promise<Receipt>;
  receipt(hash: Hex): Promise<Receipt | null>;
  episode(id: number): Promise<{
    listed: boolean;
    closed: boolean;
    resolvedCount: number;
    wordCount: number;
    startsAt: number;
    endsAt: number;
    timestamp: number;
  }>;
  words(id: number): Promise<number[]>;
  word(id: number): Promise<{ state: number }>;
};
export type StreamEvent = { event: "schedule" | "state" | "flag"; data: unknown };
type Episode = {
  id: number;
  clip_id: string;
  starts_at_ms: number;
  ends_at_ms: number;
  state: string;
  list_tx: Hex | null;
};
type Clip = { clip_id: Hex; duration_ms: number; root_a: Hex; root_b: Hex; words_json: string };
type Launch = {
  id: number;
  clip_id: string;
  origin: "hourly" | "on_demand";
  starts_at_ms: number;
  ends_at_ms: number;
  create_tx: Hex | null;
  raw_tx: Hex | null;
};
type Flag = { word: string; t_ms: number; chunk_a: number; chunk_b: number; end_ms: number };
type Payload = { wordIds?: number[]; t?: number; chunkA?: number; chunkB?: number; raw?: Hex };
type Action = {
  id: number;
  episode_id: number;
  kind: ActionKind;
  word_id: number | null;
  scheduled_ms: number;
  tx_hash: Hex | null;
  payload_json: string;
  status: string;
};
export class EpisodeError extends Error {
  constructor(
    readonly status: 409 | 429 | 503,
    cause?: unknown,
  ) {
    super("Episode unavailable", { cause });
  }
}
export type SeedHook = {
  ready(): Promise<boolean>;
  seed(episodeId: number, runner: EpisodeRunner): Promise<void>;
  tick?(): Promise<void>;
};
export type RunnerDeps = {
  db: Database;
  now(): number;
  chain: EpisodeChain;
  log(entry: {
    episodeId: number;
    wordId: number;
    scheduledMs: number;
    receiptMs: number;
    latencyMs: number;
    txHash: Hex;
  }): void;
  seed?: SeedHook;
  onReceipt?(action: { episodeId: number; kind: ActionKind; receipt: Receipt }): Promise<void>;
  onBackgroundError?(source: "maker" | "receipt", error: unknown): void;
};

export class EpisodeRunner {
  #tail: Promise<unknown> = Promise.resolve();
  #listeners = new Map<number, Set<(event: StreamEvent) => void>>();
  #announced = new Set<number>();
  #nextHour: number;
  #makerWork: Promise<void> | undefined;
  #nextMaker = 0;
  #stopped = false;
  #receiptWork = new Set<Promise<void>>();
  #senderRestored = false;
  private async restoreSender() {
    if (this.#senderRestored) return;
    const latest = this.deps.db
      .query<{ tx_hash: Hex; block: number }, []>(
        "SELECT tx_hash,block FROM actions WHERE status='confirmed' AND tx_hash IS NOT NULL AND block IS NOT NULL AND kind IN ('create','list','flag','evidence','close') ORDER BY block DESC,id DESC LIMIT 1",
      )
      .get();
    if (latest) {
      const receipt = await this.deps.chain.receipt(latest.tx_hash);
      if (!receipt?.success || receipt.hash !== latest.tx_hash || receipt.block !== latest.block)
        throw new EpisodeError(503);
    }
    this.#senderRestored = true;
  }
  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#tail;
    await this.#makerWork;
    await Promise.all(this.#receiptWork);
  }
  private kickMaker() {
    if (this.#stopped || !this.deps.seed?.tick || this.#makerWork) return;
    const due = this.deps.db
      .query(
        "SELECT id FROM actions WHERE kind IN ('seed','pull','bid') AND status IN ('pending','sent') AND scheduled_ms<=? LIMIT 1",
      )
      .get(this.deps.now());
    if (!due && this.deps.now() < this.#nextMaker) return;
    this.#nextMaker = this.deps.now() + 5000;
    this.#makerWork = this.deps.seed
      .tick()
      .catch((error) => {
        this.deps.onBackgroundError?.("maker", error);
      })
      .finally(() => {
        this.#makerWork = undefined;
      });
  }
  constructor(private readonly deps: RunnerDeps) {
    this.#nextHour = Math.ceil(deps.now() / 3_600_000) * 3_600_000;
  }
  // All operator work shares one receipt-gated nonce stream, including concurrent requests/ticks.
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.#stopped) return Promise.reject(new EpisodeError(503));
    const result = this.#tail.then(work);
    this.#tail = result.catch(() => {});
    return result;
  }
  request(origin: "hourly" | "on_demand", ip?: string): Promise<number> {
    return this.exclusive(async () => {
      await this.recover();
      await this.refresh();
      const { db, now } = this.deps;
      if (
        db.query("SELECT id FROM episodes WHERE state != 'Settled' LIMIT 1").get() ||
        db.query("SELECT id FROM episode_requests WHERE status = 'creating' LIMIT 1").get()
      )
        throw new EpisodeError(409);
      if (!this.deps.seed || !(await this.deps.seed.ready())) throw new EpisodeError(503);
      const ipHash = ip === undefined ? null : createHash("sha256").update(ip).digest("hex");
      if (
        ipHash &&
        db
          .query("SELECT id FROM episode_requests WHERE ip_hash = ? AND requested_ms > ? LIMIT 1")
          .get(ipHash, now() - 3_600_000)
      )
        throw new EpisodeError(429);
      const clip = db
        .query<Clip, []>(`SELECT c.* FROM clips c LEFT JOIN episodes e ON e.clip_id = c.clip_id
        GROUP BY c.clip_id ORDER BY COALESCE(MAX(e.starts_at_ms), -1), c.created_at, c.id LIMIT 1`)
        .get();
      if (!clip) throw new EpisodeError(503);
      const starts = Math.ceil((now() + 60_000) / 1000) * 1000;
      // Resolver derives chunkCount from this duration. Never pad the commitment window:
      // a final flag missed by a delayed block is resolved by CRE's full-transcript close path.
      const ends = starts + Math.ceil(clip.duration_ms / 1000) * 1000;
      const result = db
        .query(`INSERT INTO episode_requests (origin, clip_id, ip_hash, requested_ms, starts_at_ms, ends_at_ms)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(origin, clip.clip_id, ipHash, now(), starts, ends);
      const launch = db
        .query<Launch, [number]>("SELECT * FROM episode_requests WHERE id = ?")
        .get(Number(result.lastInsertRowid))!;
      const id = await this.create(launch);
      await this.runDue();
      this.kickMaker();
      return id;
    });
  }
  // Sleep to the next scheduled action (capped at 1 s for state refresh); retry due or
  // in-flight work at Monad block cadence, e.g. a flag waiting for chain time to reach startsAt.
  nextWakeMs(): number {
    const now = this.deps.now();
    const next = this.deps.db
      .query<{ at: number | null }, [number]>(
        "SELECT MIN(scheduled_ms) AS at FROM actions WHERE status='pending' AND scheduled_ms>?",
      )
      .get(now)?.at;
    const due = this.deps.db
      .query(
        "SELECT id FROM actions WHERE status='sent' OR (status='pending' AND scheduled_ms<=?) LIMIT 1",
      )
      .get(now);
    return Math.max(
      1,
      Math.min(due ? 400 : 1000, next === null || next === undefined ? Infinity : next - now),
    );
  }
  async tick(): Promise<void> {
    await this.exclusive(async () => {
      await this.recover();
      await this.refresh();
      await this.runDue();
    });
    if (this.#stopped) return;
    this.kickMaker();
    if (this.deps.now() >= this.#nextHour) {
      this.#nextHour = (Math.floor(this.deps.now() / 3_600_000) + 1) * 3_600_000;
      try {
        await this.request("hourly");
      } catch (error) {
        if (!(error instanceof EpisodeError)) throw error;
      }
    }
  }
  private async recover() {
    for (const launch of this.deps.db
      .query<Launch, []>("SELECT * FROM episode_requests WHERE status = 'creating' ORDER BY id")
      .all())
      await this.create(launch);
  }
  private async create(launch: Launch): Promise<number> {
    const { db, chain } = this.deps;
    let receipt: Receipt | null = null;
    if (launch.create_tx) receipt = await chain.receipt(launch.create_tx);
    if (!receipt) {
      let transaction: Prepared;
      if (launch.create_tx && launch.raw_tx)
        transaction = { hash: launch.create_tx, raw: launch.raw_tx };
      else {
        const clip = db
          .query<Clip, [string]>("SELECT * FROM clips WHERE clip_id = ?")
          .get(launch.clip_id)!;
        const words: string[] = JSON.parse(clip.words_json);
        await this.restoreSender();
        transaction = await chain.prepare({
          kind: "createEpisode",
          args: [
            clip.clip_id,
            clip.root_a,
            clip.root_b,
            BigInt(launch.starts_at_ms / 1000),
            BigInt(launch.ends_at_ms / 1000),
            words,
          ],
          gas: gasLimit("createEpisode", words.length),
        });
        // Persist the signed transaction hash BEFORE broadcast. Restart rebroadcasts identical bytes.
        db.query("UPDATE episode_requests SET create_tx = ?, raw_tx = ? WHERE id = ?").run(
          transaction.hash,
          transaction.raw,
          launch.id,
        );
      }
      receipt = await chain.broadcast(transaction);
    }
    if (!receipt.success || !receipt.created) {
      db.query(
        "UPDATE episode_requests SET status = 'failed', error = 'create reverted' WHERE id = ?",
      ).run(launch.id);
      throw new EpisodeError(503);
    }
    const created = receipt.created;
    db.transaction(() => {
      db.query(`INSERT OR IGNORE INTO episodes (id, clip_id, origin, starts_at_ms, ends_at_ms, state, create_tx)
        VALUES (?, ?, ?, ?, ?, 'Scheduled', ?)`).run(
        created.id,
        launch.clip_id,
        launch.origin,
        launch.starts_at_ms,
        launch.ends_at_ms,
        receipt.hash,
      );
      db.query("UPDATE episode_requests SET episode_id = ?, status = 'created' WHERE id = ?").run(
        created.id,
        launch.id,
      );
      if (!db.query("SELECT id FROM actions WHERE episode_id = ? LIMIT 1").get(created.id)) {
        db.query(`INSERT INTO actions (episode_id, kind, scheduled_ms, sent_ms, tx_hash, block, status)
          VALUES (?, 'create', ?, ?, ?, ?, 'confirmed')`).run(
          created.id,
          launch.starts_at_ms - 60000,
          this.deps.now(),
          receipt.hash,
          receipt.block,
        );
        this.schedule(created.id, created.words);
      }
    })();
    this.emit(created.id, { event: "schedule", data: this.scheduleData(created.id) });
    return created.id;
  }
  private schedule(id: number, wordIds: number[]) {
    const { db } = this.deps;
    const episode = db.query<Episode, [number]>("SELECT * FROM episodes WHERE id = ?").get(id)!;
    const clip = db
      .query<Clip, [string]>("SELECT * FROM clips WHERE clip_id = ?")
      .get(episode.clip_id)!;
    const texts: string[] = JSON.parse(clip.words_json);
    this.addAction(id, "list", episode.starts_at_ms - 60000, null, { wordIds });
    if (this.deps.seed) this.addAction(id, "seed", episode.starts_at_ms - 60000);
    const flags = db
      .query<Flag, [string]>(`SELECT f.*, MAX(a.end_ms, b.end_ms) AS end_ms FROM flag_plan f
      JOIN chunks a ON a.clip_id = f.clip_id AND a.engine = 'A' AND a.idx = f.chunk_a
      JOIN chunks b ON b.clip_id = f.clip_id AND b.engine = 'B' AND b.idx = f.chunk_b WHERE f.clip_id = ? ORDER BY f.t_ms`)
      .all(episode.clip_id);
    const batches = new Map<number, number[]>();
    for (const flag of flags) {
      const wordId = wordIds[texts.indexOf(flag.word)];
      if (wordId === undefined) throw new Error("Missing chain word");
      if (this.deps.seed?.tick) {
        this.addAction(id, "pull", episode.starts_at_ms + flag.t_ms - 400, wordId);
        this.addAction(id, "bid", episode.starts_at_ms + flag.t_ms, wordId);
      }
      this.addAction(id, "flag", episode.starts_at_ms + flag.t_ms, wordId, {
        t: flag.t_ms,
        chunkA: flag.chunk_a,
        chunkB: flag.chunk_b,
      });
      const at = episode.starts_at_ms + flag.end_ms + 2000;
      const batch = batches.get(at) ?? [];
      batch.push(wordId);
      batches.set(at, batch);
    }
    for (const [at, ids] of batches) this.addAction(id, "evidence", at, null, { wordIds: ids });
    // Closed unlocks every transcript chunk. Wait out the player's 1.5 s delay + margin.
    this.addAction(id, "close", episode.ends_at_ms + 2000);
  }
  addAction(
    episodeId: number,
    kind: ActionKind,
    scheduledMs: number,
    wordId: number | null = null,
    payload: Payload = {},
  ) {
    return Number(
      this.deps.db
        .query(`INSERT INTO actions (episode_id, kind, word_id, scheduled_ms, payload_json)
      VALUES (?, ?, ?, ?, ?)`)
        .run(episodeId, kind, wordId, scheduledMs, JSON.stringify(payload)).lastInsertRowid,
    );
  }
  private async refresh() {
    const { db, chain } = this.deps;
    for (const episode of db
      .query<Episode, []>("SELECT * FROM episodes WHERE state != 'Settled'")
      .all()) {
      const observed = await chain.episode(episode.id);
      const state =
        observed.resolvedCount === observed.wordCount
          ? "Settled"
          : observed.closed
            ? "Closed"
            : observed.timestamp >= observed.startsAt
              ? "Live"
              : "Scheduled";
      if (episode.state !== state) {
        db.query("UPDATE episodes SET state = ? WHERE id = ?").run(state, episode.id);
        this.emit(episode.id, { event: "state", data: { episodeId: episode.id, state } });
      }
    }
  }
  private async runDue() {
    const { db, now, chain } = this.deps;
    const actions = db
      .query<Action, [number]>(
        "SELECT * FROM actions WHERE status='sent' OR (status='pending' AND scheduled_ms <= ?) ORDER BY CASE WHEN status='sent' THEN 0 ELSE 1 END, scheduled_ms, id",
      )
      .all(now());
    // Notify all due spoken words before waiting on any chain receipt; nothing future escapes.
    for (const action of actions)
      if (
        action.kind === "flag" &&
        !this.#announced.has(action.id) &&
        now() <
          db
            .query<{ ends_at_ms: number }, [number]>("SELECT ends_at_ms FROM episodes WHERE id=?")
            .get(action.episode_id)!.ends_at_ms
      ) {
        this.#announced.add(action.id);
        this.emitFlag(action);
      }
    for (const action of actions) {
      // BOT transactions never occupy the timed OPERATOR receipt stream.
      if (
        action.kind === "pull" ||
        action.kind === "bid" ||
        action.kind === "redeem" ||
        (action.kind === "seed" && this.deps.seed?.tick)
      )
        continue;
      if (
        action.kind === "flag" &&
        !action.tx_hash &&
        now() >=
          db
            .query<{ ends_at_ms: number }, [number]>("SELECT ends_at_ms FROM episodes WHERE id=?")
            .get(action.episode_id)!.ends_at_ms
      ) {
        db.query("UPDATE actions SET status='observed',error='flag window elapsed' WHERE id=?").run(
          action.id,
        );
        continue;
      }
      const payload: Payload = JSON.parse(action.payload_json);
      let receipt = action.tx_hash ? await chain.receipt(action.tx_hash) : null;
      if (!receipt && action.tx_hash) {
        if (!payload.raw) throw new EpisodeError(503);
        try {
          receipt = await chain.broadcast({ hash: action.tx_hash, raw: payload.raw });
        } catch (error) {
          db.query("UPDATE actions SET error='transaction unavailable' WHERE id=?").run(action.id);
          throw new EpisodeError(503, error);
        }
      }
      if (!receipt) {
        const episode = await chain.episode(action.episode_id);
        const already =
          action.kind === "list"
            ? episode.listed
            : action.kind === "close"
              ? episode.closed
              : action.kind === "flag"
                ? (await chain.word(action.word_id!)).state !== 0
                : false;
        if (already) {
          db.query("UPDATE actions SET status = 'observed' WHERE id = ?").run(action.id);
          continue;
        }
        if (action.kind === "close" && episode.timestamp < episode.endsAt) continue;
        if (action.kind === "flag" && episode.timestamp < episode.startsAt) continue;
        if (action.kind === "flag" && episode.timestamp >= episode.endsAt) {
          // The flag window cannot reopen. Keep the word Open for CRE's full-transcript
          // close handler instead of blocking remaining lifecycle actions with a revert.
          db.query(
            "UPDATE actions SET status = 'observed', error = 'flag window elapsed' WHERE id = ?",
          ).run(action.id);
          continue;
        }
        if (action.kind === "seed") {
          if (!this.deps.seed) throw new EpisodeError(503);
          await this.deps.seed.seed(action.episode_id, this);
          db.query("UPDATE actions SET status = 'confirmed' WHERE id = ?").run(action.id);
          continue;
        }
        let command: Command;
        if (action.kind === "list")
          command = {
            kind: "listEpisode",
            args: [action.episode_id],
            gas: gasLimit("listEpisode", episode.wordCount),
          };
        else if (action.kind === "flag")
          command = {
            kind: "flagSaid",
            args: [BigInt(action.word_id!), payload.chunkA!, payload.chunkB!, payload.t!],
            gas: gasLimit("flagSaid"),
          };
        else if (action.kind === "evidence") {
          const ids: number[] = [];
          for (const id of payload.wordIds ?? [])
            if ((await chain.word(id)).state === 1) ids.push(id);
          if (!ids.length) {
            db.query("UPDATE actions SET status = 'observed' WHERE id = ?").run(action.id);
            continue;
          }
          command = {
            kind: "markEvidence",
            args: [action.episode_id, ids.map(BigInt)],
            gas: gasLimit("markEvidence", ids.length),
          };
        } else if (action.kind === "close")
          command = {
            kind: "closeEpisode",
            args: [action.episode_id],
            gas: gasLimit("closeEpisode"),
          };
        else continue; // Maker owns pull/bid/redeem execution through its hook.
        await this.restoreSender();
        const prepared = await chain.prepare(command);
        db.query(
          "UPDATE actions SET tx_hash = ?, sent_ms = ?, status = 'sent', payload_json = ? WHERE id = ?",
        ).run(prepared.hash, now(), JSON.stringify({ ...payload, raw: prepared.raw }), action.id);
        if (action.kind === "list")
          db.query("UPDATE episodes SET list_tx = ? WHERE id = ?").run(
            prepared.hash,
            action.episode_id,
          );
        if (action.kind === "close")
          db.query("UPDATE episodes SET close_tx = ? WHERE id = ?").run(
            prepared.hash,
            action.episode_id,
          );
        try {
          receipt = await chain.broadcast(prepared);
        } catch (error) {
          db.query("UPDATE actions SET error = 'transaction unavailable' WHERE id = ?").run(
            action.id,
          );
          throw new EpisodeError(503, error);
        }
      }
      db.query("UPDATE actions SET status = ?, block = ?, error = ? WHERE id = ?").run(
        receipt.success ? "confirmed" : "failed",
        receipt.block,
        receipt.success ? null : "transaction reverted",
        action.id,
      );
      if (!receipt.success) throw new EpisodeError(503);
      if (action.kind === "flag") {
        const receiptMs = now();
        this.deps.log({
          episodeId: action.episode_id,
          wordId: action.word_id!,
          scheduledMs: action.scheduled_ms,
          receiptMs,
          latencyMs: receiptMs - action.scheduled_ms,
          txHash: receipt.hash,
        });
        this.emitFlag({ ...action, tx_hash: receipt.hash });
      }
      await this.refresh();
      const background = this.deps.onReceipt?.({
        episodeId: action.episode_id,
        kind: action.kind,
        receipt,
      });
      if (background) {
        const work = background
          .catch((error) => {
            this.deps.onBackgroundError?.("receipt", error);
          })
          .finally(() => {
            this.#receiptWork.delete(work);
          });
        this.#receiptWork.add(work);
      }
    }
  }
  private emitFlag(action: Action) {
    if (this.deps.now() < action.scheduled_ms) return;
    const payload: Payload = JSON.parse(action.payload_json);
    this.emit(action.episode_id, {
      event: "flag",
      data: {
        wordId: action.word_id,
        t: payload.t,
        scheduledMs: action.scheduled_ms,
        txHash: action.tx_hash,
      },
    });
  }
  private scheduleData(id: number) {
    const row = this.deps.db
      .query<
        { id: number; starts_at_ms: number; ends_at_ms: number; state: string; words_json: string },
        [number]
      >(`SELECT e.id, e.starts_at_ms, e.ends_at_ms, e.state, c.words_json
      FROM episodes e JOIN clips c ON c.clip_id = e.clip_id WHERE e.id = ?`)
      .get(id);
    if (!row) return null;
    const list = this.deps.db
      .query<{ payload_json: string }, [number]>(
        "SELECT payload_json FROM actions WHERE episode_id = ? AND kind = 'list' ORDER BY id LIMIT 1",
      )
      .get(id);
    const payload: Payload = JSON.parse(list?.payload_json ?? "{}");
    const texts: string[] = JSON.parse(row.words_json);
    return {
      episodeId: row.id,
      startsAtMs: row.starts_at_ms,
      endsAtMs: row.ends_at_ms,
      state: row.state,
      words: texts.map((text, index) => ({ wordId: payload.wordIds?.[index], text })),
    };
  }
  subscribe(id: number, listener: (event: StreamEvent) => void): (() => void) | null {
    const schedule = this.scheduleData(id);
    if (!schedule) return null;
    const listeners = this.#listeners.get(id) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(id, listeners);
    listener({ event: "schedule", data: schedule });
    for (const action of this.deps.db
      .query<Action, [number, number]>(
        "SELECT * FROM actions WHERE episode_id = ? AND kind = 'flag' AND scheduled_ms <= ? ORDER BY scheduled_ms",
      )
      .all(id, this.deps.now())) {
      const payload: Payload = JSON.parse(action.payload_json);
      listener({
        event: "flag",
        data: {
          wordId: action.word_id,
          t: payload.t,
          scheduledMs: action.scheduled_ms,
          txHash: action.tx_hash,
        },
      });
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.#listeners.delete(id);
    };
  }
  private emit(id: number, event: StreamEvent) {
    for (const listener of this.#listeners.get(id) ?? []) listener(event);
  }
}
