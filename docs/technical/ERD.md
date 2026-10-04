# Data model

Four layers, one truth. The chain owns money and outcomes; Envio and SQLite are read models; transcript files are commitments that become public on schedule.

| Layer | Owner | Holds |
|---|---|---|
| Chain | `SaysoMarkets`, outcome tokens, Kuru books | Episodes, words, collateral, positions, outcomes |
| Envio | `indexer/` | Queryable episodes, trades, positions, profit, leaderboard |
| SQLite | `apps/studio` | Clip library, chunk files, flag plan, scheduled actions, drips, CRE runs |
| Files | `tools/transcribe` output in studio data | Chunk JSON and proofs per engine |

## 1. Chain

Storage structs are defined in `SMART-CONTRACTS.md` section 2. Relationships:

```mermaid
erDiagram
  EPISODE ||--|{ WORD : has
  WORD ||--|| OUTCOME_TOKEN_YES : mints
  WORD ||--|| OUTCOME_TOKEN_NO : mints
  WORD ||--|| KURU_BOOK : "YES/AUSD"
  EPISODE {
    uint32 episodeId
    bytes32 clipId
    bytes32 rootA
    bytes32 rootB
    uint64 startsAt
    uint64 endsAt
  }
  WORD {
    uint256 wordId
    bytes32 text
    uint8 state
    uint256 sets
  }
```

## 2. Envio (GraphQL read model)

```mermaid
erDiagram
  Episode ||--|{ Word : words
  Word ||--o{ Trade : trades
  Player ||--o{ Trade : trades
  Player ||--o{ Position : positions
  Word ||--o{ Position : positions
  Player ||--o{ EpisodePlayer : episodes
  Episode ||--o{ EpisodePlayer : players
```

| Entity | Fields | Written by |
|---|---|---|
| `Episode` | `id` (episodeId), `clipId`, `rootA`, `rootB`, `startsAt`, `endsAt`, `state`, `wordCount`, `resolvedCount`, `closedAt`, `settledAt` | `EpisodeCreated`, `EpisodeClosed`, `EpisodeSettled`, `WordResolved` |
| `Word` | `id` (wordId), `episode`, `text`, `yes`, `no`, `market`, `state`, `offsetMs`, `flaggedAt`, `outcome`, `evidenceHash`, `resolvedAt`, `resolveTx` | `WordAdded`, `WordListed`, `WordFlagged`, `WordResolved`, `WordVoided` |
| `Trade` | `id` (tx hash + log index), `word`, `player`, `side`, `tokenAmount`, `ausdAmount`, `priceBps`, `timestamp`, `block` | `Traded` |
| `Position` | `id` (player + word), `player`, `word`, `yes`, `no`, `cashIn`, `cashOut`, `redeemed` | `Traded`, `SetMinted`, `SetBurned`, `Redeemed`, outcome-token `Transfer` |
| `Player` | `id` (address), `trades`, `volume`, `cashIn`, `cashOut`, `settledValue`, `profit`, `episodesPlayed`, `firstSeen` | derived from the above |
| `EpisodePlayer` | `id` (episode + player), `profit`, `trades`, `rank` | derived when an episode settles |

Outcome-token clones are registered dynamically from `WordAdded` so their `Transfer` events update positions.

**Profit.** `profit = cashIn − cashOut + settledValue`, where `cashOut` is AUSD spent (buys, `mintSet`), `cashIn` is AUSD received (sells, `burnSet`, redemptions), and `settledValue` is unredeemed winning tokens at 1 AUSD and void tokens at 0.5. Unsettled positions are excluded, so the leaderboard never ranks on a price the player cannot realize. The nickname is derived from the address in `packages/core` and never stored.

## 3. Studio SQLite

```sql
CREATE TABLE clips (
  id            TEXT PRIMARY KEY,          -- manifest id
  clip_id       TEXT NOT NULL UNIQUE,      -- 0x bytes32, keccak256(sha256(media) || manifest id)
  media_sha256  TEXT NOT NULL,
  duration_ms   INTEGER NOT NULL,
  licence       TEXT NOT NULL,             -- team-recorded | public-domain | CC0
  source_url    TEXT,
  words_json    TEXT NOT NULL,             -- six words, curator order
  root_a        TEXT NOT NULL,
  root_b        TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE chunks (
  clip_id     TEXT NOT NULL REFERENCES clips(clip_id),
  engine      TEXT NOT NULL CHECK (engine IN ('A','B')),
  idx         INTEGER NOT NULL,
  start_ms    INTEGER NOT NULL,
  end_ms      INTEGER NOT NULL,
  tokens_json TEXT NOT NULL,               -- canonical [["word",start,end],...]
  leaf        TEXT NOT NULL,
  proof_json  TEXT NOT NULL,
  PRIMARY KEY (clip_id, engine, idx)
);

CREATE TABLE flag_plan (                   -- agreed spoken words, computed offline
  clip_id  TEXT NOT NULL REFERENCES clips(clip_id),
  word     TEXT NOT NULL,
  t_ms     INTEGER NOT NULL,
  chunk_a  INTEGER NOT NULL,
  chunk_b  INTEGER NOT NULL,
  PRIMARY KEY (clip_id, word)
);

CREATE TABLE episodes (
  id           INTEGER PRIMARY KEY,        -- onchain episodeId
  clip_id      TEXT NOT NULL REFERENCES clips(clip_id),
  origin       TEXT NOT NULL CHECK (origin IN ('hourly','on_demand')),
  starts_at_ms INTEGER NOT NULL,
  ends_at_ms   INTEGER NOT NULL,
  state        TEXT NOT NULL,
  create_tx    TEXT, list_tx TEXT, close_tx TEXT
);

CREATE TABLE actions (                     -- every scheduled studio transaction
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

CREATE TABLE house_orders (
  market     TEXT NOT NULL,
  order_id   INTEGER NOT NULL,
  episode_id INTEGER NOT NULL,
  side       TEXT NOT NULL CHECK (side IN ('bid','ask')),
  price      INTEGER NOT NULL,
  size       TEXT NOT NULL,
  status     TEXT NOT NULL,
  PRIMARY KEY (market, order_id)
);

CREATE TABLE drips (
  address  TEXT PRIMARY KEY,
  mon_wei  TEXT NOT NULL,
  ausd     TEXT NOT NULL,
  tx_mon   TEXT, tx_ausd TEXT,
  ip_hash  TEXT NOT NULL,
  at       INTEGER NOT NULL
);

CREATE TABLE cre_runs (
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
```

Clip manifests and transcripts are studio data, not tracked files: a public word list with its transcript would reveal outcomes before trading. The repo tracks one fixture clip under `clips/fixtures/` for tests.

## 4. Files and payloads

**Chunk payload** (reveal API and CRE input):

```json
{
  "clipId": "0x…",
  "engine": "A",
  "index": 7,
  "startMs": 70000,
  "endMs": 80000,
  "tokens": [["monad", 71240, 71690], ["is", 71690, 71800]],
  "leaf": "0x…",
  "proof": ["0x…", "0x…"]
}
```

**CRE report:** `abi.encode(uint32 episodeId, uint256[] wordIds, uint8[] outcomes, bytes32 evidenceHash)`; outcome `2` = Yes, `3` = No (matching `WordState`); `evidenceHash = keccak256` of the concatenated leaves the workflow verified.
