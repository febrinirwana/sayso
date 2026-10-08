import { addresses, ONE, orderBookAbi, routerAbi, saysoMarketsAbi } from "@sayso/core";
import { createPublicClient, decodeFunctionData, encodeFunctionResult, type Hex, http } from "viem";
import { expect, it, vi } from "vitest";
import { parseConfig } from "./config.ts";
import { createCreRunner } from "./cre-runner.ts";
import { openDatabase } from "./db.ts";
import { createEpisodeChain } from "./episode-chain.ts";
import { createMakerChain } from "./maker-chain.ts";
import { studioRpcRequestCount } from "./rpc.ts";

it("keeps shared six-word Live reads within eight RPC requests per second", async () => {
  let now = 100_000;
  let requests = 0;
  const markets = "0x0000000000000000000000000000000000000001";
  const token = "0x0000000000000000000000000000000000000002";
  const book = "0x0000000000000000000000000000000000000003";
  const zero = `0x${"0".repeat(64)}` as Hex;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as {
        id: number;
        method: string;
        params: [{ data: Hex }];
      };
      requests++;
      let result: unknown;
      if (body.method === "eth_chainId") result = "0x279f";
      else if (body.method === "eth_getCode") result = "0x01";
      else if (body.method === "eth_getBlockByNumber")
        result = {
          number: `0x${Math.floor(now / 400).toString(16)}`,
          timestamp: `0x${Math.floor(now / 1000).toString(16)}`,
          hash: zero,
          parentHash: zero,
          transactions: [],
        };
      else if (body.method === "eth_call") {
        const data = body.params[0].data;
        for (const abi of [saysoMarketsAbi, routerAbi, orderBookAbi]) {
          try {
            const call = decodeFunctionData({ abi, data });
            const name = call.functionName;
            let value: unknown;
            if (name === "episode")
              value = {
                clipId: zero,
                rootA: zero,
                rootB: zero,
                startsAt: 100n,
                endsAt: 200n,
                closedAt: 0n,
                wordCount: 6,
                resolvedCount: 0,
                listed: true,
                closed: false,
              };
            else if (name === "episodeWords") value = [1n, 2n, 3n, 4n, 5n, 6n];
            else if (name === "word")
              value = {
                episodeId: 1,
                state: 0,
                chunkA: 0,
                chunkB: 0,
                offsetMs: 0,
                text: zero,
                yes: token,
                no: token,
                market: book,
                sets: 0n,
              };
            else if (name === "AUSD") value = addresses.ausd;
            else if (name === "KURU_ROUTER") value = addresses.kuruRouter;
            else if (name === "marginAccountAddress") value = addresses.kuruMarginAccount;
            else if (name === "getMarketParams")
              value = [10000, ONE, token, 6n, addresses.ausd, 6n, 100, ONE, 10000000000n, 0n, 0n];
            else continue;
            result = encodeFunctionResult({ abi, functionName: name, result: value } as never);
            break;
          } catch {
            /* Try the next ABI, never external content. */
          }
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
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    const config = parseConfig({
      RPC_URL: server.url.toString(),
      CHAIN_ID: "10143",
      STUDIO_DATA_DIR: "unused",
      SAYSO_MARKETS: markets,
      OPERATOR_PK: `0x${"1".repeat(64)}`,
      BOT_PK: `0x${"2".repeat(64)}`,
    });
    // Before: the old uncached http transport, replaying one second of the same 50 ms tick reads.
    const plain = createPublicClient({ transport: http(server.url.toString(), { retryCount: 0 }) });
    const episodeRead = {
      address: markets,
      abi: saysoMarketsAbi,
      functionName: "episode",
      args: [1],
    } as const;
    for (let tick = 0; tick < 20; tick++) {
      now = 100_000 + tick * 50;
      for (let clock = 0; clock < 2; clock++)
        await Promise.all([
          plain.readContract(episodeRead),
          plain.getBlock({ blockTag: "latest" }),
        ]);
      await plain.readContract({
        address: markets,
        abi: saysoMarketsAbi,
        functionName: "episodeWords",
        args: [1],
      });
      for (let id = 1n; id <= 6n; id++) {
        await plain.readContract({
          address: markets,
          abi: saysoMarketsAbi,
          functionName: "word",
          args: [id],
        });
        await plain.getChainId();
        for (const address of [
          markets,
          addresses.ausd,
          addresses.kuruMarginAccount,
          addresses.kuruRouter,
          token,
          book,
        ] as const)
          await plain.getCode({ address });
        await Promise.all([
          plain.readContract({ address: markets, abi: saysoMarketsAbi, functionName: "AUSD" }),
          plain.readContract({
            address: markets,
            abi: saysoMarketsAbi,
            functionName: "KURU_ROUTER",
          }),
          plain.readContract({
            address: addresses.kuruRouter,
            abi: routerAbi,
            functionName: "marginAccountAddress",
          }),
        ]);
        await plain.readContract({
          address: book,
          abi: orderBookAbi,
          functionName: "getMarketParams",
        });
      }
    }
    const before = requests;
    requests = 0;
    const operator = createEpisodeChain(config);
    const maker = createMakerChain(config);
    // Exact 50 ms call pattern of the old runtime, including the maker's six-word scan.
    for (let tick = 0; tick < 1200; tick++) {
      now = 100_000 + tick * 50;
      await operator.episode(1);
      await maker.clock(1);
      for (const id of await maker.words(1)) await maker.word(id);
    }
    process.stdout.write(
      `${JSON.stringify({ measurement: "live_rpc", beforeRequestsPerSecond: before, seconds: 60, requests, requestsPerSecond: requests / 60 })}\n`,
    );
    expect(requests / 60).toBeLessThanOrEqual(8);
    expect(studioRpcRequestCount(config.rpcUrl)).toBe(requests);
  } finally {
    clock.mockRestore();
    server.stop(true);
  }
}, 120_000);

it("measures idle discovery before and after the shared transport and cadence", async () => {
  let now = 0,
    requests = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      requests++;
      const body = (await request.json()) as { id: number; method: string };
      const result =
        body.method === "eth_chainId"
          ? "0x279f"
          : body.method === "eth_blockNumber"
            ? `0x${Math.floor(now / 400).toString(16)}`
            : [];
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    },
  });
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  const db = openDatabase(":memory:");
  try {
    const client = createPublicClient({
      transport: http(server.url.toString(), { retryCount: 0 }),
    });
    for (let i = 1; i <= 10; i++) {
      now = i * 1000;
      // Original discover(): chain-id, head and one canonical trigger-log scan each second.
      await client.getChainId();
      const head = await client.getBlockNumber({ cacheTime: 0 });
      await client.getLogs({ fromBlock: head, toBlock: head });
    }
    const before = requests / 10;
    const cre = createCreRunner({
      db,
      rpcUrl: server.url.toString(),
      receiver: "0x0000000000000000000000000000000000000001",
      revealApiBaseUrl: "http://127.0.0.1/",
      resolverDir: "unused",
      mode: "don",
      startBlock: 25n,
      processEnv: () => ({}),
    });
    await cre.tick();
    requests = 0;
    for (let i = 1; i <= 5; i++) {
      now = 10_000 + i * 2000;
      await cre.tick();
    }
    const after = requests / 10;
    process.stdout.write(`${JSON.stringify({ measurement: "idle_rpc", before, after })}\n`);
    expect(before).toBe(3);
    expect(after).toBeLessThanOrEqual(2);
    await cre.stop();
  } finally {
    clock.mockRestore();
    db.close();
    server.stop(true);
  }
});
