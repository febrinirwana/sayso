import { createPublicClient, HttpRequestError } from "viem";
import { expect, it, vi } from "vitest";
import { failureCode, operatorFailure } from "./operator-log.ts";
import { expireStudioChainId, invalidateStudioReads, studioRpc } from "./rpc.ts";

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
