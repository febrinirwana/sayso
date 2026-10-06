import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openDatabase } from "./db.ts";

it("preserves scheduled actions when migrating the committed schema to durable runner payloads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sayso-migration-"));
  const path = join(directory, "studio.sqlite");
  const old = openDatabase(path);
  old.exec(`INSERT INTO clips VALUES ('clip','clip','sha',1000,'CC0',NULL,'[]','a','b',0);
    INSERT INTO episodes VALUES (1,'clip','on_demand',100000,103000,'Live',NULL,NULL,NULL);
    DROP TABLE actions;
    CREATE TABLE actions (id INTEGER PRIMARY KEY, episode_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('seed','pull','bid','flag','evidence','close','redeem')),
    word_id INTEGER, scheduled_ms INTEGER NOT NULL, sent_ms INTEGER, tx_hash TEXT,
    block INTEGER, status TEXT NOT NULL DEFAULT 'pending', error TEXT);
    INSERT INTO actions VALUES (7,1,'flag',2,167090,NULL,NULL,NULL,'pending',NULL);`);
  old.close();
  const db = openDatabase(path);
  try {
    expect(
      db.query("SELECT id,word_id,scheduled_ms,status,payload_json FROM actions").get(),
    ).toEqual({ id: 7, word_id: 2, scheduled_ms: 167090, status: "pending", payload_json: "{}" });
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("keeps legacy drip awards completed and preserves a pending signed leg across reopening", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sayso-award-migration-"));
  const path = join(directory, "studio.sqlite");
  const old = openDatabase(path);
  old.exec(`DROP TABLE drips;
    CREATE TABLE drips(address TEXT PRIMARY KEY,mon_wei TEXT NOT NULL,ausd TEXT NOT NULL,
      tx_mon TEXT,tx_ausd TEXT,ip_hash TEXT NOT NULL,at INTEGER NOT NULL);
    INSERT INTO drips VALUES ('0xAbC','500000000000000000','10000000','mon-old','ausd-old','ip',7);`);
  old.close();
  const migrated = openDatabase(path);
  try {
    expect(
      migrated
        .query("SELECT address,status,status_mon,status_ausd,tx_mon,tx_ausd FROM drips")
        .get(),
    ).toEqual({
      address: "0xAbC",
      status: "completed",
      status_mon: "confirmed",
      status_ausd: "confirmed",
      tx_mon: "mon-old",
      tx_ausd: "ausd-old",
    });
    migrated.exec(`UPDATE drips SET status='pending',status_ausd='sent',
      raw_ausd='signed-leg',tx_ausd='pending-hash',block_mon=11;`);
  } finally {
    migrated.close();
  }
  const resumed = openDatabase(path);
  try {
    expect(
      resumed
        .query("SELECT status,status_mon,status_ausd,raw_ausd,tx_ausd,block_mon FROM drips")
        .get(),
    ).toEqual({
      status: "pending",
      status_mon: "confirmed",
      status_ausd: "sent",
      raw_ausd: "signed-leg",
      tx_ausd: "pending-hash",
      block_mon: 11,
    });
  } finally {
    resumed.close();
    await rm(directory, { recursive: true, force: true });
  }
});
