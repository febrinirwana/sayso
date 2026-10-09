import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { createChainReader } from "./chain.ts";
import { clientIp } from "./client-ip.ts";
import { parseConfig } from "./config.ts";
import { createCreRunner } from "./cre-runner.ts";
import { openDatabase } from "./db.ts";
import { DripService } from "./drip.ts";
import { createDripChain } from "./drip-chain.ts";
import { createEpisodeChain } from "./episode-chain.ts";
import { loadClipLibrary } from "./library.ts";
import { HouseMaker } from "./maker.ts";
import { createMakerChain } from "./maker-chain.ts";
import { operatorFailure } from "./operator-log.ts";
import { EpisodeRunner } from "./runner.ts";

try {
  const config = parseConfig(Bun.env);
  const clipDirectory = join(config.dataDir, "clips");
  await mkdir(clipDirectory, { recursive: true });
  const db = openDatabase(join(config.dataDir, "studio.sqlite"));
  try {
    await loadClipLibrary(db, clipDirectory, Date.now);
    const makerChain =
      config.saysoMarkets && config.privateKey("bot") ? createMakerChain(config) : undefined;
    const maker = makerChain ? new HouseMaker({ db, now: Date.now, chain: makerChain }) : undefined;
    const salt = config.dripIpSalt();
    const drip =
      salt && config.privateKey("drip")
        ? new DripService({ db, chain: createDripChain(config), ipSalt: salt })
        : undefined;
    const reporter = config.keyAddresses.find(({ role }) => role === "reporter");
    const cre =
      config.saysoMarkets &&
      config.startBlock !== undefined &&
      config.revealApiBaseUrl &&
      (config.creMode === "don" || reporter)
        ? createCreRunner({
            db,
            rpcUrl: config.rpcUrl,
            receiver: config.saysoMarkets,
            revealApiBaseUrl: config.revealApiBaseUrl,
            resolverDir:
              config.creResolverDir ??
              fileURLToPath(new URL("../../../cre/resolver/", import.meta.url)),
            cliPath: config.creCliPath,
            mode: config.creMode,
            startBlock: config.startBlock,
            ...(reporter ? { reporterAddress: reporter.address } : {}),
            processEnv: () => {
              const env: NodeJS.ProcessEnv = {};
              for (const name of [
                "PATH",
                "HOME",
                "USERPROFILE",
                "APPDATA",
                "LOCALAPPDATA",
                "SystemRoot",
                "SYSTEMROOT",
                "COMSPEC",
                "TEMP",
                "TMP",
                "CRE_API_KEY",
              ]) {
                if (Bun.env[name] !== undefined) env[name] = Bun.env[name];
              }
              const key = config.privateKey("reporter");
              if (key) env.CRE_ETH_PRIVATE_KEY = key;
              return env;
            },
          })
        : undefined;
    const runner =
      config.saysoMarkets && config.privateKey("operator") && maker && cre
        ? new EpisodeRunner({
            db,
            now: Date.now,
            chain: createEpisodeChain(config),
            log: (entry) => console.log(JSON.stringify({ event: "flag_latency", ...entry })),
            seed: maker,
            onReceipt: cre.onReceipt,
            onBackgroundError: operatorFailure,
          })
        : undefined;
    await runner?.tick();
    const ips = new WeakMap<Request, string>();
    const app = createApp({
      db,
      now: Date.now,
      chain: createChainReader(config),
      runner,
      drip,
      ip: (request) => ips.get(request) ?? "unknown",
    });
    const server = Bun.serve({
      port: config.port,
      hostname: config.behindCaddy ? "127.0.0.1" : "0.0.0.0",
      idleTimeout: 0,
      fetch(request, server) {
        const peer = server.requestIP(request)?.address ?? null;
        const ip = clientIp(request, peer, config.behindCaddy);
        if (!ip) return new Response(null, { status: 400 });
        ips.set(request, ip);
        return app.fetch(request);
      },
    });
    cre?.start();
    let stopping = false;
    let clock: Timer | undefined;
    let botClock: Timer | undefined;
    const tick = async () => {
      try {
        await runner?.tick();
      } catch (error) {
        operatorFailure("clock", error);
      } finally {
        if (!stopping && runner) clock = setTimeout(tick, runner.nextWakeMs());
      }
    };
    // The BOT runs on its own clock so a pull never waits for an OPERATOR receipt.
    const botTick = async () => {
      await runner?.tickMaker();
      if (!stopping && runner) botClock = setTimeout(botTick, runner.nextMakerWakeMs());
    };
    if (runner) {
      clock = setTimeout(tick, runner.nextWakeMs());
      botClock = setTimeout(botTick, runner.nextMakerWakeMs());
    }
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      clearTimeout(clock);
      clearTimeout(botClock);
      server.stop(true);
      await runner?.stop();
      await Promise.all([maker?.stop(), cre?.stop(), drip?.stop()]);
      db.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    console.log(`SAYSO studio TESTNET listening on port ${server.port}`);
  } catch (error) {
    db.close();
    throw error;
  }
} catch (error) {
  operatorFailure("startup", error);
  process.exitCode = 1;
}
