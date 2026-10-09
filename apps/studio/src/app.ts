import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { Address } from "viem";
import { DEFAULT_WEB_ORIGINS } from "./config.ts";
import { DripError, type DripService } from "./drip.ts";
import { EpisodeError, type EpisodeRunner } from "./runner.ts";

export type ChainSnapshot = {
  headNumber: string;
  headTimestampMs: number;
  balances: { role: string; address: Address; monWei: string }[];
};
export type ChainReader = { snapshot(): Promise<ChainSnapshot> };
export type AppDeps = {
  db: Database;
  now(): number;
  chain: ChainReader;
  runner?: EpisodeRunner | undefined;
  drip?: DripService | undefined;
  webOrigins?: readonly string[] | undefined;
  ip?(request: Request): string;
};
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

export function createApp({
  db,
  now,
  chain,
  runner,
  drip,
  ip,
  webOrigins = DEFAULT_WEB_ORIGINS,
}: AppDeps) {
  const app = new Hono<{ Variables: { clientIp: string } }>();
  app.use(
    "/v1/*",
    cors({
      origin: (origin) => (webOrigins.includes(origin) ? origin : undefined),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );
  app.post(
    "/v1/drips",
    (context, next) => {
      // bodyLimit can replace req.raw when buffering a streamed body.
      context.set("clientIp", ip?.(context.req.raw) ?? "unknown");
      return next();
    },
    bodyLimit({ maxSize: 256 }),
    async (context) => {
      if (!drip) return context.json({ error: "unavailable", network: "TESTNET" }, 503);
      const body: unknown = await context.req.json().catch(() => null);
      if (
        !body ||
        typeof body !== "object" ||
        !("address" in body) ||
        typeof body.address !== "string"
      )
        return context.json({ error: "invalid_address", network: "TESTNET" }, 400);
      try {
        return context.json(await drip.claim(body.address, context.get("clientIp")), 201);
      } catch (error) {
        return context.json(
          { error: error instanceof DripError ? error.code : "unavailable", network: "TESTNET" },
          error instanceof DripError ? error.httpStatus : 503,
        );
      }
    },
  );
  app.get("/v1/drips/:address", (context) => {
    if (!drip) return context.json({ error: "unavailable", network: "TESTNET" }, 503);
    try {
      const status = drip.status(context.req.param("address"));
      return status ? context.json(status) : context.body(null, 404);
    } catch (error) {
      return context.json(
        { error: error instanceof DripError ? error.code : "unavailable", network: "TESTNET" },
        error instanceof DripError ? error.httpStatus : 503,
      );
    }
  });
  app.post("/v1/episodes", async (context) => {
    if (!runner) return context.body(null, 503);
    try {
      const episodeId = await runner.request("on_demand", ip?.(context.req.raw) ?? "unknown");
      return context.json({ episodeId }, 201);
    } catch (error) {
      return context.body(null, error instanceof EpisodeError ? error.status : 503);
    }
  });
  app.get("/v1/episodes/:id/stream", (context) => {
    const id = Number(context.req.param("id"));
    if (
      !runner ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !db.query("SELECT id FROM episodes WHERE id = ?").get(id)
    )
      return context.body(null, 404);
    const response = streamSSE(context, async (stream) => {
      const aborted = Promise.withResolvers<void>();
      let writes: Promise<unknown> = Promise.resolve();
      const unsubscribe = runner.subscribe(id, (event) => {
        writes = writes
          .then(() => stream.writeSSE({ event: event.event, data: JSON.stringify(event.data) }))
          .catch(() => aborted.resolve());
      });
      stream.onAbort(() => aborted.resolve());
      await aborted.promise;
      unsubscribe?.();
    });
    // Finalize through Hono before overriding streamSSE's no-cache default.
    // CORS creates a context response whose headers otherwise win during merging.
    context.res = response;
    context.header("Cache-Control", "no-store");
    return context.res;
  });
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
        (lastCreRun !== null && ["failed", "ambiguous"].includes(lastCreRun.status));
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
