import { Database } from "bun:sqlite";
import { type Address, type Hex, parseEther, parseTransaction, toHex } from "viem";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { parseConfig } from "./config.ts";
import {
  type DripChain,
  type DripLeg,
  type DripPrepared,
  type DripReceipt,
  DripService,
} from "./drip.ts";
import { createDripChain } from "./drip-chain.ts";

const a = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const b = "0x1111111111111111111111111111111111111111";
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
let db: Database;
let now: number;
let chain: Ledger;
let service: DripService;
// Real SQLite + a stateful chain boundary: awards change balances only when mined.
class Ledger implements DripChain {
  mon = parseEther("2");
  ausd = 20_000_000n;
  fees = 100_000_000_000n;
  head = 1;
  transactions = new Map<Hex, { leg: DripLeg; address: Address; raw: Hex }>();
  receipts = new Map<Hex, DripReceipt>();
  balances = new Map<string, { mon: bigint; ausd: bigint }>();
  fail: DripLeg | undefined;
  revert: DripLeg | undefined;
  hold: { promise: Promise<void>; resolve(): void } | undefined;
  broadcasting = Promise.withResolvers<void>();
  async inspect() {
    return {
      mon: this.mon,
      ausd: this.ausd,
      monGas: 21000n,
      ausdGas: 72000n,
      maxFeePerGas: this.fees,
      maxPriorityFeePerGas: 0n,
    };
  }
  async prepare(address: Address, leg: DripLeg) {
    const tx = hash(this.transactions.size + 1);
    this.transactions.set(tx, { address, leg, raw: tx });
    return { hash: tx, raw: tx };
  }
  async receipt(tx: Hex) {
    return this.receipts.get(tx) ?? null;
  }
  async broadcast(tx: DripPrepared) {
    const existing = this.receipts.get(tx.hash);
    if (existing) return existing;
    const t = this.transactions.get(tx.hash)!;
    // Signed bytes must already be durable, not merely returned by prepare.
    const persisted = db
      .query<{ tx_mon: string; tx_ausd: string }, []>("SELECT tx_mon,tx_ausd FROM drips")
      .all();
    if (!persisted.some((row) => row.tx_mon === tx.hash || row.tx_ausd === tx.hash))
      throw new Error("Not persisted");
    this.broadcasting.resolve();
    if (this.hold) await this.hold.promise;
    const afterWait = this.receipts.get(tx.hash);
    if (afterWait) return afterWait;
    if (this.fail === t.leg) {
      this.fail = undefined;
      throw new Error("RPC ambiguous");
    }
    const success = this.revert !== t.leg;
    if (!success) this.revert = undefined;
    if (success) {
      const balance = this.balances.get(t.address) ?? { mon: 0n, ausd: 0n };
      if (t.leg === "mon") {
        balance.mon += 500_000_000_000_000_000n;
        this.mon -= 500_000_000_000_000_000n;
      } else {
        balance.ausd += 10_000_000n;
        this.ausd -= 10_000_000n;
      }
      this.balances.set(t.address, balance);
    }
    const mined = { hash: tx.hash, block: this.head++, success };
    this.receipts.set(tx.hash, mined);
    return mined;
  }
}
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE drips (address TEXT PRIMARY KEY,mon_wei TEXT NOT NULL,ausd TEXT NOT NULL,
    tx_mon TEXT,tx_ausd TEXT,ip_hash TEXT NOT NULL,at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed', raw_mon TEXT,raw_ausd TEXT,
    status_mon TEXT NOT NULL DEFAULT 'confirmed',status_ausd TEXT NOT NULL DEFAULT 'confirmed',
    block_mon INTEGER,block_ausd INTEGER);`);
  now = 100000;
  chain = new Ledger();
  service = new DripService({
    db,
    chain,
    ipSalt: "a stable deployment salt of at least 32 characters",
    now: () => now,
  });
});
afterEach(() => db.close());

it("awards once across case variants and service restart, exposing no private journal", async () => {
  const result = await service.claim(a, "192.0.2.1");
  expect(result.status).toBe("completed");
  expect(chain.balances.get(a)).toEqual({ mon: 500_000_000_000_000_000n, ausd: 10_000_000n });
  service = new DripService({
    db,
    chain,
    ipSalt: "a stable deployment salt of at least 32 characters",
    now: () => now,
  });
  await expect(service.claim(`0x${a.slice(2).toUpperCase()}`, "192.0.2.2")).rejects.toMatchObject({
    httpStatus: 409,
  });
  expect(JSON.stringify(service.status(a))).not.toMatch(/raw|ip_hash|192\.0\.2/);
});
it("preserves verified client identity for streamed grants and their IP rate limit", async () => {
  const identities = new WeakMap<Request, string>();
  const app = createApp({
    db,
    now: () => now,
    chain: {
      async snapshot() {
        return { headNumber: "1", headTimestampMs: now, balances: [] };
      },
    },
    drip: service,
    ip: (request) => identities.get(request) ?? "unknown",
  });
  for (const [address, expected] of [
    [a, 201],
    [b, 429],
  ] as const) {
    const bytes = new TextEncoder().encode(JSON.stringify({ address }));
    const request = new Request("http://localhost/v1/drips", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 10));
          controller.enqueue(bytes.slice(10));
          controller.close();
        },
      }),
    });
    identities.set(request, "192.0.2.1");
    expect((await app.fetch(request)).status).toBe(expected);
  }
  expect(chain.balances.get(a)).toEqual({ mon: 500_000_000_000_000_000n, ausd: 10_000_000n });
  expect(chain.balances.get(b)).toBeUndefined();
});
it("reserves one new address per IP hour, including concurrent claim attempts", async () => {
  const results = await Promise.allSettled([
    service.claim(a, "192.0.2.1"),
    service.claim(b, "192.0.2.1"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.httpStatus,
  ).toBe(429);
  expect(chain.balances.get(b)).toBeUndefined();
  now += 3_600_000;
  await service.claim(b, "192.0.2.1");
  expect(chain.balances.get(b)?.ausd).toBe(10_000_000n);
});
it("concurrent case variants cannot double either leg", async () => {
  await Promise.allSettled([
    service.claim(a, "192.0.2.1"),
    service.claim(`0x${a.slice(2).toUpperCase()}`, "192.0.2.2"),
  ]);
  expect(chain.balances.get(a)).toEqual({ mon: 500_000_000_000_000_000n, ausd: 10_000_000n });
});
it.each(["mon", "ausd"] as const)(
  "refuses low %s before either transfer and leaves the IP eligible",
  async (asset) => {
    if (asset === "mon") chain.mon = 500_000_000_000_000_000n + 93000n * chain.fees - 1n;
    else chain.ausd = 9_999_999n;
    await expect(service.claim(a, "192.0.2.1")).rejects.toMatchObject({
      httpStatus: 503,
      code: "low_balance",
    });
    expect(service.status(a)).toBeNull();
    expect(chain.balances.get(a)).toBeUndefined();
    chain.mon = parseEther("2");
    chain.ausd = 20_000_000n;
    await service.claim(b, "192.0.2.1");
    expect(chain.balances.get(b)?.ausd).toBe(10_000_000n);
  },
);
it("restarts an ambiguous AUSD send using the same bytes without doubling MON", async () => {
  chain.fail = "ausd";
  await expect(service.claim(a, "192.0.2.1")).rejects.toMatchObject({ code: "pending" });
  const before = service.status(a)!;
  expect(before.mon.status).toBe("confirmed");
  expect(before.ausd.status).toBe("signed");
  service = new DripService({
    db,
    chain,
    ipSalt: "a stable deployment salt of at least 32 characters",
    now: () => now,
  });
  const after = await service.claim(a, "192.0.2.9");
  expect(after.ausd.hash).toBe(before.ausd.hash);
  expect(chain.balances.get(a)).toEqual({ mon: 500_000_000_000_000_000n, ausd: 10_000_000n });
});
it("reconciles a mined ambiguous send before low-balance refusal", async () => {
  chain.fail = "ausd";
  await expect(service.claim(a, "192.0.2.1")).rejects.toMatchObject({ code: "pending" });
  const row = db
    .query<{ tx_ausd: Hex; raw_ausd: Hex }, []>("SELECT tx_ausd,raw_ausd FROM drips")
    .get()!;
  await chain.broadcast({ hash: row.tx_ausd, raw: row.raw_ausd });
  chain.mon = 0n;
  chain.ausd = 0n;
  expect((await service.claim(a, "192.0.2.1")).status).toBe("completed");
});
it("confirmed revert is retryable, not an award, and retries only that leg", async () => {
  chain.revert = "ausd";
  await expect(service.claim(a, "192.0.2.1")).rejects.toMatchObject({
    code: "reverted",
    httpStatus: 503,
  });
  const before = service.status(a)!;
  expect(before.status).toBe("pending");
  expect(before.ausd.status).toBe("reverted");
  const after = await service.claim(a, "192.0.2.1");
  expect(after.mon.hash).toBe(before.mon.hash);
  expect(after.ausd.hash).not.toBe(before.ausd.hash);
  expect(chain.balances.get(a)).toEqual({ mon: 500_000_000_000_000_000n, ausd: 10_000_000n });
});
it.each(["bad", "0x0000000000000000000000000000000000000000"])(
  "refuses invalid recipient %s",
  async (address) => {
    await expect(service.claim(address, "192.0.2.1")).rejects.toMatchObject({ httpStatus: 400 });
    expect(chain.balances.size).toBe(0);
  },
);

it("accepts the exact combined maximum-fee budget boundary", async () => {
  chain.mon = 500_000_000_000_000_000n + 93000n * chain.fees;
  expect((await service.claim(a, "192.0.2.1")).status).toBe("completed");
});
it("canonical IP spellings cannot evade the new-address limit", async () => {
  await service.claim(a, "::ffff:192.0.2.1");
  await expect(service.claim(b, "192.0.2.1")).rejects.toMatchObject({ code: "rate_limited" });
});
it("an unresolved sender nonce gates other addresses until recovery", async () => {
  chain.fail = "mon";
  await expect(service.claim(a, "192.0.2.1")).rejects.toMatchObject({ code: "pending" });
  await expect(service.claim(b, "192.0.2.2")).rejects.toMatchObject({ code: "pending" });
  expect(service.status(a)?.mon.status).toBe("signed");
  expect(service.status(b)).toBeNull();
  await service.claim(a, "192.0.2.1");
  await service.claim(b, "192.0.2.2");
  expect(chain.balances.get(b)?.mon).toBe(500_000_000_000_000_000n);
});
it("separate service instances select one signed candidate and both require mined receipts", async () => {
  const other = new DripService({
    db,
    chain,
    ipSalt: "a stable deployment salt of at least 32 characters",
    now: () => now,
  });
  const hold = Promise.withResolvers<void>();
  chain.hold = hold;
  const claims = [service.claim(a, "192.0.2.1"), other.claim(a, "192.0.2.2")];
  await chain.broadcasting.promise;
  expect(service.status(a)?.status).toBe("pending");
  expect(chain.balances.get(a)).toBeUndefined();
  hold.resolve();
  await Promise.allSettled(claims);
  expect(service.status(a)?.status).toBe("completed");
  expect(chain.balances.get(a)).toEqual({ mon: 500_000_000_000_000_000n, ausd: 10_000_000n });
});

it("legacy mixed-case awards remain immutable and block every normalized variant", async () => {
  const legacy = `0x${a.slice(2).toUpperCase()}`;
  db.query("INSERT INTO drips(address,mon_wei,ausd,ip_hash,at) VALUES(?,?,?,?,?)").run(
    legacy,
    "500000000000000000",
    "10000000",
    "legacy-hash",
    0,
  );
  await expect(service.claim(a, "192.0.2.1")).rejects.toMatchObject({ code: "already_awarded" });
  expect(service.status(a)?.status).toBe("completed");
  expect(db.query<{ address: string }, []>("SELECT address FROM drips").get()?.address).toBe(
    legacy,
  );
  expect(chain.balances.get(a)).toBeUndefined();
});

it("rechecks budget after winning the sender reservation before any transfer", async () => {
  let checks = 0;
  const inspect = chain.inspect.bind(chain);
  chain.inspect = async () => {
    checks++;
    if (checks === 2) chain.ausd = 0n;
    return inspect();
  };
  await expect(service.claim(a, "192.0.2.1")).rejects.toMatchObject({ code: "low_balance" });
  expect(chain.balances.get(a)).toBeUndefined();
  expect(service.status(a)).toBeNull();
});
it("an RPC failure before anything is signed releases the reservation for everyone", async () => {
  // Live 2026-10-09: a transient RPC failure after reservation left an unsigned pending row
  // that no retry advanced, holding the sender gate and the IP hour for every other player.
  const prepare = chain.prepare.bind(chain);
  chain.prepare = async () => {
    throw new Error("RPC unavailable");
  };
  await expect(service.claim(a, "192.0.2.1")).rejects.toThrow();
  expect(service.status(a)).toBeNull();
  chain.prepare = prepare;
  expect((await service.claim(b, "192.0.2.1")).status).toBe("completed");
});

it("shutdown refuses new claims and drains an admitted claim before the database closes", async () => {
  const hold = Promise.withResolvers<void>();
  chain.hold = hold;
  const claim = service.claim(a, "192.0.2.1");
  await chain.broadcasting.promise;
  let drained = false;
  const stopped = service.stop().then(() => {
    drained = true;
  });
  await expect(service.claim(b, "192.0.2.2")).rejects.toMatchObject({
    code: "unavailable",
    httpStatus: 503,
  });
  expect(drained).toBe(false);
  hold.resolve();
  await stopped;
  expect((await claim).status).toBe("completed");
  expect(chain.balances.get(a)).toEqual({ mon: 500_000_000_000_000_000n, ausd: 10_000_000n });
  expect(service.status(b)).toBeNull();
});

it("a stalled block gate fails safely at 30 seconds without permitting a nonce fallback", async () => {
  vi.useFakeTimers();
  let blockReads = 0;
  let rejected: unknown;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const rpc = (await request.json()) as { id: number; method: string };
      let result: string;
      if (rpc.method === "eth_chainId") result = "0x279f";
      else if (rpc.method === "eth_getCode") result = "0x6000";
      else if (rpc.method === "eth_blockNumber") {
        result = "0x1";
        blockReads++;
      } else throw new Error("Stalled gate reached a nonce/signing RPC");
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
    },
  });
  try {
    const adapter = createDripChain(
      parseConfig({
        RPC_URL: `http://127.0.0.1:${server.port}`,
        CHAIN_ID: "10143",
        STUDIO_DATA_DIR: "local-test-only",
        DRIP_PK: `0x${"11".repeat(32)}`,
      }),
    );
    void adapter.prepare(a, "mon", await chain.inspect(), 1).catch((error) => {
      rejected = error;
    });
    await vi.waitFor(() => expect(blockReads).toBeGreaterThanOrEqual(2));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(rejected).toMatchObject({ code: "unavailable", httpStatus: 503 });
  } finally {
    server.stop(true);
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

it("code-bearing native receivers are budgeted and signed with actual execution gas", async () => {
  let reverting = false;
  let monBalance = 500_000_000_000_000_000n;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const rpc = (await request.json()) as {
        id: number;
        method: string;
        params: Record<string, string>[];
      };
      let result: unknown;
      switch (rpc.method) {
        case "eth_fillTransaction":
          return Response.json({
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32601, message: "method not supported" },
          });
        case "eth_chainId":
          result = "0x279f";
          break;
        case "eth_getCode":
          result = "0x600160005500";
          break;
        case "eth_getBalance":
          result = toHex(monBalance);
          break;
        case "eth_call":
          result = `0x${20_000_000n.toString(16).padStart(64, "0")}`;
          break;
        case "eth_maxPriorityFeePerGas":
          result = "0x1";
          break;
        case "eth_getBlockByNumber":
          result = {
            number: "0x1",
            timestamp: "0x1",
            baseFeePerGas: "0x64",
            gasLimit: "0x1c9c380",
            gasUsed: "0x0",
            transactions: [],
          };
          break;
        case "eth_getTransactionCount":
          result = "0x0";
          break;
        case "eth_estimateGas": {
          const to = rpc.params[0]?.to?.toLowerCase();
          if (!to) throw new Error("Estimate missing recipient");
          if (to === a && reverting)
            return Response.json({
              jsonrpc: "2.0",
              id: rpc.id,
              error: { code: 3, message: "execution reverted" },
            });
          result = toHex(to === a ? 50001n : 60001n);
          break;
        }
        default:
          throw new Error(`Unexpected RPC ${rpc.method}`);
      }
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
    },
  });
  try {
    const adapter = createDripChain(
      parseConfig({
        RPC_URL: `http://127.0.0.1:${server.port}`,
        CHAIN_ID: "10143",
        STUDIO_DATA_DIR: "local-test-only",
        DRIP_PK: `0x${"11".repeat(32)}`,
      }),
    );
    const budget = await adapter.inspect(a, {});
    expect(budget.monGas).toBe(60002n);
    const prepared = await adapter.prepare(a, "mon", budget, -1);
    expect(parseTransaction(prepared.raw).gas).toBe(60002n);
    monBalance += (60002n + 72002n) * budget.maxFeePerGas - 1n;
    const realService = new DripService({
      db,
      chain: adapter,
      ipSalt: "a stable deployment salt of at least 32 characters",
    });
    await expect(realService.claim(a, "192.0.2.1")).rejects.toMatchObject({ code: "low_balance" });
    expect(realService.status(a)).toBeNull();
    reverting = true;
    await expect(realService.claim(a, "192.0.2.1")).rejects.toMatchObject({
      code: "unavailable",
      httpStatus: 503,
    });
    expect(realService.status(a)).toBeNull();
  } finally {
    server.stop(true);
  }
});
