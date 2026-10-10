import type { Database } from "bun:sqlite";
import {
  MAX_SIZE,
  MIN_SIZE,
  ONE,
  PRICE_PRECISION,
  priceToKuru,
  QUOTE_UNIT,
  quoteCost,
  tradingClosesAtMs,
} from "@sayso/core";
import type { Address, Hex } from "viem";
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
  // Non-house YES at a head no earlier than minimumBlock (the pull receipt).
  outstandingYes(word: MakerWord, minimumBlock: number): Promise<bigint>;
  // guard runs alongside the pre-sign reads and must resolve before anything is signed.
  prepare(command: MakerCommand, guard?: () => Promise<void>): Promise<Prepared>;
  broadcast(transaction: Prepared): Promise<MakerReceipt>;
  receipt(hash: Hex): Promise<MakerReceipt | null>;
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
  scheduled_ms: number;
  status: string;
  payload_json: string;
};
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
    const episode = db
      .query<{ starts_at_ms: number }, [number]>("SELECT starts_at_ms FROM episodes WHERE id=?")
      .get(action.episode_id)!;
    const closesAt = tradingClosesAtMs(episode.starts_at_ms);
    // Recovery settles already-signed bytes, but a retired book must never be seeded again.
    if (
      this.deps.now() >= closesAt ||
      db
        .query(
          "SELECT id FROM actions WHERE episode_id=? AND kind='pull' AND status='confirmed' LIMIT 1",
        )
        .get(action.episode_id)
    ) {
      this.finish(action, "observed");
      return;
    }
    // Shared AUSD allowances can be read with the clock/IDs: only this sender changes
    // them, and no seed transaction runs before this round resolves.
    const [clock, ids, toMarkets, toMargin] = await Promise.all([
      chain.clock(action.episode_id),
      chain.words(action.episode_id),
      chain.allowance(chain.ausd, chain.markets),
      chain.allowance(chain.ausd, chain.margin),
    ]);
    if (clock.closed || clock.timestamp >= clock.endsAt || clock.timestamp * 1000 >= closesAt) {
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
      for (const word of open) {
        const id = word.id;
        await this.step(action, journal, `${id}:1`, {
          kind: "mint",
          wordId: id,
          amount: sets.toString(),
        });
        // Every word has a fresh token; this bounded approve is journal-idempotent,
        // including recovery after the allowance was consumed by its deposit.
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
        if (ended) {
          const words = await Promise.all(
            (await chain.words(episode.id)).map((id) => chain.word(id)),
          );
          db.query(
            "UPDATE actions SET status='observed', error='clip window elapsed' WHERE episode_id=? AND kind IN ('pull','bid','seed') AND status IN ('pending','sent')",
          ).run(episode.id);
          for (const word of words) {
            await this.cancelWord(episode.id, word);
            if (word.state >= 2 && word.state <= 4) await this.recycleWord(episode.id, word);
          }
          continue;
        }
        // All books are pulled during pre-roll, independent of flag-plan knowledge.
        // Retire any overdue seed before pulling so it cannot repopulate emptied books.
        const visited = new Set<number>();
        for (;;) {
          const at = now();
          const action = db
            .query<Action, [number, number]>(
              "SELECT * FROM actions WHERE episode_id=? AND kind IN ('seed','pull','bid') AND status IN ('pending','sent') AND scheduled_ms<=? ORDER BY CASE kind WHEN 'seed' THEN 0 WHEN 'pull' THEN 1 ELSE 2 END,scheduled_ms,id",
            )
            .all(episode.id, at)
            .find((a) => !visited.has(a.id));
          if (!action) break;
          visited.add(action.id);
          try {
            const [currentWindow, word] = await Promise.all([
              chain.clock(episode.id),
              action.kind === "seed" ? undefined : chain.word(action.word_id!),
            ]);
            if (
              currentWindow.closed ||
              currentWindow.timestamp >= currentWindow.endsAt ||
              now() >= episode.ends_at_ms
            ) {
              this.finish(action, "observed");
              continue;
            }
            if (!word) {
              await this.seedAction(action);
              continue;
            }
            const journal: Journal = JSON.parse(action.payload_json);
            if (action.kind === "pull") {
              await this.cancelOrders(action, journal, word);
              this.finish(action);
            } else await this.bid(action, journal, word);
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
        const words = await Promise.all(
          (await chain.words(episode.id)).map((id) => chain.word(id)),
        );
        for (const word of words) {
          if (word.state >= 2 && word.state <= 4) {
            await this.cancelWord(episode.id, word);
            await this.recycleWord(episode.id, word);
            db.query(
              "UPDATE actions SET status='observed' WHERE episode_id=? AND word_id=? AND kind IN ('pull','bid') AND status IN ('pending','sent')",
            ).run(episode.id, word.id);
          }
        }
      }
    });
  }
  // The 0.98 cash-out bid: only after the pull receipt and chain SAID, sized from chain state
  // in one round with the house's spendable AUSD. Leaves the bid pending until both hold.
  private async bid(action: Action, journal: Journal, word: MakerWord) {
    const { db, chain } = this.deps;
    const pull = db
      .query<{ status: string; block: number | null }, [number, number]>(
        "SELECT status,block FROM actions WHERE episode_id=? AND word_id=? AND kind='pull' ORDER BY id LIMIT 1",
      )
      .get(action.episode_id, word.id);
    if (pull?.status !== "confirmed" || word.state !== 1) return;
    const [outstanding, marginCash, cash, allowance] = await Promise.all([
      // A pull with nothing left to cancel has no receipt; any head then follows it.
      chain.outstandingYes(word, pull.block ?? 0),
      chain.balance(chain.ausd, true),
      chain.balance(chain.ausd),
      chain.allowance(chain.ausd, chain.margin),
    ]);
    const price = priceToKuru("0.98");
    // Kuru rounds quote to QUOTE_UNIT. Floor the spendable budget first.
    const affordable =
      (((marginCash + cash) / QUOTE_UNIT) * QUOTE_UNIT * BigInt(PRICE_PRECISION)) / BigInt(price);
    const size = [outstanding, affordable, MAX_SIZE].reduce((a, b) => (a < b ? a : b));
    let placed = false;
    if (size >= MIN_SIZE) {
      // Each timed step re-reads the clip window inside its own signing round.
      const needed = quoteCost(size, price) - marginCash;
      if (needed > 0n) {
        if (allowance < needed)
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
      placed = await this.step(
        action,
        journal,
        "bid",
        { kind: "bid", market: word.market, amount: size.toString() },
        async () => (await chain.word(word.id)).state === 1,
      );
      // No post-bid book scan in the timed sender stream: the API reads the live book,
      // and close/recycle synchronize orders before cancellation. A scan here held the
      // next pull behind receipt polling plus another log/storage round on episode 11.
    }
    this.finish(action, size < MIN_SIZE || placed ? "confirmed" : "observed");
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
    await this.cancelOrders(action, journal, word);
    this.finish(action);
  }
  private async cancelOrders(action: Action, journal: Journal, word: MakerWord) {
    for (const flip of [true, false]) {
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
    if (remaining.length) throw new Error("House orders remain after cancellation");
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
  // `still` is re-checked inside the signing round; false drops the unsigned step and returns
  // false. True once the step's transaction is confirmed.
  private async step(
    action: Action,
    journal: Journal,
    key: string,
    command: MakerCommand,
    still?: () => Promise<boolean>,
  ): Promise<boolean> {
    journal.steps ??= [];
    let step = journal.steps.find((s) => s.key === key);
    if (step?.status === "confirmed") return true;
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
      let deadline: number | undefined;
      if (timed) {
        const episode = db
          .query<{ starts_at_ms: number; ends_at_ms: number }, [number]>(
            "SELECT starts_at_ms,ends_at_ms FROM episodes WHERE id=?",
          )
          .get(action.episode_id)!;
        deadline =
          action.kind === "seed"
            ? Math.min(tradingClosesAtMs(episode.starts_at_ms), episode.ends_at_ms)
            : episode.ends_at_ms;
        if (now() >= deadline) throw new ClipWindowElapsed();
        step.command.notAfterMs = deadline;
      }
      let tx: Prepared;
      try {
        tx = await chain.prepare(step.command, async () => {
          const [window, keep] = await Promise.all([
            timed ? chain.clock(action.episode_id) : undefined,
            still ? still() : true,
          ]);
          if (
            (deadline !== undefined && now() >= deadline) ||
            (window &&
              (window.closed ||
                window.timestamp >= window.endsAt ||
                (deadline !== undefined && window.timestamp * 1000 >= deadline)))
          )
            throw new ClipWindowElapsed();
          if (!keep) throw new StepSkipped();
        });
      } catch (error) {
        if (!(error instanceof StepSkipped)) throw error;
        journal.steps.splice(journal.steps.indexOf(step), 1);
        this.persist(action, journal);
        return false;
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
    return true;
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
