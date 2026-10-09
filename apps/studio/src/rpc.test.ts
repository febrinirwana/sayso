import { orderBookAbi } from "@sayso/core";
import { createPublicClient, encodeFunctionData, HttpRequestError, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, it, vi } from "vitest";
import { failureCode, operatorFailure } from "./operator-log.ts";
import {
  configureStudioRpc,
  expireStudioChainId,
  invalidateStudioReads,
  studioRpc,
  urgentReads,
} from "./rpc.ts";

it("preserves dependency bytecode verification across receipts", async () => {
  let calls = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      calls++;
      const { id } = (await request.json()) as { id: number };
      return Response.json({ jsonrpc: "2.0", id, result: "0x01" });
    },
  });
  try {
    const url = server.url.toString();
    const client = createPublicClient({ transport: studioRpc(url) });
    const address = "0x0000000000000000000000000000000000000001";
    await client.getCode({ address });
    invalidateStudioReads(url);
    await client.getCode({ address });
    expect(calls).toBe(1);
  } finally {
    server.stop(true);
  }
});
it("caches chain id for reads but re-reads it before signing or broadcasting", async () => {
  let chain = 10143;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const { id } = (await request.json()) as { id: number };
      return Response.json({ jsonrpc: "2.0", id, result: `0x${chain.toString(16)}` });
    },
  });
  try {
    const url = server.url.toString();
    const client = createPublicClient({ transport: studioRpc(url) });
    expect(await client.getChainId()).toBe(10143);
    chain = 1;
    expect(await client.getChainId()).toBe(10143);
    expireStudioChainId(url);
    expect(await client.getChainId()).toBe(1);
  } finally {
    server.stop(true);
  }
});
it("backs rate-limited reads off exponentially without viem retries", async () => {
  let now = 0,
    calls = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      calls++;
      return new Response("private body", { status: 429 });
    },
  });
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    const client = createPublicClient({ transport: studioRpc(server.url.toString()) });
    for (const time of [0, 50, 100, 999, 1000, 1050, 2000, 2999, 3000]) {
      now = time;
      await expect(
        client.getBalance({ address: "0x0000000000000000000000000000000000000001" }),
      ).rejects.toSatisfy((error) => failureCode(error) === "rpc_rate_limited");
    }
    expect(calls).toBe(3);
  } finally {
    clock.mockRestore();
    server.stop(true);
  }
});
it("lets a short burst through, then paces sustained reads at the configured rate", async () => {
  // VPS 2026-10-10: concurrent clock/maker/CRE reads burst past QuickNode's 50/s, and each 429 then
  // blocked every read (including CRE preflight) for up to 30 s.
  const starts: number[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      starts.push(performance.now());
      const { id } = (await request.json()) as { id: number };
      return Response.json({ jsonrpc: "2.0", id, result: "0x1" });
    },
  });
  try {
    const url = server.url.toString();
    configureStudioRpc(url, { readsPerSecond: 20 });
    const client = createPublicClient({ transport: studioRpc(url) });
    const addresses = Array.from(
      { length: 30 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as const,
    );
    await Promise.all(addresses.map((address) => client.getBalance({ address })));
    starts.sort((a, b) => a - b);
    expect(starts).toHaveLength(30);
    // Burst of rate/2 = 10 leaves at once; the other 20 follow 50 ms apart (~1 s).
    expect(starts[9]! - starts[0]!).toBeLessThan(200);
    expect(starts[29]! - starts[0]!).toBeGreaterThanOrEqual(900);
  } finally {
    server.stop(true);
  }
});
it("leaves reads unpaced unless a rate is configured", async () => {
  const starts: number[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      starts.push(performance.now());
      const { id } = (await request.json()) as { id: number };
      return Response.json({ jsonrpc: "2.0", id, result: "0x1" });
    },
  });
  try {
    const client = createPublicClient({ transport: studioRpc(server.url.toString()) });
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        client.getBalance({ address: `0x${(i + 1).toString(16).padStart(40, "0")}` }),
      ),
    );
    starts.sort((a, b) => a - b);
    expect(starts[19]! - starts[0]!).toBeLessThan(200);
  } finally {
    server.stop(true);
  }
});
it("lets a write's preparation reads skip the queue that paced reads wait in", async () => {
  // VPS episodes 19/20: paced at 20/s, the first house pull's pre-sign reads queued behind maker
  // reads, so the pull left 1.9-2.4 s late and landed after its flag.
  const seen: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const { id, params } = (await request.json()) as { id: number; params: [string] };
      seen.push(params[0]);
      return Response.json({ jsonrpc: "2.0", id, result: "0x1" });
    },
  });
  try {
    const url = server.url.toString();
    configureStudioRpc(url, { readsPerSecond: 2 });
    const client = createPublicClient({ transport: studioRpc(url) });
    const at = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as const;
    const queued = Array.from({ length: 4 }, (_, i) => client.getBalance({ address: at(i + 1) }));
    await urgentReads(() => client.getBalance({ address: at(99) }));
    // Rate 2/s admits one read at once; the other paced reads are still waiting 0.5 s apart.
    expect(seen).toContain(at(99));
    expect(seen.length).toBeLessThan(5);
    await Promise.all(queued);
  } finally {
    server.stop(true);
  }
});
it("maps 429 through viem causes and logs only a closed schema", () => {
  const error = new HttpRequestError({
    url: "https://secret:credential.invalid",
    status: 429,
    body: { private: "body" },
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(failureCode({ name: "ContractFunctionExecutionError", cause: error })).toBe(
      "rpc_rate_limited",
    );
    operatorFailure("maker", error);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "studio_failure",
        source: "maker",
        kind: "failure",
        code: "rpc_rate_limited",
      }),
    );
    for (const [name, code] of [
      ["WaitForTransactionReceiptTimeoutError", "receipt_timeout"],
      ["ExecutionRevertedError", "reverted"],
      ["InsufficientFundsError", "insufficient_funds"],
      ["HttpRequestError", "rpc_unavailable"],
      ["Error", "unknown"],
    ])
      expect(failureCode({ name })).toBe(code);
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    expect(failureCode(cycle)).toBe("unknown");
  } finally {
    log.mockRestore();
  }
});

it.each(["batchCancelOrders", "batchCancelFlipOrders"] as const)(
  "uses sync inclusion for the house's %s without a receipt RPC",
  async (functionName) => {
    const raw = await privateKeyToAccount(`0x${"2".repeat(64)}`).signTransaction({
      chainId: 10143,
      type: "eip1559",
      to: "0x0000000000000000000000000000000000000001",
      data: encodeFunctionData({ abi: orderBookAbi, functionName, args: [[1, 2]] }),
      gas: 120000n,
      nonce: 0,
      maxFeePerGas: 122000000000n,
      maxPriorityFeePerGas: 2000000000n,
    });
    const hash = keccak256(raw);
    const requests: { method: string; params: unknown[] }[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as { id: number; method: string; params: unknown[] };
        requests.push(body);
        if (body.method !== "eth_sendRawTransactionSync")
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32601, message: "unexpected RPC" },
          });
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            transactionHash: hash,
            blockHash: `0x${"0".repeat(64)}`,
            blockNumber: "0x2",
            transactionIndex: "0x0",
            from: "0x0000000000000000000000000000000000000001",
            to: "0x0000000000000000000000000000000000000001",
            cumulativeGasUsed: "0x1",
            gasUsed: "0x1",
            effectiveGasPrice: "0x1",
            contractAddress: null,
            logs: [],
            logsBloom: `0x${"0".repeat(512)}`,
            status: "0x1",
            type: "0x2",
          },
        });
      },
    });
    try {
      const client = createPublicClient({ transport: studioRpc(server.url.toString()) });
      expect(await client.sendRawTransaction({ serializedTransaction: raw })).toBe(hash);
      expect(await client.getTransactionReceipt({ hash })).toMatchObject({
        transactionHash: hash,
        status: "success",
      });
      expect(requests).toEqual([
        {
          id: expect.any(Number),
          jsonrpc: "2.0",
          method: "eth_sendRawTransactionSync",
          params: [raw, 1000],
        },
      ]);
    } finally {
      server.stop(true);
    }
  },
);
