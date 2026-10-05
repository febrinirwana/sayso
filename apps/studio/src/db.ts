import { Database } from "bun:sqlite";

// ERD section 3 is authoritative. IF NOT EXISTS makes opening a read model idempotent.
const schema = `
CREATE TABLE IF NOT EXISTS clips (
  id            TEXT PRIMARY KEY,
  clip_id       TEXT NOT NULL UNIQUE,
  media_sha256  TEXT NOT NULL,
  duration_ms   INTEGER NOT NULL,
  licence       TEXT NOT NULL,
  source_url    TEXT,
  words_json    TEXT NOT NULL,
  root_a        TEXT NOT NULL,
  root_b        TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  clip_id     TEXT NOT NULL REFERENCES clips(clip_id),
  engine      TEXT NOT NULL CHECK (engine IN ('A','B')),
  idx         INTEGER NOT NULL,
  start_ms    INTEGER NOT NULL,
  end_ms      INTEGER NOT NULL,
  tokens_json TEXT NOT NULL,
  leaf        TEXT NOT NULL,
  proof_json  TEXT NOT NULL,
  PRIMARY KEY (clip_id, engine, idx)
);
CREATE TABLE IF NOT EXISTS flag_plan (
  clip_id  TEXT NOT NULL REFERENCES clips(clip_id),
  word     TEXT NOT NULL,
  t_ms     INTEGER NOT NULL,
  chunk_a  INTEGER NOT NULL,
  chunk_b  INTEGER NOT NULL,
  PRIMARY KEY (clip_id, word)
);
CREATE TABLE IF NOT EXISTS episodes (
  id           INTEGER PRIMARY KEY,
  clip_id      TEXT NOT NULL REFERENCES clips(clip_id),
  origin       TEXT NOT NULL CHECK (origin IN ('hourly','on_demand')),
  starts_at_ms INTEGER NOT NULL,
  ends_at_ms   INTEGER NOT NULL,
  state        TEXT NOT NULL,
  create_tx    TEXT, list_tx TEXT, close_tx TEXT
);
CREATE TABLE IF NOT EXISTS actions (
  id           INTEGER PRIMARY KEY,
  episode_id   INTEGER NOT NULL REFERENCES episodes(id),
  kind         TEXT NOT NULL CHECK (kind IN ('seed','pull','bid','flag','evidence','close','redeem')),
  word_id      INTEGER,
  scheduled_ms INTEGER NOT NULL,
  sent_ms      INTEGER,
  tx_hash      TEXT,
  block        INTEGER,
  status       TEXT NOT NULL DEFAULT 'pending',
  error        TEXT
);
CREATE TABLE IF NOT EXISTS house_orders (
  market     TEXT NOT NULL,
  order_id   INTEGER NOT NULL,
  episode_id INTEGER NOT NULL,
  side       TEXT NOT NULL CHECK (side IN ('bid','ask')),
  price      INTEGER NOT NULL,
  size       TEXT NOT NULL,
  status     TEXT NOT NULL,
  PRIMARY KEY (market, order_id)
);
CREATE TABLE IF NOT EXISTS drips (
  address  TEXT PRIMARY KEY,
  mon_wei  TEXT NOT NULL,
  ausd     TEXT NOT NULL,
  tx_mon   TEXT, tx_ausd TEXT,
  ip_hash  TEXT NOT NULL,
  at       INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cre_runs (
  id          INTEGER PRIMARY KEY,
  episode_id  INTEGER NOT NULL REFERENCES episodes(id),
  trigger     TEXT NOT NULL CHECK (trigger IN ('evidence','closed')),
  trigger_tx  TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('simulation','don')),
  status      TEXT NOT NULL,
  report_tx   TEXT,
  started_ms  INTEGER NOT NULL,
  finished_ms INTEGER,
  error       TEXT
);
`;

export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    db.transaction(() => db.exec(schema))();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
