import { addresses, gasWithMargin, ONE, saysoMarketsAbi } from "@sayso/core";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  erc20Abi,
  type Hex,
  http,
  parseEventLogs,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { expect, it } from "vitest";
import { parseConfig } from "./config.ts";
import { createCreRunner } from "./cre-runner.ts";
import { openDatabase } from "./db.ts";
import { createEpisodeChain } from "./episode-chain.ts";
import { HouseMaker } from "./maker.ts";
import { createMakerChain } from "./maker-chain.ts";
import { EpisodeRunner } from "./runner.ts";

// Opt-in, loopback-only: no private credentials and no writes to public testnet.
// Real sleeps deliberately measure platform-clock send latency against 400 ms fork blocks;
// fake timers cannot measure network/signing time or advance an external Anvil process.
it.skipIf(!Bun.env.STUDIO_FORK_URL)(
  "measures actual seeded books and timed flag broadcasts on a Monad fork",
  async () => {
    const fork = new URL(Bun.env.STUDIO_FORK_URL!);
    if (fork.hostname !== "127.0.0.1") throw new Error("Fork must be loopback");
    let requests = 0;
    const methods: Record<string, number> = {};
    const slow: Record<string, number> = {};
    const flagSends: number[] = [];
    const proxy = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = await request.text();
        requests++;
        const rpc = JSON.parse(body) as { method: string };
        methods[rpc.method] = (methods[rpc.method] ?? 0) + 1;
        const at = Date.now();
        if (rpc.method === "eth_sendRawTransaction") flagSends.push(Date.now());
        const response = await fetch(fork, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        slow[rpc.method] = Math.max(slow[rpc.method] ?? 0, Date.now() - at);
        return response;
      },
    });
    const db = openDatabase(":memory:");
    const operatorKey = generatePrivateKey();
    const botKey = generatePrivateKey();
    const account = privateKeyToAccount(operatorKey);
    const bot = privateKeyToAccount(botKey);
    const client = createPublicClient({
      chain: monadTestnet,
      transport: http(fork.toString(), { retryCount: 0 }),
    });
    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(fork.toString()),
    });
    let runner: EpisodeRunner | undefined;
    await client.request({
      method: "anvil_setBalance",
      params: [account.address, "0x21e19e0c9bab2400000"],
    } as never);
    await client.request({
      method: "anvil_setBalance",
      params: [bot.address, "0x21e19e0c9bab2400000"],
    } as never);
    // Anvil keeps the fork block's time offset (observed ~8-14 s behind wall clock); Monad
    // block time tracks wall clock, and flags correctly wait for chain time >= startsAt.
    await client.request({
      method: "anvil_setTime",
      params: [Math.ceil(Date.now() / 1000)],
    } as never);
    let maker: HouseMaker | undefined;
    try {
      const artifact = await Bun.file(
        new URL("../../../contracts/out/SaysoMarkets.sol/SaysoMarkets.json", import.meta.url),
      ).json();
      const receiver = "0xc8492B2906d57c184be372899d18EDF195D11CF8" as Address;
      const implementation = await client.readContract({
        address: receiver,
        abi: saysoMarketsAbi,
        functionName: "TOKEN_IMPL",
      });
      const args = [
        addresses.creSimulationForwarder,
        addresses.ausd,
        addresses.kuruRouter,
        implementation,
      ];
      const data = encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
        args,
      });
      const deployed = await wallet.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
        args,
        gas: gasWithMargin(await client.estimateGas({ account, data })),
      });
      const markets = (
        await client.waitForTransactionReceipt({ hash: deployed, pollingInterval: 400 })
      ).contractAddress!;
      const operatorRequest = {
        account,
        address: markets,
        abi: saysoMarketsAbi,
        functionName: "setOperator",
        args: [account.address],
      } as const;
      await client.waitForTransactionReceipt({
        hash: await wallet.writeContract({
          ...operatorRequest,
          gas: gasWithMargin(await client.estimateContractGas(operatorRequest)),
        }),
        pollingInterval: 400,
      });
      const faucetAbi = [
        {
          type: "function",
          name: "requestFunds",
          stateMutability: "nonpayable",
          inputs: [{ name: "recipient", type: "address" }],
          outputs: [],
        },
      ] as const;
      const faucetRequest = {
        account,
        address: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
        abi: faucetAbi,
        functionName: "requestFunds",
        args: [bot.address],
      } as const;
      await client.waitForTransactionReceipt({
        hash: await wallet.writeContract({
          ...faucetRequest,
          gas: gasWithMargin(await client.estimateContractGas(faucetRequest)),
        }),
        pollingInterval: 400,
      });
      expect(
        await client.readContract({
          address: addresses.ausd,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [bot.address],
        }),
      ).toBeGreaterThanOrEqual(240n * ONE);
      const config = parseConfig({
        RPC_URL: proxy.url.toString(),
        CHAIN_ID: "10143",
        STUDIO_DATA_DIR: "unused",
        SAYSO_MARKETS: markets,
        OPERATOR_PK: operatorKey,
        BOT_PK: botKey,
      });
      const makerChain = createMakerChain(config);
      maker = new HouseMaker({
        db,
        now: Date.now,
        chain: makerChain,
        positions: {
          async outstandingYes() {
            return 0n;
          },
        },
      });
      runner = new EpisodeRunner({
        db,
        now: Date.now,
        chain: createEpisodeChain(config),
        seed: maker,
        log() {},
      });
      const cre = createCreRunner({
        db,
        rpcUrl: proxy.url.toString(),
        receiver: markets,
        revealApiBaseUrl: "http://127.0.0.1/",
        resolverDir: "unused",
        mode: "don",
        startBlock: await client.getBlockNumber(),
        processEnv: () => ({}),
      });
      // Warm chain-id validation, then measure idle discovery with the runtime's 2 s cadence.
      await cre.tick();
      requests = 0;
      const idleAt = Date.now();
      for (let i = 0; i < 3; i++) {
        await Bun.sleep(2000);
        await runner.tick();
        await cre.tick();
      }
      const idleRate = requests / ((Date.now() - idleAt) / 1000);
      expect(idleRate).toBeLessThanOrEqual(2);
      const root = stringToHex("fork measurement", { size: 32 });
      const words = ["one", "two", "three", "four", "five", "six"];
      db.query("INSERT INTO clips VALUES('fork',?,? ,65000,'CC0',NULL,?,?,?,0)").run(
        root,
        root,
        JSON.stringify(words),
        root,
        root,
      );
      for (const engine of ["A", "B"])
        db.query("INSERT INTO chunks VALUES(?,?,0,0,65000,'[]',?,'[]')").run(root, engine, root);
      for (let i = 0; i < words.length; i++)
        db.query("INSERT INTO flag_plan VALUES(?,?,?,0,0)").run(root, words[i]!, 5000 + i * 8000);
      const seedAt = Date.now();
      const id = await runner.request("on_demand");
      while (
        db
          .query<{ status: string }, [number]>(
            "SELECT status FROM actions WHERE episode_id=? AND kind='seed'",
          )
          .get(id)!.status !== "confirmed"
      ) {
        await runner.tick();
        await Bun.sleep(50);
      }
      const seedDurationMs = Date.now() - seedAt;
      const journal = JSON.parse(
        db
          .query<{ payload_json: string }, [number]>(
            "SELECT payload_json FROM actions WHERE episode_id=? AND kind='seed'",
          )
          .get(id)!.payload_json,
      ) as { steps: unknown[] };
      expect(journal.steps).toHaveLength(27);
      process.stdout.write(
        `${JSON.stringify({ measurement: "seed_rpc", seedDurationMs, methods, slow })}\n`,
      );
      const starts = db
        .query<{ starts_at_ms: number }, [number]>("SELECT starts_at_ms FROM episodes WHERE id=?")
        .get(id)!.starts_at_ms;
      await Bun.sleep(Math.max(0, starts - Date.now()));
      requests = 0;
      flagSends.length = 0;
      const liveAt = Date.now();
      let nextCre = liveAt;
      while (Date.now() - liveAt < 60_000) {
        await runner.tick();
        if (Date.now() >= nextCre) {
          void cre.tick();
          nextCre = Date.now() + 2000;
        }
        await Bun.sleep(runner.nextWakeMs());
      }
      const delays = db
        .query<{ sent_ms: number; scheduled_ms: number }, []>(
          "SELECT sent_ms,scheduled_ms FROM actions WHERE kind='flag' ORDER BY scheduled_ms",
        )
        .all()
        .map((row) => row.sent_ms - row.scheduled_ms);
      const rate = requests / ((Date.now() - liveAt) / 1000);
      const flagReceipts = db
        .query<{ tx_hash: Hex }, []>(
          "SELECT tx_hash FROM actions WHERE kind='flag' AND status='confirmed'",
        )
        .all();
      for (const row of flagReceipts)
        expect(
          parseEventLogs({
            abi: saysoMarketsAbi,
            logs: (await client.getTransactionReceipt({ hash: row.tx_hash })).logs,
          }).some((log) => log.eventName === "WordFlagged"),
        ).toBe(true);
      process.stdout.write(
        `${JSON.stringify({ measurement: "fork_runtime", seedTransactions: journal.steps.length, seedDurationMs, idleRequestsPerSecond: idleRate, liveRequestsPerSecond: rate, flagSendDelaysMs: delays, rawBroadcastCount: flagSends.length })}\n`,
      );
      expect(delays).toHaveLength(6);
      expect(Math.max(...delays)).toBeLessThanOrEqual(100);
      expect(rate).toBeLessThanOrEqual(8);
      await cre.stop();
    } finally {
      await runner?.stop();
      await maker?.stop();
      db.close();
      proxy.stop(true);
    }
  },
  300_000,
);
