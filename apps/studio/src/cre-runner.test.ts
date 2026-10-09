import { Database } from "bun:sqlite";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addresses, saysoMarketsAbi } from "@sayso/core";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  type Hex,
  toFunctionSelector,
} from "viem";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type CreRunner, createCreRunner } from "./cre-runner.ts";

const receiver = "0x1111111111111111111111111111111111111111" as Address;
const reporter = "0x2222222222222222222222222222222222222222" as Address;
const outsider = "0x3333333333333333333333333333333333333333" as Address;
const hash = (id: number) => `0x${id.toString(16).padStart(64, "0")}` as Hex;
const quantity = (n: number) => `0x${n.toString(16)}`;
type RpcLog = {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: string;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: string;
  logIndex: string;
  removed: boolean;
};
type RpcReceipt = {
  transactionHash: Hex;
  transactionIndex: string;
  blockHash: Hex;
  blockNumber: string;
  from: Address;
  to: Address;
  cumulativeGasUsed: string;
  gasUsed: string;
  contractAddress: null;
  logs: RpcLog[];
  logsBloom: string;
  status: string;
  effectiveGasPrice: string;
  type: string;
};
function evidence(tx: number, logIndex: number, address: Address = receiver): RpcLog {
  return {
    address,
    topics: encodeEventTopics({
      abi: saysoMarketsAbi,
      eventName: "EvidenceReady",
      args: { episodeId: 1 },
    }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256[]" }], [[1n]]),
    blockNumber: "0xa",
    blockHash: hash(100),
    transactionHash: hash(tx),
    transactionIndex: "0x0",
    logIndex: quantity(logIndex),
    removed: false,
  };
}
function closed(tx: number, logIndex: number): RpcLog {
  return {
    ...evidence(tx, logIndex),
    topics: encodeEventTopics({
      abi: saysoMarketsAbi,
      eventName: "EpisodeClosed",
      args: { episodeId: 1 },
    }) as Hex[],
    data: "0x",
  };
}
function resolved(tx: number, episodeId = 1, wordId = 1n): RpcLog {
  return {
    ...evidence(tx, 0),
    blockNumber: "0xc",
    blockHash: hash(101),
    topics: encodeEventTopics({
      abi: saysoMarketsAbi,
      eventName: "WordResolved",
      args: { episodeId, wordId },
    }) as Hex[],
    data: encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }], [2, hash(999)]),
  };
}
function settled(tx: number): RpcLog {
  return {
    ...resolved(tx),
    topics: encodeEventTopics({
      abi: saysoMarketsAbi,
      eventName: "EpisodeSettled",
      args: { episodeId: 1 },
    }) as Hex[],
    data: "0x",
    logIndex: "0x1",
  };
}
function receipt(
  tx: number,
  logs: RpcLog[],
  from = reporter,
  to: Address = addresses.creSimulationForwarder,
): RpcReceipt {
  return {
    transactionHash: hash(tx),
    transactionIndex: "0x0",
    blockHash: logs[0]?.blockHash ?? hash(100),
    blockNumber: logs[0]?.blockNumber ?? "0xa",
    from,
    to,
    cumulativeGasUsed: "0x100",
    gasUsed: "0x100",
    contractAddress: null,
    logs,
    logsBloom: `0x${"0".repeat(512)}`,
    status: "0x1",
    effectiveGasPrice: "0x1",
    type: "0x2",
  };
}
let db: Database;
let dir: string;
let server: Bun.Server<undefined>;
let runner: CreRunner | undefined;
let now: number;
let logs: RpcLog[];
let receipts: Map<Hex, RpcReceipt>;
let reportNonces: Map<Hex, number>;
let states: Map<bigint, number>;
let rpcFailure: boolean;
let cli: string;
let nonce: number;
let rpcChain: number;
let reportOrigin: Address;
let head: number;
let barrier:
  | {
      promise: Promise<void>;
      resolve(): void;
      reject(reason?: unknown): void;
    }
  | undefined;

beforeEach(async () => {
  now = 1000;
  logs = [];
  receipts = new Map();
  reportNonces = new Map();
  states = new Map([[1n, 1]]);
  rpcFailure = false;
  nonce = 0;
  rpcChain = 10143;
  reportOrigin = reporter;
  head = 12;
  barrier = undefined;
  db = new Database(":memory:");
  db.exec(`CREATE TABLE episodes(id INTEGER PRIMARY KEY); INSERT INTO episodes VALUES(1);
    CREATE TABLE actions(id INTEGER PRIMARY KEY,kind TEXT,status TEXT,tx_hash TEXT,block INTEGER);
    CREATE TABLE cre_runs(id INTEGER PRIMARY KEY,episode_id INTEGER NOT NULL REFERENCES episodes(id),trigger TEXT,
      trigger_tx TEXT,mode TEXT,status TEXT,report_tx TEXT,started_ms INTEGER,finished_ms INTEGER,error TEXT,
      trigger_log_index INTEGER,trigger_block TEXT,word_ids_json TEXT,attempts INTEGER DEFAULT 0,
      next_attempt_ms INTEGER DEFAULT 0,reporter_nonce INTEGER,execution_block TEXT,retry_count INTEGER DEFAULT 0,
      UNIQUE(trigger_tx,trigger_log_index));
    CREATE TABLE cre_runner_state(receiver TEXT PRIMARY KEY,next_block TEXT NOT NULL);`);
  dir = await mkdtemp(join(tmpdir(), "sayso-cre-"));
  await writeFile(
    join(dir, "workflow.yaml"),
    `monad-testnet:\n  workflow-artifacts:\n    workflow-path: ./src/main.ts\n    config-path: ./config.monad-testnet.json\n    secrets-path: ""\n`,
  );
  await writeFile(
    join(dir, "config.monad-testnet.json"),
    JSON.stringify({
      chainSelectorName: "monad-testnet",
      saysoMarkets: receiver,
      revealApiBaseUrl: "https://reveal.invalid",
      reportGasLimit: "100000",
    }),
  );
  cli = join(dir, "fake-cli.ts");
  await writeFile(cli, 'console.log("untrusted random hash 0x" + "f".repeat(64));');
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as { id: number; method: string; params: unknown[] };
      let result: unknown;
      if (rpcFailure)
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32000, message: "private RPC body MUST NOT be stored" },
        });
      switch (body.method) {
        case "eth_chainId":
          result = quantity(rpcChain);
          break;
        case "eth_blockNumber":
          result = quantity(head);
          break;
        case "eth_getCode":
          result = "0x6000";
          break;
        case "eth_getTransactionCount":
          result = quantity(nonce);
          break;
        case "eth_getTransactionReceipt":
          result = receipts.get(body.params[0] as Hex) ?? null;
          break;
        case "eth_getTransactionByHash": {
          const txHash = body.params[0] as Hex;
          const mined = receipts.get(txHash);
          result = mined
            ? {
                hash: txHash,
                from: mined.from,
                to: mined.to,
                nonce: quantity(reportNonces.get(txHash) ?? 0),
                blockNumber: mined.blockNumber,
                blockHash: mined.blockHash,
                transactionIndex: "0x0",
                input: "0x",
                value: "0x0",
                gas: "0x100",
                gasPrice: "0x1",
                chainId: quantity(10143),
                type: "0x2",
                maxFeePerGas: "0x1",
                maxPriorityFeePerGas: "0x1",
                accessList: [],
                r: hash(1),
                s: hash(2),
                v: "0x0",
                yParity: "0x0",
              }
            : null;
          break;
        }
        case "eth_getLogs": {
          const filter = body.params[0] as {
            fromBlock: string;
            toBlock: string;
            topics?: (string | string[])[];
          };
          if (Number(filter.toBlock) - Number(filter.fromBlock) >= 100)
            return Response.json({
              jsonrpc: "2.0",
              id: body.id,
              error: { code: -32602, message: "eth_getLogs is limited to a 100 range" },
            });
          const topics = filter.topics?.[0];
          result = logs.filter(
            (log) =>
              Number(log.blockNumber) >= Number(filter.fromBlock) &&
              Number(log.blockNumber) <= Number(filter.toBlock) &&
              (!topics ||
                (Array.isArray(topics)
                  ? topics.includes(log.topics[0]!)
                  : topics === log.topics[0])),
          );
          break;
        }
        case "eth_call": {
          const { data } = body.params[0] as { data: Hex };
          let name: "getForwarderAddress" | "reportOrigin" | "episodeWords" | "word";
          if (data.startsWith(toFunctionSelector("getForwarderAddress()")))
            name = "getForwarderAddress";
          else if (data.startsWith(toFunctionSelector("reportOrigin()"))) name = "reportOrigin";
          else if (data.startsWith(toFunctionSelector("episodeWords(uint32)")))
            name = "episodeWords";
          else name = "word";
          if (name === "word") {
            const id = BigInt(`0x${data.slice(-64)}`);
            result = encodeFunctionResult({
              abi: saysoMarketsAbi,
              functionName: "word",
              result: {
                episodeId: 1,
                text: hash(1),
                yes: receiver,
                no: receiver,
                market: receiver,
                state: states.get(id) ?? 0,
                chunkA: 0,
                chunkB: 0,
                offsetMs: 0,
                sets: 0n,
              },
            });
          } else if (name === "episodeWords")
            result = encodeFunctionResult({
              abi: saysoMarketsAbi,
              functionName: name,
              result: [...states.keys()],
            });
          else if (name === "reportOrigin")
            result = encodeFunctionResult({
              abi: saysoMarketsAbi,
              functionName: name,
              result: reportOrigin,
            });
          else
            result = encodeFunctionResult({
              abi: saysoMarketsAbi,
              functionName: name,
              result: addresses.creSimulationForwarder,
            });
          break;
        }
        default:
          throw new Error(`Unexpected RPC method ${body.method}`);
      }
      if (barrier && body.method === "eth_getTransactionReceipt") await barrier.promise;
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    },
  });
  await writeFile(
    join(dir, "project.yaml"),
    `monad-testnet:\n  rpcs:\n    - chain-name: monad-testnet\n      url: ${server.url.toString()}\n`,
  );
});
afterEach(async () => {
  barrier?.resolve();
  await runner?.stop();
  server.stop(true);
  db.close();
  await rm(dir, { recursive: true, force: true });
  runner = undefined;
});
function make(mode: "simulation" | "don" = "simulation") {
  runner = createCreRunner({
    db,
    rpcUrl: server.url.toString(),
    receiver,
    reporterAddress: reporter,
    revealApiBaseUrl: "https://reveal.invalid",
    resolverDir: dir,
    mode,
    startBlock: 10n,
    processEnv: () => ({ PATH: process.env.PATH }),
    command: [process.execPath, cli],
    now: () => now,
    timeoutMs: 500,
    pollMs: 1000,
  });
  return runner;
}
function row() {
  return db.query<Record<string, unknown>, []>("SELECT * FROM cre_runs ORDER BY id").get()!;
}
function trigger() {
  const event = evidence(1, 7);
  logs.push(event);
  receipts.set(hash(1), receipt(1, [evidence(1, 6, outsider), event], outsider, receiver));
  db.query("INSERT INTO actions VALUES(1,'evidence','confirmed',?,10)").run(hash(1));
}

it("recovers confirmed actions, ignores foreign emitters, and uses the receipt array index once", async () => {
  trigger();
  const r = make();
  await r.onReceipt({
    episodeId: 1,
    kind: "evidence",
    receipt: { hash: hash(1), block: 10, success: true },
  });
  await r.tick();
  await r.tick();
  expect(db.query("SELECT COUNT(*) AS count FROM cre_runs").get()).toEqual({ count: 1 });
  expect(row().trigger_log_index).toBe(1);
  expect(row().report_tx).toBeNull();
  expect(row().status).not.toBe("success");
});
it("receipt notification resolves without awaiting slow RPC or subprocesses", async () => {
  trigger();
  barrier = Promise.withResolvers<void>();
  const r = make();
  await r.onReceipt({
    episodeId: 1,
    kind: "evidence",
    receipt: { hash: hash(1), block: 10, success: true },
  });
  const pending = r.tick();
  expect(db.query("SELECT * FROM cre_runs").get()).toBeNull();
  barrier.resolve();
  await pending;
  expect(row().status).not.toBe("success");
});

it("corroborates a real receiver receipt and ignores random CLI hashes", async () => {
  trigger();
  const report = resolved(2);
  // Report arrives after the process starts, not before the pre-broadcast reconciliation.
  // A separate server publishes the fake chain report during the real fake-CLI process.
  const publisher = Bun.serve({
    port: 0,
    fetch() {
      logs.push(report);
      receipts.set(hash(2), receipt(2, [report]));
      states.set(1n, 2);
      nonce++;
      return new Response("ok");
    },
  });
  try {
    await writeFile(
      cli,
      `await fetch(${JSON.stringify(publisher.url.toString())}); console.log('0x'+'f'.repeat(64));`,
    );
    await make().tick();
    expect(row().status).toBe("success");
    expect(row().report_tx).toBe(hash(2));
  } finally {
    publisher.stop(true);
  }
});
it.each(["wrong-episode", "wrong-forwarder", "wrong-sender", "reverted"])(
  "rejects %s report evidence",
  async (kind) => {
    trigger();
    const report = resolved(2, kind === "wrong-episode" ? 2 : 1);
    const publisher = Bun.serve({
      port: 0,
      fetch() {
        logs.push(report);
        const mined = receipt(
          2,
          [report],
          kind === "wrong-sender" ? outsider : reporter,
          kind === "wrong-forwarder" ? outsider : addresses.creSimulationForwarder,
        );
        if (kind === "reverted") mined.status = "0x0";
        receipts.set(hash(2), mined);
        return new Response("ok");
      },
    });
    try {
      await writeFile(cli, `await fetch(${JSON.stringify(publisher.url.toString())});`);
      await make().tick();
      expect(row().status).not.toBe("success");
      expect(row().report_tx).toBeNull();
    } finally {
      publisher.stop(true);
    }
  },
);
it("reconciles a process crash from chain without spending again", async () => {
  trigger();
  const r = make();
  await r.tick();
  db.query("UPDATE cre_runs SET status='running',execution_block='10'").run();
  const report = resolved(2);
  logs.push(report);
  receipts.set(hash(2), receipt(2, [report]));
  states.set(1n, 2);
  await r.stop();
  await make().tick();
  expect(row().status).toBe("reconciled");
  expect(row().report_tx).toBe(hash(2));
  expect(row().attempts).toBe(1);
});
it("does not re-sign an ambiguous execution even after long backoff", async () => {
  trigger();
  const r = make();
  await r.tick();
  const attempts = row().attempts;
  now += 86_400_000;
  await r.tick();
  expect(row().status).toBe("ambiguous");
  expect(row().attempts).toBe(attempts);
});
it("DON observes settlement and never invokes the simulation command", async () => {
  trigger();
  reportOrigin = "0x0000000000000000000000000000000000000000";
  await writeFile(cli, "throw new Error('simulation MUST NOT run');");
  await make("don").tick();
  expect(row().mode).toBe("don");
  expect(row().attempts).toBe(0);
});
it("refuses a mismatched resolver or unauthorised report origin before spending", async () => {
  trigger();
  reportOrigin = outsider;
  await make().tick();
  expect(row().attempts).toBe(0);
  expect(row().status).toBe("pending");
  reportOrigin = reporter;
  await writeFile(
    join(dir, "config.monad-testnet.json"),
    JSON.stringify({
      chainSelectorName: "monad-testnet",
      saysoMarkets: outsider,
      revealApiBaseUrl: "https://reveal.invalid",
      reportGasLimit: "100000",
    }),
  );
  now += 5000;
  await runner!.tick();
  expect(row().attempts).toBe(0);
});
it("requires closed reports to actually settle every word", async () => {
  states.set(2n, 0);
  const event = closed(1, 7);
  logs.push(event);
  receipts.set(hash(1), receipt(1, [event], outsider, receiver));
  const report = resolved(2);
  logs.push(report);
  receipts.set(hash(2), receipt(2, [report]));
  states.set(1n, 2);
  await make().tick();
  expect(row().status).not.toBe("success");
  expect(row().report_tx).toBeNull();
});
it("marks failed exit as reconciled, never successful, even if its report mined", async () => {
  trigger();
  const publisher = Bun.serve({
    port: 0,
    fetch() {
      const report = resolved(2);
      logs.push(report);
      receipts.set(hash(2), receipt(2, [report]));
      states.set(1n, 2);
      return new Response("ok");
    },
  });
  try {
    await writeFile(
      cli,
      `await fetch(${JSON.stringify(publisher.url.toString())}); process.exit(1);`,
    );
    await make().tick();
    expect(row().status).toBe("reconciled");
    expect(row().report_tx).toBe(hash(2));
  } finally {
    publisher.stop(true);
  }
});
it("recovers a closed report only with receiver settled evidence", async () => {
  const event = closed(1, 3);
  logs.push(event);
  receipts.set(hash(1), receipt(1, [event], outsider, receiver));
  states.set(1n, 2);
  const report = resolved(2);
  const end = settled(2);
  logs.push(report, end);
  receipts.set(hash(2), receipt(2, [report, end]));
  await make().tick();
  expect(row().status).toBe("reconciled");
  expect(row().report_tx).toBe(hash(2));
});

it("discovers canonical logs after restart without any ephemeral receipt callback", async () => {
  trigger();
  db.query("DELETE FROM actions").run();
  const other = evidence(1, 8);
  logs.push(other);
  receipts.set(
    hash(1),
    receipt(1, [evidence(1, 6, outsider), evidence(1, 7), other], outsider, outsider),
  );
  const r = make();
  await r.tick();
  expect(
    db.query("SELECT trigger_log_index FROM cre_runs ORDER BY trigger_log_index").all(),
  ).toEqual([{ trigger_log_index: 1 }, { trigger_log_index: 2 }]);
  expect(db.query("SELECT next_block FROM cre_runner_state").get()).toEqual({ next_block: "13" });
  await r.stop();
  await make().tick();
  expect(db.query("SELECT COUNT(*) AS count FROM cre_runs").get()).toEqual({ count: 2 });
});
it("catches up across the public RPC range limit without losing later triggers", async () => {
  head = 350;
  states.set(1n, 2);
  const event = { ...evidence(1, 0), blockNumber: quantity(250) };
  logs.push(event);
  receipts.set(hash(1), { ...receipt(1, [event]), blockNumber: quantity(250) });
  const r = make("don");
  for (let i = 0; i < 4; i++) {
    await r.tick();
    now += 5000;
  }
  expect(row()?.trigger_tx).toBe(hash(1));
  expect(row()?.status).toBe("superseded");
  expect(db.query("SELECT next_block FROM cre_runner_state").get()).toEqual({
    next_block: "351",
  });
});
it("holds the catch-up cursor until every discovered trigger has a receipt and episode projection", async () => {
  const event = evidence(1, 0);
  logs.push(event);
  const r = make();
  await r.tick();
  expect(db.query("SELECT * FROM cre_runner_state").get()).toBeNull();
  receipts.set(hash(1), receipt(1, [event]));
  db.query("DELETE FROM episodes").run();
  now += 5000;
  await r.tick();
  expect(db.query("SELECT * FROM cre_runner_state").get()).toBeNull();
  db.query("INSERT INTO episodes VALUES(1)").run();
  now += 30000;
  await r.tick();
  expect(row().trigger_tx).toBe(hash(1));
});
it("backs off preflight failures and stops retrying rather than spending in a tight loop", async () => {
  trigger();
  reportOrigin = outsider;
  const r = make();
  await r.tick();
  expect(row().retry_count).toBe(1);
  await r.tick();
  expect(row().retry_count).toBe(1);
  for (const delay of [5000, 30000, 120000, 600000]) {
    now += delay;
    await r.tick();
  }
  expect(row().status).toBe("failed");
  expect(row().attempts).toBe(0);
  expect(String(row().error)).not.toContain("private RPC");
});
it("keeps retrying a closed-episode settlement at the capped back-off instead of stranding admission", async () => {
  // A Closed episode that never settles blocks every later episode, so its run must outlive a CRE outage.
  const event = closed(1, 0);
  logs.push(event);
  receipts.set(hash(1), receipt(1, [event], outsider, receiver));
  reportOrigin = outsider;
  const r = make();
  await r.tick();
  for (const delay of [5000, 30000, 120000, 600000, 600000, 600000]) {
    now += delay;
    await r.tick();
  }
  expect(row().trigger).toBe("closed");
  expect(row().status).toBe("pending");
  expect(row().attempts).toBe(0);
  const retries = row().retry_count;
  await r.tick();
  expect(row().retry_count).toBe(retries);
  now += 600000;
  await r.tick();
  expect(row().retry_count).toBe(Number(retries) + 1);
});
it("blocks the whole reporter stream when an earlier execution is ambiguous", async () => {
  trigger();
  const r = make();
  await r.tick();
  const event = evidence(2, 0);
  logs.push(event);
  receipts.set(hash(2), receipt(2, [event], outsider, receiver));
  await r.onReceipt({
    episodeId: 1,
    kind: "evidence",
    receipt: { hash: hash(2), block: 10, success: true },
  });
  await r.tick();
  expect(db.query("SELECT status,attempts FROM cre_runs ORDER BY id").all()).toEqual([
    { status: "ambiguous", attempts: 1 },
    { status: "pending", attempts: 0 },
  ]);
});
it("kills a timed-out process and persists only a safe reconciliation gate", async () => {
  // Deliberately exercise the OS child timeout: fake timers cannot control its socket/lifetime.
  trigger();
  const gate = Promise.withResolvers<void>();
  const blocker = Bun.serve({
    port: 0,
    async fetch() {
      await gate.promise;
      return new Response("released");
    },
  });
  try {
    await writeFile(
      cli,
      `console.error('never persist raw CLI contents'); await fetch(${JSON.stringify(blocker.url.toString())});`,
    );
    await make().tick();
    expect(row().status).toBe("ambiguous");
    expect(row().report_tx).toBeNull();
    expect(String(row().error)).not.toContain("raw CLI");
  } finally {
    gate.resolve();
    blocker.stop(true);
  }
});
it("does not broadcast or accept reports from a non-testnet RPC", async () => {
  trigger();
  const r = make();
  await r.tick();
  db.query("UPDATE cre_runs SET status='pending',next_attempt_ms=0").run();
  rpcChain = 1;
  await r.tick();
  expect(row().attempts).toBe(1);
  expect(row().report_tx).toBeNull();
});
it("does not release an ambiguous sender just because the owner voided its words", async () => {
  trigger();
  const r = make();
  await r.tick();
  states.set(1n, 4);
  now += 30000;
  await r.tick();
  expect(row().status).toBe("ambiguous");
  expect(row().report_tx).toBeNull();
  expect(row().attempts).toBe(1);
});

it.each([4, 6])(
  "does not reconcile an ambiguous nonce 5 using report nonce %s",
  async (otherNonce) => {
    trigger();
    nonce = 5;
    const r = make();
    await r.tick();
    const report = resolved(2);
    logs.push(report);
    receipts.set(hash(2), receipt(2, [report]));
    reportNonces.set(hash(2), otherNonce);
    states.set(1n, 2);
    now += 30000;
    await r.tick();
    expect(row().status).toBe("ambiguous");
    expect(row().report_tx).toBeNull();
    reportNonces.set(hash(2), 5);
    now += 30000;
    await r.tick();
    expect(row().status).toBe("reconciled");
    expect(row().report_tx).toBe(hash(2));
  },
);
it("a proven prewrite no-agreement result does not block the episode close subprocess", async () => {
  trigger();
  const marker =
    "SAYSO_CRE_STATUS:" +
    JSON.stringify({ episodeId: 1, phase: "prewrite", result: "no-report", retryable: false });
  await writeFile(cli, `console.log(${JSON.stringify(marker)});`);
  const r = make();
  await r.tick();
  expect(row().status).toBe("no-report");
  expect(row().report_tx).toBeNull();
  const event = closed(2, 0);
  logs.push(event);
  receipts.set(hash(2), receipt(2, [event], outsider, receiver));
  await r.onReceipt({
    episodeId: 1,
    kind: "close",
    receipt: { hash: hash(2), block: 10, success: true },
  });
  await r.tick();
  expect(db.query("SELECT status,attempts FROM cre_runs ORDER BY id").all()).toEqual([
    { status: "no-report", attempts: 1 },
    { status: "no-report", attempts: 1 },
  ]);
});
it("backs off a proven prewrite reveal failure then safely reruns without re-signing an unknown write", async () => {
  trigger();
  await writeFile(
    cli,
    `console.log('SAYSO_CRE_STATUS:'+JSON.stringify({episodeId:1,phase:'prewrite',result:'no-report',retryable:true}));`,
  );
  const r = make();
  await r.tick();
  expect(row().status).toBe("pending");
  expect(row().attempts).toBe(1);
  expect(row().retry_count).toBe(1);
  await r.tick();
  expect(row().attempts).toBe(1);
  now += 5000;
  await r.tick();
  expect(row().attempts).toBe(2);
});
it.each(["wrong-episode", "failed-exit", "unbounded-line", "malformed"])(
  "ignores %s no-write output and preserves ambiguity",
  async (kind) => {
    trigger();
    const marker =
      "SAYSO_CRE_STATUS:" +
      JSON.stringify({
        episodeId: kind === "wrong-episode" ? 2 : 1,
        phase: "prewrite",
        result: "no-report",
        retryable: false,
      });
    await writeFile(
      cli,
      kind === "malformed"
        ? `console.log('SAYSO_CRE_STATUS:not-json');`
        : `${kind === "unbounded-line" ? "process.stdout.write('x'.repeat(10000));" : ""}console.log(${JSON.stringify(marker)});${kind === "failed-exit" ? "process.exit(1);" : ""}`,
    );
    await make().tick();
    expect(row().status).toBe("ambiguous");
    expect(row().report_tx).toBeNull();
  },
);
