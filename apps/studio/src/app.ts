import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import type { Address } from "viem";

export type ChainSnapshot = {
  headNumber: string;
  headTimestampMs: number;
  balances: { role: string; address: Address; monWei: string }[];
};
export type ChainReader = { snapshot(): Promise<ChainSnapshot> };
export type AppDeps = { db: Database; now(): number; chain: ChainReader };
type CreRun = {
  id: number;
  episode_id: number;
  trigger: string;
  trigger_tx: string;
  mode: "simulation" | "don";
  status: string;
  report_tx: string | null;
  started_ms: number;
  finished_ms: number | null;
};
type RevealRow = {
  clip_id: string;
  starts_at_ms: number;
  state: string;
  engine: "A" | "B";
  idx: number;
  start_ms: number;
  end_ms: number;
  tokens_json: string;
  leaf: string;
  proof_json: string;
};

export function createApp({ db, now, chain }: AppDeps) {
  const app = new Hono();
  app.get("/v1/time", (context) => context.json({ serverMs: now() }));
  app.get("/v1/health", async (context) => {
    // Exclude error text: upstream errors can contain RPC credentials or subprocess inputs.
    const lastCreRun = db
      .query<CreRun, []>(`SELECT id, episode_id, trigger, trigger_tx, mode, status,
      report_tx, started_ms, finished_ms FROM cre_runs ORDER BY started_ms DESC, id DESC LIMIT 1`)
      .get();
    try {
      const snapshot = await chain.snapshot();
      const lagMs = Math.max(0, now() - snapshot.headTimestampMs);
      const degraded =
        lagMs > 10_000 ||
        snapshot.balances.some((balance) => BigInt(balance.monWei) === 0n) ||
        lastCreRun?.status === "failed";
      return context.json({
        status: degraded ? "degraded" : "ok",
        chain: {
          headNumber: snapshot.headNumber,
          headTimestampMs: snapshot.headTimestampMs,
          lagMs,
        },
        keyBalances: snapshot.balances,
        lastCreRun,
      });
    } catch {
      return context.json({ status: "degraded", chain: null, keyBalances: [], lastCreRun });
    }
  });
  app.get("/v1/episodes/:id/chunks/:engine/:index", (context) => {
    context.header("Cache-Control", "no-store");
    const { id, engine, index } = context.req.param();
    if (
      !/^[1-9]\d*$/.test(id) ||
      !/^(0|[1-9]\d*)$/.test(index) ||
      !Number.isSafeInteger(Number(id)) ||
      !Number.isSafeInteger(Number(index)) ||
      (engine !== "A" && engine !== "B")
    )
      return context.body(null, 404);
    const chunk = db
      .query<RevealRow, [number, string, number]>(`SELECT e.starts_at_ms, e.state,
      c.clip_id, c.engine, c.idx, c.start_ms, c.end_ms, c.tokens_json, c.leaf, c.proof_json
      FROM episodes e JOIN chunks c ON c.clip_id = e.clip_id
      WHERE e.id = ? AND c.engine = ? AND c.idx = ?`)
      .get(Number(id), engine, Number(index));
    if (!chunk) return context.body(null, 404);
    if (
      chunk.state !== "Closed" &&
      chunk.state !== "Settled" &&
      now() < chunk.starts_at_ms + chunk.end_ms + 2_000
    )
      return context.body(null, 425);
    return context.json({
      clipId: chunk.clip_id,
      engine: chunk.engine,
      index: chunk.idx,
      startMs: chunk.start_ms,
      endMs: chunk.end_ms,
      tokens: JSON.parse(chunk.tokens_json),
      leaf: chunk.leaf,
      proof: JSON.parse(chunk.proof_json),
    });
  });
  return app;
}
