import { Database } from "bun:sqlite";
import { ONE, quoteCost } from "@sayso/core";
import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  createPositionsReader,
  HouseMaker,
  type MakerChain,
  type MakerCommand,
  type MakerReceipt,
} from "./maker.ts";
import { type Command, type EpisodeChain, EpisodeRunner, type Receipt } from "./runner.ts";

const house = "0x0000000000000000000000000000000000000001" as Address;
const yes = "0x0000000000000000000000000000000000000002" as Address;
const no = "0x0000000000000000000000000000000000000003" as Address;
const market = "0x0000000000000000000000000000000000000004" as Address;
const ausd = "0x0000000000000000000000000000000000000005" as Address;
const margin = "0x0000000000000000000000000000000000000006" as Address;
const markets = "0x0000000000000000000000000000000000000007" as Address;
function fixture() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE episodes(id INTEGER PRIMARY KEY,ends_at_ms INTEGER,state TEXT);
    CREATE TABLE actions(id INTEGER PRIMARY KEY,episode_id INTEGER,kind TEXT,word_id INTEGER,scheduled_ms INTEGER,sent_ms INTEGER,tx_hash TEXT,block INTEGER,status TEXT DEFAULT 'pending',error TEXT,payload_json TEXT DEFAULT '{}');
    CREATE TABLE house_orders(market TEXT,order_id INTEGER,episode_id INTEGER,side TEXT,price INTEGER,size TEXT,status TEXT,is_flip INTEGER,observed_block INTEGER,PRIMARY KEY(market,order_id));
    INSERT INTO episodes VALUES(1,10000,'Live');
    INSERT INTO actions(episode_id,kind,scheduled_ms) VALUES(1,'seed',0);
    INSERT INTO actions(episode_id,kind,word_id,scheduled_ms) VALUES(1,'pull',1,4600),(1,'bid',1,5000);`);
  let now = 0,
    state = 0,
    closed = false,
    block = 1,
    cash = 100n * ONE;
  const balances = new Map<string, bigint>([[ausd, cash]]),
    deposits = new Map<string, bigint>();
  const allowances = new Map<string, bigint>();
  const prepared = new Map<Hex, MakerCommand>(),
    mined = new Map<Hex, MakerReceipt>();
  const orders: {
    id: number;
    flip: boolean;
    price: number;
    size: bigint;
    buy: boolean;
    pairedId?: number;
  }[] = [];
  let dropAfterMining = false,
    nonce = 0,
    mints = 0;
  const chain: MakerChain = {
    house,
    ausd,
    margin,
    markets,
    async allowance(token, spender) {
      return allowances.get(`${token}:${spender}`) ?? 0n;
    },
    async ready(count) {
      return cash >= BigInt(count) * 29700000n;
    },
    async words() {
      return [1];
    },
    async word(id) {
      return { id, yes, no, market, state };
    },
    async clock() {
      return { block, timestamp: Math.floor(now / 1000), closed, endsAt: 10 };
    },
    async balance(token, inMargin = false) {
      return (inMargin ? deposits : balances).get(token) ?? 0n;
    },
    async orders() {
      return { block, orders: orders.map((o) => ({ ...o, market })) };
    },
    async prepare(command, guard) {
      await guard?.();
      const hash = `0x${(++nonce).toString(16).padStart(64, "0")}` as Hex;
      prepared.set(hash, command);
      return { hash, raw: hash };
    },
    async receipt(hash) {
      return mined.get(hash) ?? null;
    },
    async broadcast(tx) {
      if (mined.has(tx.hash)) return mined.get(tx.hash)!;
      const c = prepared.get(tx.hash)!;
      const amount = BigInt(c.amount ?? "0");
      if (c.kind === "approve") allowances.set(`${c.token}:${c.spender}`, amount);
      if (c.kind === "mint" || c.kind === "deposit") {
        const token = c.kind === "mint" ? ausd : c.token!;
        const spender = c.kind === "mint" ? markets : margin;
        const key = `${token}:${spender}`;
        const allowed = allowances.get(key) ?? 0n;
        if (allowed < amount) throw new Error("Insufficient allowance");
        allowances.set(key, allowed - amount);
      }
      if (c.kind === "mint") {
        mints++;
        cash = (balances.get(ausd) ?? 0n) - amount;
        balances.set(ausd, cash);
        balances.set(yes, (balances.get(yes) ?? 0n) + amount);
        balances.set(no, (balances.get(no) ?? 0n) + amount);
      }
      if (c.kind === "deposit") {
        balances.set(c.token!, (balances.get(c.token!) ?? 0n) - amount);
        deposits.set(c.token!, (deposits.get(c.token!) ?? 0n) + amount);
      }
      if (c.kind === "ladder") {
        for (let i = 0; i < 4; i++)
          orders.push({
            id: i + 1,
            flip: true,
            price: [4900, 4800, 5100, 5200][i]!,
            size: 10n * ONE,
            buy: i < 2,
          });
      }
      if (c.kind === "cancel") {
        for (const id of c.ids!) {
          const i = orders.findIndex((o) => o.id === id);
          if (i < 0) throw new Error("OrderAlreadyFilledOrCancelled");
          const pair = orders[i]!.pairedId;
          orders.splice(i, 1);
          if (pair) {
            const pairedIndex = orders.findIndex((o) => o.id === pair);
            if (pairedIndex >= 0) orders.splice(pairedIndex, 1);
          }
        }
      }
      if (c.kind === "bid") {
        expect(state).toBe(1);
        expect(orders.filter((o) => o.flip)).toHaveLength(0);
        orders.push({ id: 20, flip: false, price: 9800, size: amount, buy: true });
      }
      if (c.kind === "withdraw") {
        for (const token of c.tokens!) {
          balances.set(token, (balances.get(token) ?? 0n) + (deposits.get(token) ?? 0n));
          deposits.set(token, 0n);
        }
      }
      if (c.kind === "redeem") {
        const token = c.side === 0 ? yes : no;
        balances.set(token, (balances.get(token) ?? 0n) - amount);
        const payout = state === 4 ? amount / 2n : amount;
        cash = (balances.get(ausd) ?? 0n) + payout;
        balances.set(ausd, cash);
      }
      const receipt = { hash: tx.hash, block: ++block, success: true };
      mined.set(tx.hash, receipt);
      if (dropAfterMining && c.kind === "mint") {
        dropAfterMining = false;
        throw new Error("lost RPC response");
      }
      return receipt;
    },
  };
  const maker = () =>
    new HouseMaker({
      db,
      now: () => now,
      chain,
      positions: {
        async outstandingYes() {
          return 50n * ONE;
        },
      },
    });
  return {
    db,
    chain,
    maker,
    orders,
    balances,
    deposits,
    prepared,
    setNow: (n: number) => {
      now = n;
    },
    setState: (s: number) => {
      state = s;
    },
    close: () => {
      closed = true;
    },
    loseResponse: () => {
      dropAfterMining = true;
    },
    mints: () => mints,
  };
}
describe("house economic lifecycle", () => {
  it("reuses bounded AUSD allowances across episodes and deposits quote once", async () => {
    const f = fixture();
    await f.maker().seed(1);
    const commands = () => [...f.prepared.values()];
    expect(commands()).toHaveLength(7);
    f.db.exec(
      "INSERT INTO episodes VALUES(2,10000,'Live'); INSERT INTO actions(episode_id,kind,scheduled_ms) VALUES(2,'seed',0);",
    );
    await f.maker().seed(2);
    expect(commands()).toHaveLength(12);
    expect(commands().filter((c) => c.kind === "approve" && c.token === ausd)).toHaveLength(2);
    expect(commands().filter((c) => c.kind === "deposit" && c.token === ausd)).toHaveLength(2);
  });
  it("seeds six books in 27 transactions instead of 42", async () => {
    const f = fixture();
    f.chain.words = async () => [1, 2, 3, 4, 5, 6];
    f.balances.set(ausd, 300n * ONE);
    await f.maker().seed(1);
    const commands = [...f.prepared.values()];
    expect(commands).toHaveLength(27);
    expect(commands.filter((c) => c.kind === "deposit" && c.token === ausd)).toHaveLength(1);
    expect(commands.filter((c) => c.kind === "mint")).toHaveLength(6);
  });
  it("re-reads the word inside the ladder signing round and drops the ladder once flagged", async () => {
    const f = fixture();
    const broadcast = f.chain.broadcast;
    f.chain.broadcast = async (tx) => {
      const receipt = await broadcast(tx);
      if (f.prepared.get(tx.hash)?.kind === "deposit" && f.prepared.get(tx.hash)?.token === yes)
        f.setState(1);
      return receipt;
    };
    await f.maker().seed(1);
    expect([...f.prepared.values()].map((c) => c.kind)).not.toContain("ladder");
    expect(f.orders).toHaveLength(0);
    const row = f.db
      .query<{ status: string; payload_json: string }, []>(
        "SELECT status,payload_json FROM actions WHERE kind='seed'",
      )
      .get();
    expect(row?.status).toBe("confirmed");
    expect(row?.payload_json).not.toContain('"1:6"');
  });
  it("seeds once across restart and recovers mined mint before any new economic action", async () => {
    const f = fixture();
    f.loseResponse();
    await expect(f.maker().seed(1)).rejects.toThrow();
    await f.maker().seed(1);
    await f.maker().seed(1);
    expect(f.mints()).toBe(1);
    expect(f.balances.get(no)).toBe(20n * ONE);
    expect(f.orders).toHaveLength(4);
    expect(
      f.db
        .query<{ payload_json: string }, []>("SELECT payload_json FROM actions WHERE kind='seed'")
        .get()!.payload_json,
    ).toContain("confirmed");
  });
  it("refuses new economic actions after restart until the last confirmed BOT receipt is observed", async () => {
    const f = fixture();
    await f.maker().seed(1);
    const before = f.balances.get(ausd);
    const receipt = f.chain.receipt;
    f.chain.receipt = async () => null;
    f.setNow(4600);
    await expect(f.maker().tick()).rejects.toThrow();
    expect(f.orders.filter((order) => order.flip)).toHaveLength(4);
    expect(f.balances.get(ausd)).toBe(before);
    f.chain.receipt = receipt;
    await f.maker().tick();
    expect(f.orders).toHaveLength(0);
    expect(f.mints()).toBe(1);
  });
  it("never bids before SAID or the pull receipt and caps cash-out by available collateral", async () => {
    const f = fixture();
    const m = f.maker();
    await m.seed(1);
    f.setNow(4600);
    await m.tick();
    expect(f.orders).toHaveLength(0);
    f.setNow(5000);
    await m.tick();
    expect(f.orders).toHaveLength(0);
    f.setState(1);
    await m.tick();
    const bid = f.orders[0]!;
    expect(bid.price).toBe(9800);
    expect(quoteCost(bid.size, 9800)).toBeLessThanOrEqual(f.deposits.get(ausd)!);
    await f.maker().tick();
    expect(f.orders).toHaveLength(1);
  });
  it("cancels replacement flip IDs and never executes an expired bid", async () => {
    const f = fixture();
    const m = f.maker();
    await m.seed(1);
    f.orders[0]!.id = 99;
    f.setNow(10000);
    f.close();
    await m.tick();
    expect(f.orders).toHaveLength(0);
    expect(
      f.db.query<{ status: string }, []>("SELECT status FROM actions WHERE kind='bid'").get()!
        .status,
    ).toBe("observed");
  });
  it("cancels partially-filled flip pairs only once while removing both active sides", async () => {
    const f = fixture();
    await f.maker().seed(1);
    f.orders[3]!.pairedId = 6;
    f.orders.push({ id: 6, pairedId: 4, flip: true, price: 5100, size: 5686077n, buy: true });
    f.orders[3]!.size = 4423270n;
    f.setNow(4600);
    await f.maker().tick();
    expect(f.orders).toHaveLength(0);
    expect(f.db.query("SELECT status FROM actions WHERE kind='pull'").get()).toEqual({
      status: "confirmed",
    });
  });
  it("drops an unsigned timed pull if its book read finishes after clip close", async () => {
    const f = fixture();
    const m = f.maker();
    await m.seed(1);
    f.setNow(4600);
    const readOrders = f.chain.orders;
    f.chain.orders = async (...args) => {
      const result = await readOrders(...args);
      f.setNow(10000);
      return result;
    };
    await m.tick();
    expect(f.orders.filter((order) => order.flip)).toHaveLength(4);
    expect(
      f.db.query<{ status: string }, []>("SELECT status FROM actions WHERE kind='pull'").get()!
        .status,
    ).toBe("observed");
    await m.tick();
    expect(f.orders).toHaveLength(0);
  });
  it("withdraws final Void balances and redeems both sides with independent odd rounding", async () => {
    const f = fixture();
    const m = f.maker();
    await m.seed(1);
    f.deposits.set(yes, 20000001n);
    f.balances.set(no, 20000001n);
    f.setState(4);
    f.setNow(10000);
    f.close();
    const before = (f.balances.get(ausd) ?? 0n) + (f.deposits.get(ausd) ?? 0n);
    await m.tick();
    expect(f.orders).toHaveLength(0);
    expect(f.balances.get(yes)).toBe(0n);
    expect(f.balances.get(no)).toBe(0n);
    expect(f.balances.get(ausd)).toBe(before + 20000000n);
    await f.maker().tick();
    expect(f.balances.get(ausd)).toBe(before + 20000000n);
  });
  it("recycles a final winning word before the episode closes", async () => {
    const f = fixture();
    const m = f.maker();
    await m.seed(1);
    f.setState(2);
    f.setNow(6000);
    const before = (f.balances.get(ausd) ?? 0n) + (f.deposits.get(ausd) ?? 0n);
    await m.tick();
    expect(f.orders).toHaveLength(0);
    expect(f.balances.get(yes)).toBe(0n);
    expect(f.balances.get(ausd)).toBe(before + 20n * ONE);
    expect(f.balances.get(no)).toBe(20n * ONE);
  });
  it("leaves bids pending when Envio cannot prove fresh outstanding positions", async () => {
    const f = fixture();
    const m = new HouseMaker({
      db: f.db,
      now: () => 5000,
      chain: f.chain,
      positions: {
        async outstandingYes() {
          return null;
        },
      },
    });
    await m.seed(1);
    f.setState(1);
    await m.tick();
    expect(f.orders).toHaveLength(0);
    expect(
      f.db.query<{ status: string }, []>("SELECT status FROM actions WHERE kind='bid'").get()!
        .status,
    ).toBe("pending");
  });
});

describe("indexed position boundaries", () => {
  it("excludes house holdings and refuses unindexed pull or stale head", async () => {
    let progressBlock = 100;
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        Response.json({
          data: {
            _meta: [{ progressBlock, isReady: true }],
            Position: [
              { id: "a", player_id: house, yes: "999999999" },
              { id: "b", player_id: yes, yes: "4000001" },
            ],
          },
        }),
    });
    try {
      const reader = createPositionsReader(server.url.toString(), {
        houseAddress: house,
        now: Date.now,
      });
      expect(await reader.outstandingYes(1, 100, 105)).toBe(4000001n);
      expect(await reader.outstandingYes(1, 101, 105)).toBeNull();
      expect(await reader.outstandingYes(1, 100, 111)).toBeNull();
      progressBlock = 111;
      expect(await reader.outstandingYes(1, 101, 111)).toBe(4000001n);
    } finally {
      server.stop(true);
    }
  });
  it("refuses a changed pagination snapshot rather than double-counting", async () => {
    let page = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        Response.json({
          data: {
            _meta: [{ progressBlock: 100 + page++, isReady: true }],
            Position:
              page === 1
                ? Array.from({ length: 500 }, (_, i) => ({
                    id: String(i).padStart(5, "0"),
                    player_id: yes,
                    yes: "1000000",
                  }))
                : [{ id: "99999", player_id: yes, yes: "1000000" }],
          },
        }),
    });
    try {
      const reader = createPositionsReader(server.url.toString(), {
        houseAddress: house,
        now: Date.now,
      });
      expect(await reader.outstandingYes(1, 100, 105)).toBeNull();
    } finally {
      server.stop(true);
    }
  });
});

it("keeps timed OPERATOR flags independent from unresolved BOT and receipt callbacks", async () => {
  const f = fixture();
  let now = 5000;
  let nonce = 0;
  f.db.exec("CREATE TABLE episode_requests(id INTEGER PRIMARY KEY,status TEXT)");
  const commands = new Map<Hex, Command>();
  const receipts = new Map<Hex, Receipt>();
  const flagged = new Set<number>();
  const bot = Promise.withResolvers<void>();
  const callback = Promise.withResolvers<void>();
  f.db
    .query(
      "INSERT INTO actions(episode_id,kind,word_id,scheduled_ms,payload_json) VALUES(1,'flag',1,5000,?),(1,'flag',2,6000,?)",
    )
    .run('{"t":5000,"chunkA":0,"chunkB":0}', '{"t":6000,"chunkA":0,"chunkB":0}');
  const chain: EpisodeChain = {
    async prepare(command) {
      const hash = `0x${(++nonce).toString(16).padStart(64, "0")}` as Hex;
      commands.set(hash, command);
      return { hash, raw: hash };
    },
    async broadcast(tx) {
      flagged.add(Number(commands.get(tx.hash)!.args[0]));
      const r = { hash: tx.hash, block: nonce, success: true };
      receipts.set(tx.hash, r);
      return r;
    },
    async receipt(hash) {
      return receipts.get(hash) ?? null;
    },
    async episode() {
      return {
        listed: true,
        closed: false,
        resolvedCount: 0,
        wordCount: 2,
        startsAt: 0,
        endsAt: 10,
        timestamp: Math.floor(now / 1000),
      };
    },
    async words() {
      return [1, 2];
    },
    async word(id) {
      return { state: flagged.has(id) ? 1 : 0 };
    },
  };
  const runner = new EpisodeRunner({
    db: f.db,
    now: () => now,
    chain,
    log: () => {},
    seed: {
      async ready() {
        return true;
      },
      async seed() {
        throw new Error("must use detached tick");
      },
      tick: () => bot.promise,
    },
    onReceipt: () => callback.promise,
  });
  try {
    await runner.tick();
    expect(flagged.has(1)).toBe(true);
    now = 6000;
    await runner.tick();
    expect(flagged.has(2)).toBe(true);
  } finally {
    bot.resolve();
    callback.resolve();
  }
});

it("does not send an obsolete flag when local playback ended but the RPC head is behind", async () => {
  const f = fixture();
  f.db.exec("CREATE TABLE episode_requests(id INTEGER PRIMARY KEY,status TEXT)");
  f.db
    .query(
      "INSERT INTO actions(episode_id,kind,word_id,scheduled_ms,payload_json) VALUES(1,'flag',1,5000,?)",
    )
    .run('{"t":5000,"chunkA":0,"chunkB":0}');
  let flagged = false;
  const hash = `0x${"a".repeat(64)}` as Hex;
  const chain: EpisodeChain = {
    async prepare() {
      return { hash, raw: hash };
    },
    async broadcast() {
      flagged = true;
      return { hash, block: 1, success: true };
    },
    async receipt() {
      return null;
    },
    async episode() {
      return {
        listed: true,
        closed: false,
        resolvedCount: 0,
        wordCount: 1,
        startsAt: 0,
        endsAt: 10,
        timestamp: 9,
      };
    },
    async words() {
      return [1];
    },
    async word() {
      return { state: 0 };
    },
  };
  const runner = new EpisodeRunner({
    db: f.db,
    now: () => 10000,
    chain,
    log: () => {},
    seed: {
      async ready() {
        return false;
      },
      async seed() {},
      async tick() {},
    },
  });
  await runner.tick();
  expect(flagged).toBe(false);
});
