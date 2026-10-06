import { expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

const address = `0x${"11".repeat(20)}` as const;
const healthyChain = {
  async snapshot() {
    return {
      headNumber: "42",
      headTimestampMs: 95_000,
      balances: [{ role: "operator", address, monWei: "1000000000000000000" }],
    };
  },
};

it("applies the real SQLite schema to an empty DB and enforces chunk references and engines", () => {
  const db = openDatabase(":memory:");
  try {
    expect(() =>
      db
        .query("INSERT INTO chunks VALUES (?, 'X', 0, 0, 10000, '[]', 'leaf', '[]')")
        .run("missing"),
    ).toThrow();
    expect(() =>
      db
        .query("INSERT INTO chunks VALUES (?, 'A', 0, 0, 10000, '[]', 'leaf', '[]')")
        .run("missing"),
    ).toThrow();
  } finally {
    db.close();
  }
});

it("serves the injected authoritative clock", async () => {
  const db = openDatabase(":memory:");
  try {
    const response = await createApp({ db, now: () => 123456, chain: healthyChain }).request(
      "/v1/time",
    );
    expect(await response.json()).toEqual({ serverMs: 123456 });
  } finally {
    db.close();
  }
});

it("reports fresh chain health and no CRE run before the first episode", async () => {
  const db = openDatabase(":memory:");
  try {
    const response = await createApp({ db, now: () => 100_000, chain: healthyChain }).request(
      "/v1/health",
    );
    expect(await response.json()).toEqual({
      status: "ok",
      chain: { headNumber: "42", headTimestampMs: 95000, lagMs: 5000 },
      keyBalances: [{ role: "operator", address, monWei: "1000000000000000000" }],
      lastCreRun: null,
    });
  } finally {
    db.close();
  }
});

it("reports degraded health for stale heads and never exposes RPC error text", async () => {
  const db = openDatabase(":memory:");
  try {
    const stale = await createApp({ db, now: () => 110_001, chain: healthyChain }).request(
      "/v1/health",
    );
    expect(JSON.parse(await stale.text()).status).toBe("degraded");
    const unavailable = await createApp({
      db,
      now: () => 100_000,
      chain: {
        async snapshot() {
          throw new Error("rpc-url-secret");
        },
      },
    }).request("/v1/health");
    const body = await unavailable.text();
    expect(JSON.parse(body).status).toBe("degraded");
    expect(body).not.toContain("rpc-url-secret");
  } finally {
    db.close();
  }
});

it("reports the latest CRE mode and degraded status without exposing stored CRE errors", async () => {
  const db = openDatabase(":memory:");
  try {
    db.query(
      "INSERT INTO clips VALUES ('fixture', 'clip', 'sha', 32090, 'CC0', NULL, '[]', 'a', 'b', 0)",
    ).run();
    db.query(
      "INSERT INTO episodes VALUES (1, 'clip', 'on_demand', 0, 32090, 'Closed', NULL, NULL, NULL)",
    ).run();
    db.query(
      "INSERT INTO cre_runs(id,episode_id,trigger,trigger_tx,mode,status,report_tx,started_ms,finished_ms,error) VALUES (1, 1, 'closed', 'trigger1', 'simulation', 'succeeded', 'report1', 80000, 90000, NULL)",
    ).run();
    db.query(
      "INSERT INTO cre_runs(id,episode_id,trigger,trigger_tx,mode,status,report_tx,started_ms,finished_ms,error) VALUES (2, 1, 'closed', 'trigger2', 'don', 'failed', NULL, 99000, 99500, 'private-subprocess-input')",
    ).run();
    const response = await createApp({ db, now: () => 100000, chain: healthyChain }).request(
      "/v1/health",
    );
    const body = await response.text();
    const health = JSON.parse(body);
    expect(health.status).toBe("degraded");
    expect(health.lastCreRun).toEqual({
      id: 2,
      episode_id: 1,
      trigger: "closed",
      trigger_tx: "trigger2",
      mode: "don",
      status: "failed",
      report_tx: null,
      started_ms: 99000,
      finished_ms: 99500,
    });
    expect(body).not.toContain("private-subprocess-input");
    db.query("UPDATE cre_runs SET status='ambiguous' WHERE id=2").run();
    const ambiguous = await createApp({ db, now: () => 100000, chain: healthyChain }).request(
      "/v1/health",
    );
    expect(await ambiguous.json()).toMatchObject({ status: "degraded" });
  } finally {
    db.close();
  }
});
