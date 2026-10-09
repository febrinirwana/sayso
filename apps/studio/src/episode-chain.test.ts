import { gasLimit } from "@sayso/core";
import { type Hex, keccak256, numberToHex } from "viem";
import { expect, it } from "vitest";
import { z } from "zod";
import { parseConfig } from "./config.ts";
import { createEpisodeChain } from "./episode-chain.ts";
import { type Command, PRESIGN_MS } from "./runner.ts";

const zero = `0x${"0".repeat(64)}` as Hex;
const markets = "0x00000000000000000000000000000000000000a1";
const rpcRequest = z.object({
  id: z.number(),
  method: z.string(),
  params: z.array(z.unknown()).default([]),
});
const hex = z.custom<Hex>((value) => typeof value === "string" && value.startsWith("0x"));

// Real timers on purpose, as in maker-chain.test.ts: a round is a set of HTTP requests in
// flight together on the platform clock, and the adapter's send-time sleep is what is tested.
function fakeRpc(
  sync: "supported" | "unsupported" | "rejected" | "timeout" | "empty" = "unsupported",
) {
  const genesis = Date.now();
  // 100 ms fake blocks; a sent transaction is mined in the next one.
  const head = () => 1000 + Math.floor((Date.now() - genesis) / 100);
  const mined = new Map<Hex, number>();
  const log: { method: string; at: number; round: number }[] = [];
  let rounds = 0,
    inflight = 0,
    nonce = 0;
  const rpc = { chainId: "0x279f", code: "0x01", knownTransaction: false, unsupportedCode: -32601 };
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = rpcRequest.parse(await request.json());
      const first = body.params[0];
      if (inflight++ === 0) rounds++;
      log.push({ method: body.method, at: Date.now(), round: rounds });
      await Bun.sleep(25);
      inflight--;
      const block = head();
      let result: unknown;
      switch (body.method) {
        case "eth_chainId":
          result = rpc.chainId;
          break;
        case "eth_getCode":
          result = rpc.code;
          break;
        case "eth_blockNumber":
          result = numberToHex(block);
          break;
        case "eth_getBlockByNumber":
          result = {
            number: numberToHex(block),
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
          result = numberToHex(nonce);
          break;
        case "eth_getTransaction":
          result = rpc.knownTransaction ? { hash: zero } : null;
          break;
        case "eth_sendRawTransactionSync": {
          if (sync === "unsupported")
            return Response.json({
              jsonrpc: "2.0",
              id: body.id,
              error: { code: rpc.unsupportedCode, message: "Method not supported" },
            });
          if (sync === "rejected" || sync === "timeout")
            return Response.json({
              jsonrpc: "2.0",
              id: body.id,
              error: {
                code: sync === "timeout" ? 4 : 5,
                message: sync === "timeout" ? "Receipt wait timed out" : "Transaction not ready",
              },
            });
          if (sync === "empty") {
            result = null;
            break;
          }
          const hash = keccak256(hex.parse(first));
          mined.set(hash, block + 1);
          nonce++;
          await Bun.sleep(110);
          result = {
            transactionHash: hash,
            blockHash: zero,
            blockNumber: numberToHex(block + 1),
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
          mined.set(hash, block + 1);
          nonce++;
          result = hash;
          break;
        }
        case "eth_getTransactionReceipt": {
          const hash = hex.parse(first);
          const at = mined.get(hash);
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
  });
  return { server, config, log, rpc };
}
const flag: Command = { kind: "flagSaid", args: [1n, 0, 0, 7090], gas: gasLimit("flagSaid") };

it("signs a flag at its spoken time after one pre-sign round and re-checks the chain before sending", async () => {
  const { server, config, log } = fakeRpc();
  try {
    const chain = createEpisodeChain(config);
    const notBeforeMs = Date.now() + 600;
    const tx = await chain.prepare({ ...flag, notBeforeMs });
    expect(Date.now()).toBeGreaterThanOrEqual(notBeforeMs);
    // Before: chain id, bytecode, fee block, priority fee and nonce were read one after
    // another from t on (seven serial RTTs to the send, 0.9 s live on episode 10).
    const presign = [...log];
    expect(new Set(presign.map((r) => r.round)).size).toBe(1);
    for (const read of presign) expect(read.at).toBeGreaterThanOrEqual(notBeforeMs - PRESIGN_MS);
    const receipt = await chain.broadcast(tx);
    // No receipt lookup for bytes never sent, but the endpoint must still be testnet.
    expect(log[presign.length]?.method).toBe("eth_chainId");
    expect(log[presign.length + 1]?.method).toBe("eth_sendRawTransactionSync");
    expect(log[presign.length + 2]?.method).toBe("eth_sendRawTransaction");
    expect(receipt).toMatchObject({ hash: tx.hash, success: true });
  } finally {
    server.stop(true);
  }
});

it("re-checks the chain id and a mined receipt before resending journaled bytes after restart", async () => {
  const { server, config, log } = fakeRpc();
  try {
    const tx = await createEpisodeChain(config).prepare(flag);
    const restarted = createEpisodeChain(config);
    const before = log.length;
    expect(await restarted.broadcast(tx)).toMatchObject({ hash: tx.hash, success: true });
    const methods = log.slice(before).map((r) => r.method);
    const send = methods.indexOf("eth_sendRawTransaction");
    expect(send).toBeGreaterThan(0);
    expect(methods.slice(0, send)).toEqual(
      expect.arrayContaining(["eth_chainId", "eth_getTransactionReceipt"]),
    );
  } finally {
    server.stop(true);
  }
});

it("refuses fresh signed bytes when the RPC changes chains before broadcast", async () => {
  const { server, config, log, rpc } = fakeRpc();
  try {
    const chain = createEpisodeChain(config);
    const tx = await chain.prepare(flag);
    rpc.chainId = "0x1";
    await expect(chain.broadcast(tx)).rejects.toThrow("RPC is not Monad testnet");
    expect(log.some((read) => read.method === "eth_sendRawTransaction")).toBe(false);
  } finally {
    server.stop(true);
  }
});

it("refuses to sign a flag when pre-sign reads outlive its clip window", async () => {
  const { server, config, log } = fakeRpc();
  try {
    await expect(
      createEpisodeChain(config).prepare({ ...flag, notAfterMs: Date.now() + 1 }),
    ).rejects.toThrow("Operator clip window elapsed before signing");
    expect(log.some((read) => read.method === "eth_sendRawTransaction")).toBe(false);
  } finally {
    server.stop(true);
  }
});

it("rejects an empty bytecode result before signing", async () => {
  const { server, config, rpc } = fakeRpc();
  try {
    rpc.code = "0x";
    await expect(createEpisodeChain(config).prepare(flag)).rejects.toThrow(
      "Missing SaysoMarkets bytecode",
    );
  } finally {
    server.stop(true);
  }
});

it("consumes a synchronous flag receipt without polling or an inclusion sleep", async () => {
  const { server, config, log } = fakeRpc("supported");
  try {
    const chain = createEpisodeChain(config);
    const scheduledMs = Date.now() + 600;
    const tx = await chain.prepare({ ...flag, notBeforeMs: scheduledMs });
    const receipt = await chain.broadcast(tx);
    const returnedMs = Date.now();
    expect(receipt).toMatchObject({ hash: tx.hash, success: true });
    const methods = log.map((r) => r.method);
    expect(methods.filter((m) => m === "eth_sendRawTransactionSync")).toHaveLength(1);
    expect(methods).not.toContain("eth_sendRawTransaction");
    expect(methods).not.toContain("eth_getTransactionReceipt");
    const timing = receipt.timing;
    if (!timing || timing.signedReadyMs === undefined) throw new Error("Missing flag timing");
    // The fallback's 300 ms inclusion pause runs after the receipt is observed; measure only that gap,
    // not signing or HTTP time, which varies with suite load.
    expect(returnedMs - timing.receiptObservedMs).toBeLessThan(150);
    expect(timing.signedReadyMs).toBeGreaterThanOrEqual(scheduledMs);
    expect(timing.rpcSendStartMs).toBeGreaterThanOrEqual(timing.signedReadyMs);
    expect(timing.rpcSendAckMs).toBe(timing.receiptObservedMs);
  } finally {
    server.stop(true);
  }
});

it.each([-32601, -32004])(
  "caches unsupported sync code %i and polls fallback receipts",
  async (code) => {
    const { server, config, log, rpc } = fakeRpc();
    rpc.unsupportedCode = code;
    try {
      const chain = createEpisodeChain(config);
      for (let i = 0; i < 2; i++) {
        const tx = await chain.prepare(flag);
        expect(await chain.broadcast(tx)).toMatchObject({ hash: tx.hash, success: true });
      }
      expect(log.filter((r) => r.method === "eth_sendRawTransactionSync")).toHaveLength(1);
      expect(log.filter((r) => r.method === "eth_sendRawTransaction")).toHaveLength(2);
      expect(log.some((r) => r.method === "eth_getTransactionReceipt")).toBe(true);
    } finally {
      server.stop(true);
    }
  },
);

it.each(["rejected", "timeout", "empty"] as const)(
  "surfaces a %s sync send without fallback or masking it with a transaction lookup",
  async (mode) => {
    const { server, config, log, rpc } = fakeRpc(mode);
    rpc.knownTransaction = true;
    try {
      const chain = createEpisodeChain(config);
      const tx = await chain.prepare(flag);
      await expect(chain.broadcast(tx)).rejects.toThrow();
      expect(log.filter((r) => r.method === "eth_sendRawTransactionSync")).toHaveLength(1);
      expect(log.some((r) => r.method === "eth_sendRawTransaction")).toBe(false);
      expect(log.some((r) => r.method === "eth_getTransaction")).toBe(false);
      await expect(chain.prepare(flag)).rejects.toThrow("requires recovery");
    } finally {
      server.stop(true);
    }
  },
);
