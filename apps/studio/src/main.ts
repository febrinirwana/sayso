import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createApp } from "./app.ts";
import { createChainReader } from "./chain.ts";
import { parseConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { createEpisodeChain } from "./episode-chain.ts";
import { loadClipLibrary } from "./library.ts";
import { EpisodeRunner } from "./runner.ts";

try {
  const config = parseConfig(Bun.env);
  const clipDirectory = join(config.dataDir, "clips");
  await mkdir(clipDirectory, { recursive: true });
  const db = openDatabase(join(config.dataDir, "studio.sqlite"));
  try {
    await loadClipLibrary(db, clipDirectory, Date.now);
    const runner =
      config.saysoMarkets && config.privateKey("operator")
        ? new EpisodeRunner({
            db,
            now: Date.now,
            chain: createEpisodeChain(config),
            log: (entry) => console.log(JSON.stringify({ event: "flag_latency", ...entry })),
          })
        : undefined;
    await runner?.tick();
    const ips = new WeakMap<Request, string>();
    const app = createApp({
      db,
      now: Date.now,
      chain: createChainReader(config),
      runner,
      ip: (request) => ips.get(request) ?? "unknown",
    });
    const server = Bun.serve({
      port: config.port,
      idleTimeout: 0,
      fetch(request, server) {
        // Only the direct peer is trusted; forwarding headers are never an IP authority.
        ips.set(request, server.requestIP(request)?.address ?? "unknown");
        return app.fetch(request);
      },
    });
    let ticking = false;
    const clock = runner
      ? setInterval(async () => {
          if (ticking) return;
          ticking = true;
          try {
            await runner.tick();
          } catch {
            console.error("Episode clock unavailable; pending actions retained.");
          } finally {
            ticking = false;
          }
        }, 50)
      : undefined;
    const shutdown = () => {
      clearInterval(clock);
      server.stop(true);
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
} catch {
  // Never print arbitrary env/parser/RPC errors: they may contain private studio data.
  console.error("Studio startup failed; check environment and committed clip library.");
  process.exitCode = 1;
}
