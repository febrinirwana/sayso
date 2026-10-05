import { expect, it } from "vitest";
import { openDatabase } from "./db.ts";
import { type Command, type EpisodeChain, EpisodeRunner, type Prepared } from "./runner.ts";

it("waits for a chain timestamp at endsAt instead of sending a close that must revert", async () => {
  const db = openDatabase(":memory:");
  db.query("INSERT INTO clips VALUES ('clip','clip','sha',1000,'CC0',NULL,'[]','a','b',0)").run();
  db.query(
    "INSERT INTO episodes VALUES (1,'clip','on_demand',100000,103000,'Live',NULL,NULL,NULL)",
  ).run();
  db.query("INSERT INTO actions (episode_id,kind,scheduled_ms) VALUES (1,'close',103000)").run();
  let timestamp = 102;
  const sent: Command[] = [];
  const chain: EpisodeChain = {
    async episode() {
      return {
        listed: true,
        closed: sent.length > 0,
        resolvedCount: 0,
        wordCount: 6,
        startsAt: 100,
        endsAt: 103,
        timestamp,
      };
    },
    async words() {
      return [];
    },
    async word() {
      return { state: 0 };
    },
    async receipt() {
      return null;
    },
    async prepare(command) {
      sent.push(command);
      return { hash: "0x01", raw: "0x01" };
    },
    async broadcast(tx: Prepared) {
      return { hash: tx.hash, block: 1, success: true };
    },
  };
  const runner = new EpisodeRunner({ db, now: () => 103000, chain, log: () => {} });
  try {
    await runner.tick();
    expect(sent).toEqual([]);
    timestamp = 103;
    await runner.tick();
    expect(sent.map((command) => command.kind)).toEqual(["closeEpisode"]);
    expect(db.query("SELECT state FROM episodes").get()).toEqual({ state: "Closed" });
  } finally {
    db.close();
  }
});

it("skips a missed Open flag after restart beyond endsAt and still closes after playback delay", async () => {
  const db = openDatabase(":memory:");
  db.query("INSERT INTO clips VALUES ('clip','clip','sha',1000,'CC0',NULL,'[]','a','b',0)").run();
  db.query(
    "INSERT INTO episodes VALUES (1,'clip','on_demand',100000,103000,'Live',NULL,NULL,NULL)",
  ).run();
  db.query(`INSERT INTO actions (episode_id,kind,word_id,scheduled_ms,payload_json)
    VALUES (1,'flag',1,102900,'{"t":2900,"chunkA":0,"chunkB":0}')`).run();
  db.query(`INSERT INTO actions (episode_id,kind,scheduled_ms,payload_json)
    VALUES (1,'evidence',112000,'{"wordIds":[1]}')`).run();
  db.query("INSERT INTO actions (episode_id,kind,scheduled_ms) VALUES (1,'close',105000)").run();
  let now = 104999;
  let closed = false;
  const sent: Command[] = [];
  const chain: EpisodeChain = {
    async episode() {
      return {
        listed: true,
        closed,
        resolvedCount: 0,
        wordCount: 6,
        startsAt: 100,
        endsAt: 103,
        timestamp: Math.floor(now / 1000),
      };
    },
    async words() {
      return [1];
    },
    async word() {
      return { state: 0 };
    },
    async receipt() {
      return null;
    },
    async prepare(command) {
      sent.push(command);
      return { hash: "0x01", raw: "0x01" };
    },
    async broadcast(tx: Prepared) {
      closed = true;
      return { hash: tx.hash, block: 1, success: true };
    },
  };
  const runner = new EpisodeRunner({ db, now: () => now, chain, log: () => {} });
  try {
    await runner.tick();
    expect(sent).toEqual([]);
    expect(db.query("SELECT status FROM actions WHERE kind = 'flag'").get()).toEqual({
      status: "observed",
    });
    now = 105000;
    await runner.tick();
    expect(sent.map((command) => command.kind)).toEqual(["closeEpisode"]);
    now = 112000;
    await runner.tick();
    expect(sent.map((command) => command.kind)).toEqual(["closeEpisode"]);
    expect(db.query("SELECT state FROM episodes").get()).toEqual({ state: "Closed" });
  } finally {
    db.close();
  }
});
