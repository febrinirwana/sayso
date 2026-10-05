import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createApp } from "./app.ts";
import { createChainReader } from "./chain.ts";
import { parseConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { loadClipLibrary } from "./library.ts";

try {
  const config = parseConfig(Bun.env);
  const clipDirectory = join(config.dataDir, "clips");
  await mkdir(clipDirectory, { recursive: true });
  const db = openDatabase(join(config.dataDir, "studio.sqlite"));
  try {
    await loadClipLibrary(db, clipDirectory, Date.now);
    const app = createApp({ db, now: Date.now, chain: createChainReader(config) });
    const server = Bun.serve({ port: config.port, fetch: app.fetch });
    const shutdown = () => {
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
