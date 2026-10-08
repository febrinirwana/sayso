import type { Database } from "bun:sqlite";
import {
  MAX_SIZE,
  MIN_SIZE,
  ONE,
  PRICE_PRECISION,
  priceToKuru,
  QUOTE_UNIT,
  quoteCost,
} from "@sayso/core";
import type { Address, Hex } from "viem";
import { z } from "zod";
import type { Prepared, SeedHook } from "./runner.ts";

export type MakerCommand = {
  kind: "approve" | "mint" | "deposit" | "ladder" | "cancel" | "bid" | "withdraw" | "redeem";
  wordId?: number;
  token?: Address;
  spender?: Address;
  market?: Address;
  amount?: string;
  ids?: number[];
  flip?: boolean;
  tokens?: Address[];
  side?: 0 | 1;
  notAfterMs?: number;
};
export type MakerReceipt = { hash: Hex; block: number; success: boolean };
export type MakerWord = { id: number; yes: Address; no: Address; market: Address; state: number };
export type HouseOrder = {
  market: Address;
  id: number;
  flip: boolean;
  price: number;
  size: bigint;
  buy: boolean;
  pairedId?: number;
};
export type MakerChain = {
  house: Address;
  ausd: Address;
  margin: Address;
  markets: Address;
  ready(wordCount: number): Promise<boolean>;
  words(episodeId: number): Promise<number[]>;
  word(wordId: number): Promise<MakerWord>;
  clock(
    episodeId: number,
  ): Promise<{ block: number; timestamp: number; closed: boolean; endsAt: number }>;
  balance(token: Address, margin?: boolean): Promise<bigint>;
  allowance(token: Address, spender: Address): Promise<bigint>;
  orders(market: Address, fromBlock: number): Promise<{ block: number; orders: HouseOrder[] }>;
  // guard runs alongside the pre-sign reads and must resolve before anything is signed.
  prepare(command: MakerCommand, guard?: () => Promise<void>): Promise<Prepared>;
  broadcast(transaction: Prepared): Promise<MakerReceipt>;
  receipt(hash: Hex): Promise<MakerReceipt | null>;
};
export type PositionsReader = {
  outstandingYes(wordId: number, minimumBlock: number, headBlock?: number): Promise<bigint | null>;
};
type Step = {
  key: string;
  command: MakerCommand;
  hash?: Hex;
  raw?: Hex;
  status?: "sent" | "confirmed" | "failed";
  block?: number;
};
type Journal = { steps?: Step[]; owner?: "bot"; purpose?: "cancel" | "recycle" };
type Action = {
  id: number;
  episode_id: number;
  word_id: number | null;
  kind: string;
  status: string;
  payload_json: string;
};
const positionsResponse = z.object({
  errors: z.unknown().optional(),
  data: z
    .object({
      _meta: z.array(
        z.object({
          progressBlock: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          isReady: z.boolean(),
        }),
      ),
      Position: z.array(
        z.object({
          id: z.string(),
          player_id: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
          yes: z.string().regex(/^\d+$/),
        }),
      ),
    })
    .optional(),
});
class ClipWindowElapsed extends Error {}
class StepSkipped extends Error {}

// BOT has its own writer. Each substep is persisted before signing/broadcasting; a restart
// resolves the existing hash or resends identical bytes, never a freshly signed mint/redeem.
export class HouseMaker implements SeedHook {
  #tail: Promise<unknown> = Promise.resolve();
  #stopped = false;
  #senderRestored = false;
  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#tail;
  }
  constructor(
    private readonly deps: {
      db: Database;
      now(): number;
      chain: MakerChain;
      positions: PositionsReader;
    },
  ) {}
  async ready(): Promise<boolean> {
    const journals = this.deps.db
      .query<{ payload_json: string }, []>(
        "SELECT payload_json FROM actions WHERE status IN ('pending','sent','failed')",
      )
      .all();
    if (journals.some((row) => JSON.parse(row.payload_json).owner === "bot")) return false;
    return this.deps.chain.ready(8);
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.#stopped) return Promise.reject(new Error("BOT writer stopped"));
    const result = this.#tail.then(work);
    this.#tail = result.catch(() => {});
    return result;
  }
  seed(episodeId: number): Promise<void> {
    return this.exclusive(async () => {
      const action = this.deps.db
        .query<Action, [number]>(
          "SELECT * FROM actions WHERE episode_id = ? AND kind = 'seed' ORDER BY id LIMIT 1",
        )
        .get(episodeId);
      if (!action) throw new Error("Missing durable seed action");
      if (action.status === "confirmed" || action.status === "observed") return;
      await this.seedAction(action);
    });
  }
  private async seedAction(action: Action) {
    const { chain, db } = this.deps;
    // Books exist only after the OPERATOR list receipt; until then the seed stays pending.
    const list = db
      .query<{ status: string }, [number]>(
        "SELECT status FROM actions WHERE episode_id=? AND kind='list' ORDER BY id LIMIT 1",
      )
      .get(action.episode_id);
    if (list && list.status !== "confirmed") return;
    const journal: Journal = JSON.parse(action.payload_json);
    await this.recoverSteps(action, journal);
    const [clock, ids] = await Promise.all([
      chain.clock(action.episode_id),
      chain.words(action.episode_id),
    ]);
    if (clock.closed || clock.timestamp >= clock.endsAt) {
      this.finish(action, "observed");
      return;
    }
    const words = await Promise.all(ids.map((id) => chain.word(id)));
    const sets = 20n * ONE;
    const quote =
      quoteCost(10n * ONE, priceToKuru("0.49")) + quoteCost(10n * ONE, priceToKuru("0.48"));
    const open = words.filter((word) => word.state === 0);
    // Fixed exposure: 16 eight-word episodes, never unlimited approvals.
    const allowanceEpisodes = 16n * 8n;
    // Account for any already-confirmed per-word deposits from an older journal.
    const quoteWords = open.filter(
      (word) =>
        !journal.steps?.some((step) => step.key === `${word.id}:5` && step.status === "confirmed"),
    );
    const totalQuote = quote * BigInt(quoteWords.length);
    // Only this sender's own approve/deposit of the same token moves these allowances, and
    // each is checked before that token's first step, so one parallel read stays exact.
    const [toMarkets, toMargin, yesToMargin] = await Promise.all([
      open.length ? chain.allowance(chain.ausd, chain.markets) : 0n,
      totalQuote > 0n ? chain.allowance(chain.ausd, chain.margin) : 0n,
      Promise.all(open.map((word) => chain.allowance(word.yes, chain.margin))),
    ]);
    try {
      if (open.length && toMarkets < sets * BigInt(open.length))
        await this.step(action, journal, "ausd:markets", {
          kind: "approve",
          token: chain.ausd,
          spender: chain.markets,
          amount: (sets * allowanceEpisodes).toString(),
        });
      if (totalQuote > 0n) {
        if (toMargin < totalQuote)
          await this.step(action, journal, "ausd:margin", {
            kind: "approve",
            token: chain.ausd,
            spender: chain.margin,
            amount: (quote * allowanceEpisodes).toString(),
          });
        await this.step(action, journal, "quote:deposit", {
          kind: "deposit",
          token: chain.ausd,
          amount: totalQuote.toString(),
        });
      }
      for (const [i, word] of open.entries()) {
        const id = word.id;
        await this.step(action, journal, `${id}:1`, {
          kind: "mint",
          wordId: id,
          amount: sets.toString(),
        });
        if ((yesToMargin[i] ?? 0n) < sets)
          await this.step(action, journal, `${id}:2`, {
            kind: "approve",
            token: word.yes,
            spender: chain.margin,
            amount: sets.toString(),
          });
        await this.step(action, journal, `${id}:3`, {
          kind: "deposit",
          token: word.yes,
          amount: sets.toString(),
        });
        // The OPERATOR may flag the word meanwhile; re-read its state inside the signing round.
        await this.step(
          action,
          journal,
          `${id}:6`,
          { kind: "ladder", market: word.market },
          async () => (await chain.word(id)).state === 0,
        );
      }
    } catch (error) {
      if (!(error instanceof ClipWindowElapsed)) throw error;
      this.finish(action, "observed");
      return;
    }
    // Books are recorded after the last ladder so no read sits between seed transactions.
    for (const word of open) await this.syncOrders(action.episode_id, word.market);
    this.finish(action);
  }
  tick(): Promise<void> {
    return this.exclusive(async () => {
      const { db, chain, now } = this.deps;
      // Resolve every previously signed BOT transaction before signing any new one.
      for (const action of db
        .query<Action, []>("SELECT * FROM actions WHERE status IN ('pending','sent') ORDER BY id")
        .all()) {
        const journal: Journal = JSON.parse(action.payload_json);
        if (journal.owner === "bot") await this.recoverSteps(action, journal);
      }
      const episodes = db
        .query<{ id: number; ends_at_ms: number }, []>(
          "SELECT id,ends_at_ms FROM episodes ORDER BY id",
        )
        .all();
      for (const episode of episodes) {
        // Unlisted books have no market bytecode yet; the episode joins after its list receipt.
        const list = db
          .query<{ status: string }, [number]>(
            "SELECT status FROM actions WHERE episode_id=? AND kind='list' ORDER BY id LIMIT 1",
          )
          .get(episode.id);
        if (list && list.status !== "confirmed") continue;
        const clock = await chain.clock(episode.id);
        const ended =
          clock.closed || clock.timestamp >= clock.endsAt || now() >= episode.ends_at_ms;
        const words = await Promise.all(
          (await chain.words(episode.id)).map((id) => chain.word(id)),
        );
        if (ended) {
          db.query(
            "UPDATE actions SET status='observed', error='clip window elapsed' WHERE episode_id=? AND kind IN ('pull','bid','seed') AND status IN ('pending','sent')",
          ).run(episode.id);
          for (const word of words) {
            await this.cancelWord(episode.id, word);
            if (word.state >= 2 && word.state <= 4) await this.recycleWord(episode.id, word);
          }
          continue;
        }
        for (const word of words) {
          if (word.state >= 2 && word.state <= 4) {
            await this.cancelWord(episode.id, word);
            await this.recycleWord(episode.id, word);
            db.query(
              "UPDATE actions SET status='observed' WHERE episode_id=? AND word_id=? AND kind IN ('pull','bid') AND status IN ('pending','sent')",
            ).run(episode.id, word.id);
          }
        }
        for (const action of db
          .query<Action, [number, number]>(
            "SELECT * FROM actions WHERE episode_id=? AND kind IN ('seed','pull','bid') AND status IN ('pending','sent') AND scheduled_ms<=? ORDER BY scheduled_ms,id",
          )
          .all(episode.id, now())) {
          try {
            const currentWindow = await chain.clock(episode.id);
            if (
              currentWindow.closed ||
              currentWindow.timestamp >= currentWindow.endsAt ||
              now() >= episode.ends_at_ms
            ) {
              this.finish(action, "observed");
              continue;
            }
            if (action.kind === "seed") {
              await this.seedAction(action);
              continue;
            }
            const word = await chain.word(action.word_id!);
            const journal: Journal = JSON.parse(action.payload_json);
            if (action.kind === "pull") {
              await this.cancelOrders(action, journal, word, true);
              this.finish(action);
            } else {
              const pull = db
                .query<{ status: string; block: number | null }, [number, number]>(
                  "SELECT status,block FROM actions WHERE episode_id=? AND word_id=? AND kind='pull' ORDER BY id LIMIT 1",
                )
                .get(episode.id, word.id);
              if (pull?.status !== "confirmed" || word.state !== 1) continue;
              const latest = await chain.clock(episode.id);
              const outstanding = await this.deps.positions.outstandingYes(
                word.id,
                pull.block ?? latest.block,
                latest.block,
              );
              if (outstanding === null) continue;
              if (outstanding < 0n) throw new Error("Invalid outstanding positions");
              const marginCash = await chain.balance(chain.ausd, true);
              const available = marginCash + (await chain.balance(chain.ausd));
              const price = priceToKuru("0.98");
              // Kuru rounds quote to QUOTE_UNIT. Floor the spendable budget first.
              const affordable =
                ((available / QUOTE_UNIT) * QUOTE_UNIT * BigInt(PRICE_PRECISION)) / BigInt(price);
              const size = [outstanding, affordable, MAX_SIZE].reduce((a, b) => (a < b ? a : b));
              if (size >= MIN_SIZE) {
                const current = await chain.clock(episode.id);
                if (
                  current.closed ||
                  current.timestamp >= current.endsAt ||
                  now() >= episode.ends_at_ms
                )
                  continue;
                const needed = quoteCost(size, price) - marginCash;
                if (needed > 0n) {
                  await this.step(action, journal, "bid:approve", {
                    kind: "approve",
                    token: chain.ausd,
                    spender: chain.margin,
                    amount: needed.toString(),
                  });
                  await this.step(action, journal, "bid:deposit", {
                    kind: "deposit",
                    token: chain.ausd,
                    amount: needed.toString(),
                  });
                }
                const fundedWindow = await chain.clock(episode.id);
                if (
                  fundedWindow.closed ||
                  fundedWindow.timestamp >= fundedWindow.endsAt ||
                  now() >= episode.ends_at_ms ||
                  (await chain.word(word.id)).state !== 1
                )
                  continue;
                await this.step(action, journal, "bid", {
                  kind: "bid",
                  market: word.market,
                  amount: size.toString(),
                });
                await this.syncOrders(episode.id, word.market);
              }
              this.finish(action);
            }
          } catch (error) {
            if (error instanceof ClipWindowElapsed) {
              this.finish(action, "observed");
              continue;
            }
            db.query("UPDATE actions SET error='BOT action unavailable' WHERE id=?").run(action.id);
            // Do not skip an unknown signed outcome and sign another nonce.
            throw error;
          }
        }
      }
    });
  }
  private durable(episodeId: number, wordId: number, purpose: "cancel" | "recycle"): Action {
    const { db, now } = this.deps;
    const existing = db
      .query<Action, [number, number]>(
        "SELECT * FROM actions WHERE episode_id=? AND word_id=? AND kind='redeem' ORDER BY id",
      )
      .all(episodeId, wordId)
      .find((a) => {
        const journal: Journal = JSON.parse(a.payload_json);
        return journal.purpose === purpose;
      });
    if (existing) return existing;
    const id = Number(
      db
        .query(
          "INSERT INTO actions(episode_id,word_id,kind,scheduled_ms,payload_json) VALUES(?,?,'redeem',?,?)",
        )
        .run(episodeId, wordId, now(), JSON.stringify({ owner: "bot", purpose })).lastInsertRowid,
    );
    return db.query<Action, [number]>("SELECT * FROM actions WHERE id=?").get(id)!;
  }
  private async cancelWord(episodeId: number, word: MakerWord) {
    const action = this.durable(episodeId, word.id, "cancel");
    if (action.status === "confirmed") return;
    const journal: Journal = JSON.parse(action.payload_json);
    await this.recoverSteps(action, journal);
    await this.cancelOrders(action, journal, word, false);
    this.finish(action);
  }
  private async cancelOrders(action: Action, journal: Journal, word: MakerWord, onlyFlip: boolean) {
    for (const flip of onlyFlip ? [true] : [true, false]) {
      const orders = await this.syncOrders(action.episode_id, word.market);
      const covered = new Set<number>();
      const ids: number[] = [];
      for (const order of orders) {
        if (order.flip !== flip || covered.has(order.id)) continue;
        ids.push(order.id);
        covered.add(order.id);
        // Kuru cancels both live sides when either member of a flip pair is canceled.
        // Passing the partner as well reverts OrderAlreadyFilledOrCancelled.
        if (flip && order.pairedId) covered.add(order.pairedId);
      }
      if (ids.length)
        await this.step(action, journal, `cancel:${flip}:${ids.join(",")}`, {
          kind: "cancel",
          market: word.market,
          ids,
          flip,
        });
    }
    const remaining = await this.syncOrders(action.episode_id, word.market);
    if (remaining.some((o) => !onlyFlip || o.flip))
      throw new Error("House orders remain after cancellation");
  }
  private async recycleWord(episodeId: number, word: MakerWord) {
    const action = this.durable(episodeId, word.id, "recycle");
    if (action.status === "confirmed") return;
    const journal: Journal = JSON.parse(action.payload_json);
    await this.recoverSteps(action, journal);
    await this.step(action, journal, "withdraw", {
      kind: "withdraw",
      tokens: [word.yes, word.no, this.deps.chain.ausd],
    });
    for (const side of word.state === 4
      ? ([0, 1] as const)
      : word.state === 2
        ? ([0] as const)
        : ([1] as const)) {
      const amount = await this.deps.chain.balance(side === 0 ? word.yes : word.no);
      if (amount > 0n)
        await this.step(action, journal, `redeem:${side}`, {
          kind: "redeem",
          wordId: word.id,
          side,
          amount: amount.toString(),
        });
    }
    this.finish(action);
  }
  private async syncOrders(episodeId: number, market: Address): Promise<HouseOrder[]> {
    const { db, chain } = this.deps;
    const seed = db
      .query<{ payload_json: string }, [number]>(
        "SELECT payload_json FROM actions WHERE episode_id=? AND kind='seed' ORDER BY id LIMIT 1",
      )
      .get(episodeId);
    const journal: Journal = JSON.parse(seed?.payload_json ?? "{}");
    const blocks = (journal.steps ?? []).flatMap((step) =>
      step.block === undefined ? [] : [step.block],
    );
    if (!blocks.length) return [];
    const snapshot = await chain.orders(market, Math.min(...blocks));
    db.transaction(() => {
      db.query("UPDATE house_orders SET status='inactive',observed_block=? WHERE market=?").run(
        snapshot.block,
        market,
      );
      for (const o of snapshot.orders)
        db.query(`INSERT INTO house_orders(market,order_id,episode_id,side,price,size,status,is_flip,observed_block)
        VALUES(?,?,?,?,?,?,'open',?,?) ON CONFLICT(market,order_id) DO UPDATE SET side=excluded.side,price=excluded.price,size=excluded.size,status='open',is_flip=excluded.is_flip,observed_block=excluded.observed_block`).run(
          market,
          o.id,
          episodeId,
          o.buy ? "bid" : "ask",
          o.price,
          o.size.toString(),
          o.flip ? 1 : 0,
          snapshot.block,
        );
    })();
    return snapshot.orders;
  }
  private persist(action: Action, journal: Journal) {
    journal.owner = "bot";
    this.deps.db
      .query("UPDATE actions SET payload_json=? WHERE id=?")
      .run(JSON.stringify(journal), action.id);
  }
  private async recoverSteps(action: Action, journal: Journal) {
    for (const step of journal.steps ?? []) {
      if (step.status === "failed") throw new Error("BOT transaction reverted");
      if (step.hash && step.status !== "confirmed") await this.confirm(action, journal, step);
    }
  }
  private async restoreSender() {
    if (this.#senderRestored) return;
    let latest: Step | undefined;
    for (const row of this.deps.db
      .query<{ payload_json: string }, []>("SELECT payload_json FROM actions")
      .all()) {
      const journal: Journal = JSON.parse(row.payload_json);
      if (journal.owner !== "bot") continue;
      for (const step of journal.steps ?? []) {
        if (
          step.status === "confirmed" &&
          step.hash &&
          step.block !== undefined &&
          (!latest || step.block > latest.block!)
        )
          latest = step;
      }
    }
    if (latest?.hash) {
      // receipt() restores the adapter's strict successor-block gate after process restart.
      const observed = await this.deps.chain.receipt(latest.hash);
      if (!observed?.success || observed.hash !== latest.hash || observed.block !== latest.block)
        throw new Error("Last confirmed BOT receipt unavailable");
    }
    this.#senderRestored = true;
  }
  // `still` is re-checked inside the signing round; false drops the unsigned step.
  private async step(
    action: Action,
    journal: Journal,
    key: string,
    command: MakerCommand,
    still?: () => Promise<boolean>,
  ) {
    journal.steps ??= [];
    let step = journal.steps.find((s) => s.key === key);
    if (step?.status === "confirmed") return;
    if (step?.status === "failed") throw new Error("BOT transaction reverted");
    if (!step) {
      step = { key, command };
      journal.steps.push(step);
      this.persist(action, journal);
    }
    const fresh = !step.hash;
    if (!step.hash) {
      await this.restoreSender();
      const { chain, db, now } = this.deps;
      const timed = action.kind === "seed" || action.kind === "pull" || action.kind === "bid";
      if (timed) {
        const episode = db
          .query<{ ends_at_ms: number }, [number]>("SELECT ends_at_ms FROM episodes WHERE id=?")
          .get(action.episode_id)!;
        if (now() >= episode.ends_at_ms) throw new ClipWindowElapsed();
        step.command.notAfterMs = episode.ends_at_ms;
      }
      let tx: Prepared;
      try {
        tx = await chain.prepare(step.command, async () => {
          const [window, keep] = await Promise.all([
            timed ? chain.clock(action.episode_id) : undefined,
            still ? still() : true,
          ]);
          if (window && (window.closed || window.timestamp >= window.endsAt))
            throw new ClipWindowElapsed();
          if (!keep) throw new StepSkipped();
        });
      } catch (error) {
        if (!(error instanceof StepSkipped)) throw error;
        journal.steps.splice(journal.steps.indexOf(step), 1);
        this.persist(action, journal);
        return;
      }
      step.hash = tx.hash;
      step.raw = tx.raw;
      step.status = "sent";
      this.persist(action, journal);
      db.query("UPDATE actions SET tx_hash=?,sent_ms=?,status='sent' WHERE id=?").run(
        tx.hash,
        now(),
        action.id,
      );
    }
    await this.confirm(action, journal, step, fresh);
  }
  // A step signed in this call has never left the process: skip the receipt pre-check.
  private async confirm(action: Action, journal: Journal, step: Step, fresh = false) {
    if (!step.hash || !step.raw) throw new Error("Incomplete BOT transaction journal");
    const receipt =
      (fresh ? null : await this.deps.chain.receipt(step.hash)) ??
      (await this.deps.chain.broadcast({ hash: step.hash, raw: step.raw }));
    step.status = receipt.success ? "confirmed" : "failed";
    step.block = receipt.block;
    this.persist(action, journal);
    this.deps.db.query("UPDATE actions SET block=? WHERE id=?").run(receipt.block, action.id);
    if (!receipt.success) {
      this.finish(action, "failed");
      throw new Error("BOT transaction reverted");
    }
  }
  private finish(action: Action, status = "confirmed") {
    this.deps.db.query("UPDATE actions SET status=?,error=NULL WHERE id=?").run(status, action.id);
  }
}

// Envio's official _meta.progressBlock is transactional with Position writes.
// Require the cancellation receipt, bounded head lag, and stable pagination.
export function createPositionsReader(
  indexerUrl: string,
  options: { houseAddress: Address; now(): number; maxLagMs?: number; maxLagBlocks?: number },
): PositionsReader {
  const maxLagMs = options.maxLagMs ?? 5000;
  const maxLagBlocks = options.maxLagBlocks ?? 10;
  return {
    async outstandingYes(wordId, minimumBlock, headBlock = minimumBlock) {
      const started = options.now();
      let after = "";
      let total = 0n;
      let snapshot: number | undefined;
      try {
        for (;;) {
          const response = await fetch(indexerUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: AbortSignal.timeout(maxLagMs),
            body: JSON.stringify({
              query: `query HousePositions($word:String!,$after:String!){ _meta(where:{chainId:{_eq:10143}}){progressBlock isReady} Position(where:{word_id:{_eq:$word},id:{_gt:$after}},order_by:{id:asc},limit:500){id player_id yes}}`,
              variables: { word: String(wordId), after },
            }),
          });
          if (!response.ok) return null;
          const parsed = positionsResponse.safeParse(await response.json());
          if (!parsed.success) return null;
          const body = parsed.data;
          const meta = body.data?._meta;
          if (
            body.errors ||
            !meta ||
            meta.length !== 1 ||
            !meta[0]!.isReady ||
            !Number.isSafeInteger(meta[0]!.progressBlock) ||
            meta[0]!.progressBlock < minimumBlock ||
            headBlock - meta[0]!.progressBlock > maxLagBlocks ||
            options.now() - started > maxLagMs
          )
            return null;
          if (snapshot !== undefined && snapshot !== meta[0]!.progressBlock) return null;
          snapshot = meta[0]!.progressBlock;
          const rows = body.data!.Position;
          if (!Array.isArray(rows)) return null;
          for (const row of rows) {
            if (
              typeof row.id !== "string" ||
              row.id <= after ||
              !/^0x[0-9a-fA-F]{40}$/.test(row.player_id) ||
              !/^\d+$/.test(row.yes)
            )
              return null;
            after = row.id;
            if (row.player_id.toLowerCase() !== options.houseAddress.toLowerCase())
              total += BigInt(row.yes);
          }
          if (rows.length < 500) return total;
        }
      } catch {
        return null;
      }
    },
  };
}
