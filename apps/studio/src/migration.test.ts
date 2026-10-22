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

it("migrates the live address-keyed journal without losing quota or signed recovery bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sayso-live-drips-"));
  const path = join(directory, "studio.sqlite");
  const old = openDatabase(path);
  old.exec(`DROP TABLE drips;
    CREATE TABLE drips(address TEXT PRIMARY KEY,mon_wei TEXT NOT NULL,ausd TEXT NOT NULL,
      tx_mon TEXT,tx_ausd TEXT,ip_hash TEXT NOT NULL,at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',raw_mon TEXT,raw_ausd TEXT,
      status_mon TEXT NOT NULL DEFAULT 'confirmed',status_ausd TEXT NOT NULL DEFAULT 'confirmed',
      block_mon INTEGER,block_ausd INTEGER);
    INSERT INTO drips VALUES ('first','500','10','m1','a1','shared-ip',123,'completed',
      'raw-m1','raw-a1','confirmed','confirmed',11,12);
    INSERT INTO drips VALUES ('second','500','10','m2','a2','shared-ip',456,'pending',
      'raw-m2','raw-a2','confirmed','signed',13,NULL);`);
  const before = old.query("SELECT * FROM drips ORDER BY at").all();
  old.close();
  for (let reopen = 0; reopen < 2; reopen++) {
    const db = openDatabase(path);
    try {
      const rows = db.query<Record<string, unknown>, []>("SELECT * FROM drips ORDER BY at").all();
      expect(rows.map(({ id, ...row }) => row)).toEqual(before);
      expect(rows.map((row) => row.id)).toEqual([1, 2]);
      expect(
        db.query("SELECT count(*) AS n FROM drips WHERE ip_hash='shared-ip' AND at>0").get(),
      ).toEqual({ n: 2 });
      db.query(
        "INSERT INTO drips(address,mon_wei,ausd,ip_hash,at) VALUES('first','500','10','other',789)",
      ).run();
      db.query("DELETE FROM drips WHERE at=789").run();
    } finally {
      db.close();
    }
  }
  await rm(directory, { recursive: true, force: true });
});
