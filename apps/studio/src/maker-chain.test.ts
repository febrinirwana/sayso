import { Database } from "bun:sqlite";
import {
  addresses,
  marginAccountAbi,
  ONE,
  orderBookAbi,
  routerAbi,
  saysoMarketsAbi,
} from "@sayso/core";
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  keccak256,
  numberToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, it } from "vitest";
import { z } from "zod";
import { parseConfig } from "./config.ts";
import { HouseMaker } from "./maker.ts";
import { createMakerChain } from "./maker-chain.ts";

const abis = [saysoMarketsAbi, routerAbi, orderBookAbi, marginAccountAbi, erc20Abi] as const;
const zero = `0x${"0".repeat(64)}` as Hex;
const rpcRequest = z.object({
  id: z.number(),
  method: z.string(),
  params: z.array(z.unknown()).default([]),
});
const hex = z.custom<Hex>((value) => typeof value === "string" && value.startsWith("0x"));
const markets = "0x00000000000000000000000000000000000000a1";
const yes = "0x00000000000000000000000000000000000000a2";
const no = "0x00000000000000000000000000000000000000a3";
const book = "0x00000000000000000000000000000000000000a4";
const botKey = `0x${"2".repeat(64)}` as Hex;

// The public RPC answers in ~130 ms and a seed step is gated on the previous receipt, so each
// serial round trip inside a step costs the whole episode 27 x RTT. Count rounds against a
// fake RPC that answers after a fixed delay: requests that overlap in flight share a round.
// Real timers on purpose: rounds only exist as overlapping HTTP requests on the platform
// clock, and the adapter's receipt pause, successor poll and send-time sleep are measured.
function fakeRpc(answer?: (name: string, args: readonly unknown[]) => unknown, sync = false) {
  const genesis = Date.now();
  // 100 ms fake blocks keep the test short; receipts become visible once their block is head.
  const head = () => 1000 + Math.floor((Date.now() - genesis) / 100);
  const rpc = {
    chainId: "0x279f",
    requests: 0,
    rounds: 0,
    inflight: 0,
    nonce: 0,
    // Head reads trail receipts by this many blocks, as behind a lagging load-balanced node.
    lag: 0,
    mined: new Map<Hex, number>(),
    sends: [] as { requests: number; rounds: number; at: number }[],
    reads: [] as { method: string; at: number }[],
    calls: [] as { name: string; block: unknown }[],
  };
  function call(data: Hex, block: unknown): unknown {
    for (const abi of abis) {
      let decoded: { functionName: string; args?: readonly unknown[] };
      try {
        decoded = decodeFunctionData({ abi, data });
      } catch {
        continue;
      }
      const name = decoded.functionName;
      rpc.calls.push({ name, block });
      const custom = answer?.(name, decoded.args ?? []);
      const value =
        custom !== undefined
          ? custom
          : name === "episode"
            ? {
                clipId: zero,
                rootA: zero,
                rootB: zero,
                startsAt: 0n,
                endsAt: 10n ** 12n,
                closedAt: 0n,
                wordCount: 1,
                resolvedCount: 0,
                listed: true,
                closed: false,
              }
            : name === "episodeWords"
              ? [1n]
              : name === "word"
                ? {
                    episodeId: 1,
                    state: 0,
                    chunkA: 0,
                    chunkB: 0,
                    offsetMs: 0,
                    text: zero,
                    yes,
                    no,
                    market: book,
                    sets: 0n,
                  }
                : name === "AUSD"
                  ? addresses.ausd
                  : name === "KURU_ROUTER"
                    ? addresses.kuruRouter
                    : name === "marginAccountAddress"
                      ? addresses.kuruMarginAccount
                      : name === "getMarketParams"
                        ? [10000, ONE, yes, 6n, addresses.ausd, 6n, 100, ONE, 10000000000n, 0n, 0n]
                        : name === "allowance" || name === "balanceOf"
                          ? 0n
                          : undefined;
      if (value === undefined) return undefined;
      return encodeFunctionResult({ abi, functionName: name, result: value } as never);
    }
    return undefined;
  }
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = rpcRequest.parse(await request.json());
      const first = body.params[0];
      rpc.requests++;
      rpc.reads.push({ method: body.method, at: Date.now() });
      if (rpc.inflight++ === 0) rpc.rounds++;
      await Bun.sleep(25);
      rpc.inflight--;
      const block = head();
      let result: unknown;
      switch (body.method) {
        case "eth_chainId":
          result = rpc.chainId;
          break;
        case "eth_getCode":
          result = "0x01";
          break;
        case "eth_blockNumber":
          result = numberToHex(block - rpc.lag);
          break;
        case "eth_getBlockByNumber":
          result = {
            number: numberToHex(block - rpc.lag),
            timestamp: numberToHex(Math.floor(Date.now() / 1000)),
            baseFeePerGas: "0x174876e800",
            hash: zero,
            parentHash: zero,
            transactions: [],
          };
          break;
        case "eth_maxPriorityFeePerGas":
          result = "0x77359400";
          break;
        case "eth_getTransactionCount":
          result = numberToHex(rpc.nonce);
          break;
        case "eth_getBalance":
          result = numberToHex(10n ** 21n);
          break;
        case "eth_estimateGas":
          result = "0x186a0";
          break;
        case "eth_call":
          result = call(
            hex.parse(z.object({ data: z.unknown() }).parse(first).data),
            body.params[1],
          );
          break;
        case "eth_getLogs":
          result = [];
          break;
        case "eth_getTransaction":
          result = null;
          break;
        case "eth_sendRawTransactionSync": {
          if (!sync) break;
          const hash = keccak256(hex.parse(first));
          rpc.sends.push({ requests: rpc.requests, rounds: rpc.rounds, at: Date.now() });
          rpc.mined.set(hash, block);
          rpc.nonce++;
          result = {
            transactionHash: hash,
            blockHash: zero,
            blockNumber: numberToHex(block),
            transactionIndex: "0x0",
            from: markets,
            to: markets,
            cumulativeGasUsed: "0x1",
            gasUsed: "0x1",
            effectiveGasPrice: "0x1",
            contractAddress: null,
            logs: [],
            logsBloom: `0x${"0".repeat(512)}`,
            status: "0x1",
            type: "0x2",
          };
          break;
        }
        case "eth_sendRawTransaction": {
          const hash = keccak256(hex.parse(first));
          rpc.sends.push({ requests: rpc.requests, rounds: rpc.rounds, at: Date.now() });
          rpc.mined.set(hash, block + 1);
          rpc.nonce++;
          result = hash;
          break;
        }
        case "eth_getTransactionReceipt": {
          const hash = hex.parse(first);
          const at = rpc.mined.get(hash);
          result =
            at === undefined || at > block
              ? null
              : {
                  transactionHash: hash,
                  blockHash: zero,
                  blockNumber: numberToHex(at),
                  transactionIndex: "0x0",
                  from: markets,
                  to: markets,
                  cumulativeGasUsed: "0x1",
                  gasUsed: "0x1",
                  effectiveGasPrice: "0x1",
                  contractAddress: null,
                  logs: [],
                  logsBloom: `0x${"0".repeat(512)}`,
                  status: "0x1",
                  type: "0x2",
                };
          break;
        }
      }
      if (result === undefined)
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: "unsupported" },
        });
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    },
  });
  const config = parseConfig({
    RPC_URL: server.url.toString(),
    CHAIN_ID: "10143",
    STUDIO_DATA_DIR: "unused",
    SAYSO_MARKETS: markets,
    OPERATOR_PK: `0x${"1".repeat(64)}`,
    BOT_PK: botKey,
  });
  return { rpc, server, config };
}

it("seeds a word in at most four RPC rounds and ten requests per transaction", async () => {
  const { rpc, server, config } = fakeRpc();
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE episodes(id INTEGER PRIMARY KEY,ends_at_ms INTEGER,state TEXT,starts_at_ms INTEGER);
      CREATE TABLE actions(id INTEGER PRIMARY KEY,episode_id INTEGER,kind TEXT,word_id INTEGER,scheduled_ms INTEGER,sent_ms INTEGER,tx_hash TEXT,block INTEGER,status TEXT DEFAULT 'pending',error TEXT,payload_json TEXT DEFAULT '{}');
      CREATE TABLE house_orders(market TEXT,order_id INTEGER,episode_id INTEGER,side TEXT,price INTEGER,size TEXT,status TEXT,is_flip INTEGER,observed_block INTEGER,PRIMARY KEY(market,order_id));
      INSERT INTO actions(episode_id,kind,scheduled_ms) VALUES(1,'seed',0);`);
    db.query("INSERT INTO episodes VALUES(1,?,'Scheduled',?)").run(
      Date.now() + 600_000,
      Date.now() + 60_000,
    );
    const chain = createMakerChain(config);
    const maker = new HouseMaker({ db, now: Date.now, chain });
    await maker.seed(1);
    const journal = z
      .object({ steps: z.array(z.object({ status: z.string() })) })
      .parse(
        JSON.parse(
          db.query<{ payload_json: string }, []>("SELECT payload_json FROM actions").get()
            ?.payload_json ?? "{}",
        ),
      );
    // ausd:markets, ausd:margin, quote deposit, mint, YES approve, YES deposit, ladder.
    expect(journal.steps.map((step) => step.status)).toEqual(Array(7).fill("confirmed"));
    const sends = rpc.sends;
    expect(sends).toHaveLength(7);
    const per = sends.slice(1).map((send, i) => ({
      requests: send.requests - (sends[i]?.requests ?? 0),
      rounds: send.rounds - (sends[i]?.rounds ?? 0),
    }));
    process.stdout.write(
      `${JSON.stringify({ measurement: "seed_step_rpc", firstSend: sends[0], perStep: per })}\n`,
    );
    // Before (serial chain id, receipt pre-checks, head, estimate, fees, nonce and balance,
    // then viem's block-watching receipt wait): 12-16 rounds and 12-16 requests per step,
    // 24 rounds before the first send. After: 3-4 rounds, 8-10 requests, 6 rounds.
    for (const step of per) {
      expect(step.rounds).toBeLessThanOrEqual(4);
      expect(step.requests).toBeLessThanOrEqual(10);
    }
    // Seed start: episode, word and dependency reads in parallel before the first signature.
    expect(sends[0]?.rounds).toBeLessThanOrEqual(6);
    // A book snapshot right after a receipt (e.g. the post-cancel check) must not read state
    // from before that receipt's block, even when the reported head trails it.
    rpc.lag = 5;
    const snapshot = await chain.orders(book, Math.min(...rpc.mined.values()));
    expect(snapshot.block).toBeGreaterThanOrEqual(Math.max(...rpc.mined.values()));
  } finally {
    db.close();
    server.stop(true);
  }
}, 30_000);

it("sizes outstanding YES from one block-pinned round that excludes house and protocol holdings", async () => {
  const house = privateKeyToAccount(botKey).address.toLowerCase();
  const held: Record<string, bigint> = {
    [house]: 3n * ONE,
    [markets]: ONE,
    [book]: 2n * ONE,
  };
  const { rpc, server, config } = fakeRpc((name, args) => {
    if (name === "totalSupply") return 100n * ONE;
    if (name === "getBalance") return 90n * ONE;
    if (name === "balanceOf") return held[String(args[0]).toLowerCase()] ?? 0n;
    return undefined;
  });
  try {
    const chain = createMakerChain(config);
    const rounds = rpc.rounds;
    // 100 minted: the house holds 3 in its wallet and 90 in Kuru margin, SaysoMarkets 1 and
    // the book 2. The 4 left are player YES, whoever holds them, and nothing waits on Envio.
    const outstanding = await chain.outstandingYes(
      { id: 1, yes, no, market: book, state: 1 },
      1000,
    );
    expect(outstanding).toBe(4n * ONE);
    // The head (when not cached) and the five holdings reads: at most two rounds.
    expect(rpc.rounds - rounds).toBeLessThanOrEqual(2);
    const pinned = rpc.calls.filter((c) => c.name === "totalSupply" || c.name === "balanceOf");
    expect(pinned).toHaveLength(4);
    expect(new Set(rpc.calls.slice(-5).map((c) => c.block)).size).toBe(1);
    expect(rpc.calls.at(-1)?.block).not.toBe("latest");
  } finally {
    server.stop(true);
  }
});

it("prepares legacy unsigned pull commands without the obsolete flag-time wait", async () => {
  const { rpc, server, config } = fakeRpc();
  try {
    const chain = createMakerChain(config);
    const notBeforeMs = Date.now() + 3000;
    await chain.prepare(
      JSON.parse(
        JSON.stringify({
          kind: "cancel",
          market: book,
          ids: [1],
          flip: true,
          notBeforeMs,
        }),
      ),
    );
    expect(Date.now()).toBeLessThan(notBeforeMs);
    expect(rpc.sends).toHaveLength(0);
  } finally {
    server.stop(true);
  }
});

it("refuses fresh BOT bytes when the endpoint changes chains before broadcast", async () => {
  const { rpc, server, config } = fakeRpc();
  try {
    const chain = createMakerChain(config);
    const tx = await chain.prepare({ kind: "cancel", market: book, ids: [1], flip: true });
    rpc.chainId = "0x1";
    await expect(chain.broadcast(tx)).rejects.toThrow("BOT RPC must be Monad testnet");
    expect(rpc.sends).toHaveLength(0);
  } finally {
    server.stop(true);
  }
});

it("returns zero outstanding YES when all supply is house inventory after pull", async () => {
  const house = privateKeyToAccount(botKey).address.toLowerCase();
  const { server, config } = fakeRpc((name, args) => {
    if (name === "totalSupply") return 20n * ONE;
    if (name === "getBalance") return 17n * ONE;
    if (name === "balanceOf") return String(args[0]).toLowerCase() === house ? 3n * ONE : 0n;
    return undefined;
  });
  try {
    expect(
      await createMakerChain(config).outstandingYes(
        { id: 1, yes, no, market: book, state: 1 },
        1000,
      ),
    ).toBe(0n);
  } finally {
    server.stop(true);
  }
});

it.each([false, true])(
  "confirms a synchronous house cancel (flip=%s) without an inclusion sleep",
  async (flip) => {
    const { rpc, server, config } = fakeRpc(undefined, true);
    try {
      const chain = createMakerChain(config);
      const tx = await chain.prepare({ kind: "cancel", market: book, ids: [1], flip });
      const sentAt = Date.now();
      expect(await chain.broadcast(tx)).toMatchObject({ hash: tx.hash, success: true });
      // Deliberate platform-clock integration: catches the adapter's obsolete 300 ms sleep.
      expect(Date.now() - sentAt).toBeLessThan(250);
      expect(rpc.reads.filter((r) => r.method === "eth_sendRawTransactionSync")).toHaveLength(1);
      expect(rpc.reads.some((r) => r.method === "eth_sendRawTransaction")).toBe(false);
      expect(rpc.reads.some((r) => r.method === "eth_getTransactionReceipt")).toBe(false);
    } finally {
      server.stop(true);
    }
  },
);
