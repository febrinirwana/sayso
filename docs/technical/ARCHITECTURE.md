# Architecture

How SAYSO is built: components, boundaries, flows, the transcript commitment, the trust model, the pinned stack and how it runs. Product rules live in `docs/PRD.md`; external interfaces in `INTEGRATIONS.md`; contract surface in `SMART-CONTRACTS.md`; schemas in `ERD.md`.

Labels: **[V]** verified with source, **[I]** inference, **[U]** unverified with the settling spike.

## 1. Shape

```mermaid
flowchart LR
  subgraph Phone[PWA on a phone]
    WEB[apps/web: Vite + TanStack Router SPA, Mera, viem]
  end
  subgraph VPS[VPS, always on]
    STU[apps/studio: Bun + Hono + SQLite]
    STU --- SCH[scheduler]
    STU --- RUN[episode runner + clock]
    STU --- MM[house market maker]
    STU --- DRP[starter drip]
    STU --- REV[transcript reveal API]
    STU --- CRR[CRE runner, simulation mode]
  end
  subgraph Monad[Monad testnet 10143]
    SM[SaysoMarkets + OutcomeToken clones]
    KU[Kuru YES/AUSD books]
  end
  CRE[Chainlink CRE resolver workflow]
  ENV[Envio HyperIndex]

  WEB -->|trade, mint, redeem| SM
  SM -->|IOC orders| KU
  MM -->|flip ladders, pulls, 0.98 bid| KU
  RUN -->|create, flag, close| SM
  CRE -->|reads roots| SM
  CRE -->|fetches revealed chunks| REV
  CRE -->|finalize via forwarder| SM
  SM --> ENV
  KU --> ENV
  ENV -->|positions, feed, leaderboard| WEB
  STU -->|SSE clock + flags| WEB
```

Chain is truth. Envio and SQLite are read models; nothing a player owns lives only off chain.

## 2. Repo layout

Status column: **built** means tracked code exists today; a phase number means the folder arrives in that BUILD-PLAN phase.

```
packages/core/       built     Pure TypeScript shared by web, studio and CRE. No I/O, no React.
  src/               built       match, transcript, merkle, units, nickname, addresses, explorer;
                                 one *.test.ts beside each module; index.ts is the only entry
  abi/               built       vendored Kuru ABIs (kuru.ts) + SOURCE.md; sayso.ts generated from forge artifacts
  scripts/           built       vendor-kuru-abi, export-merkle-vectors, check-addresses
contracts/           built     Foundry (Soldeer deps): unit, fork (MONAD_FORK=1) and Merkle vector tests;
                               src/ SaysoMarkets, OutcomeToken, KuruTrade, vendor/chainlink; script/Deploy.s.sol
tools/transcribe/    built     Offline pipeline: two engines -> chunks -> roots -> flag plan (Bun CLI + vosk/ uv project)
clips/fixtures/      built     One tracked fixture clip (manifest + chunks, no media) for tests;
                               real clips, manifests and transcripts stay untracked studio data
cre/resolver/        built     CRE TypeScript workflow: log triggers, HTTP fetch, proof checks, report
apps/studio/         phase 5   Bun + Hono: scheduler, runner, market maker, drip, reveal API, CRE runner
indexer/             phase 6   Envio HyperIndex config, schema, handlers
apps/web/            phase 7   PWA: screens, Mera session, signing, tx sequencing
deploy/              phase 5   systemd unit and Caddy config
docs/                built     PRD, LESSONS; technical/ ARCHITECTURE, BUILD-PLAN, SMART-CONTRACTS,
                               ERD, INTEGRATIONS
.claude/skills/      built     Vendored + project skills (skills-lock.json pins sources)
```

Bun workspaces: `apps/*`, `packages/*`, `cre/*`, `tools/*`; `indexer` joins in phase 6 (Bun rejects a workspace path that does not exist yet).

## 3. Components and boundaries

| Component | Owns | Never does |
|---|---|---|
| `apps/web` | Screens, Mera passkey session, signing, transaction sequencing by block, SSE subscription | Hold a key outside the Mera session; compute settlement |
| `apps/studio` | Episode schedule, playback clock, flags, house quotes, starter drip, chunk reveal, simulation-mode CRE runs, health | Sign for a player; finalize a word; reveal a chunk before its reveal time (section 6) |
| `packages/core` | `normalizeToken`, `matchesTarget`, `agreedSpokenTime`, `chunkTranscript`, `leafHash`, `merkleRoot`, `merkleProof`, `nicknameOf`, price/size conversions, gas table, ABIs | Network, clocks, randomness |
| `contracts` | Collateral, outcome tokens, episode and word state, trade entry points, CRE receiver | Store transcripts; trust the studio for outcomes |
| `cre/resolver` | Proof verification, matcher run, outcome report | Hold player funds; read anything but the roots and revealed chunks |
| `indexer` | Episodes, words, trades, positions, profit, leaderboard | Feed back into settlement |
| `tools/transcribe` | Two independent transcripts per clip, chunk files, roots | Run in production request paths |

Three studio keys, each its own nonce stream: **OPERATOR** (create, flag, close), **BOT** (Kuru quotes), **DRIP** (starter balances). Separate senders keep one stream's pending transaction from delaying another under Monad's reserve-balance rule [V: [reserve balance](https://docs.monad.xyz/developer-essentials/reserve-balance)].

## 4. State machines

```mermaid
stateDiagram-v2
  [*] --> Scheduled: createEpisode (roots committed)
  Scheduled --> Live: block.timestamp >= startsAt
  Live --> Closed: closeEpisode (after clip end)
  Closed --> Settled: every word resolved
  Settled --> [*]
```

```mermaid
stateDiagram-v2
  [*] --> Open
  Open --> SaidPending: flagSaid (OPERATOR)
  SaidPending --> Yes: CRE report YES
  Open --> Yes: CRE report YES after close (flag missed)
  Open --> No: CRE report NO after close
  SaidPending --> No: CRE report NO (false flag)
  Open --> Void: owner, 24 h after close, no report
  SaidPending --> Void: owner, 24 h after close, no report
```

A word is tradable while its episode is Scheduled or Live and the word is Open or SaidPending. Set minting stops at Closed. Void redeems YES and NO at 0.5 AUSD each.

## 5. Flows

### 5.1 Create an episode

1. Studio picks the next clip (on-demand request or the hourly slot), loads its two chunk sets and roots from SQLite.
2. OPERATOR calls `createEpisode(clipId, rootA, rootB, startsAt, endsAt, words)`, which clones YES and NO tokens per word, then `listEpisode(episodeId)`, which deploys one Kuru YES/AUSD market per word through `Router.deployProxy` type 0.
3. BOT mints complete sets for inventory and provisions a flip ladder around 0.50 on each book with `batchProvisionLiquidity`.
4. Studio pushes the schedule over SSE; web shows the countdown.

### 5.2 Trade

All player trades go through `SaysoMarkets`, so one AUSD approval (or ERC-2612 permit) covers every word, and the contract emits one `Traded` event per fill for exact profit accounting.

- **Buy YES:** pull AUSD, `placeAndExecuteMarketBuy` on the word's book (IOC), send YES to the player.
- **Sell YES / cash out:** pull YES (the contract is the token's trusted spender), `placeAndExecuteMarketSell`, send AUSD.
- **Buy NO:** mint `n` sets against pooled collateral, sell all `n` YES (a partial fill reverts), send `n` NO, then pull only `n − proceeds` AUSD from the player.
- **Sell NO:** buy at least `n` YES with pooled collateral, sized by walking the book's asks, burn `n` sets, pay `n − cost`, return rounding dust YES; the collateral invariant (`AUSD balance >= totalSets`) is checked at the end of the call.

Kuru's non-margin settlement for a contract caller is verified on a fork (the contract approves the book only; fills move wallet to wallet); the live testnet run is still open [`INTEGRATIONS.md` section 2, S2+S3]. Exact rules are in `SMART-CONTRACTS.md` sections 3 and 6.

### 5.3 SAID flag (instant)

1. The studio knows every agreed spoken timestamp `t` in advance (replay clips, section 6).
2. At `t − 400 ms`, BOT sends `batchCancelFlipOrders` for that word, then posts the 0.98 bid sized to players' outstanding YES.
3. At `t`, OPERATOR sends `flagSaid(wordId, chunkIndexA, chunkIndexB, offsetMs)`.
4. Phones receive the `WordFlagged` log or the SSE echo, whichever lands first, and flip the card at the player's presentation time `t + 1.5 s`, so the flip lands on the spoken word.

Players watch with a fixed 1.5 s presentation delay behind the studio clock. The pull lands one block before the flag, and both land before any player hears the word. One-block inclusion is about 300 ms [V: [current facts](https://docs.monad.xyz/ai/current-facts.md)]. Players only send immediate-or-cancel orders, so after the pull no ask rests on that book for an early chain-watcher to lift.

### 5.4 Settlement (CRE)

- **YES path.** At each chunk boundary, OPERATOR batches `markEvidence(episodeId, wordIds)` for flagged words whose chunks are now revealed. The `EvidenceReady` log triggers the workflow: it reads both roots from the contract, fetches the revealed chunks for each engine, verifies every proof, runs `agreedSpokenTime` on the verified tokens, and reports `(episodeId, wordIds, outcomes, evidenceHash)`. YES finality is therefore at most one chunk (10 s) plus the reveal margin plus CRE latency after the word.
- **NO path.** `EpisodeClosed` triggers the workflow. With every chunk revealed, it verifies both complete chunk sets against the roots, runs the matcher over the full transcript for each unresolved word, and reports all outcomes in one report.
- The report reaches `SaysoMarkets.onReport` only through the configured forwarder; the contract also checks the expected workflow ID.

Until deploy access is granted, the studio CRE runner invokes `cre workflow simulate --broadcast` for each trigger; reports then arrive through the simulation forwarder. Each settlement records its mode (`don` or `simulation`) and the README reports which mode produced it.

### 5.5 Redeem

After a word settles, the winning token redeems 1 AUSD per unit; the losing token redeems nothing; Void pays 0.5 per unit on both sides. BOT redeems house inventory after every episode to recycle AUSD.

## 6. Transcript commitment

The outcome of every word is fixed before the first trade and provable afterwards.

1. `tools/transcribe` runs two independent engines on the clip: whisper.cpp (engine A) and Vosk (engine B). Both emit word-level timestamps.
2. Tokens are normalized by `packages/core` (`normalizeToken`) into `[word, startMs, endMs]`, where both times are non-negative safe integers with `startMs <= endMs`; anything else is refused before hashing, because JSON would turn `NaN` or `Infinity` into `null`.
3. Tokens are grouped into 10,000 ms chunks by start time. Chunk `i` covers `[10000·i, 10000·(i+1))`. Every index from 0 to `ceil(duration / 10,000) − 1` exists, empty chunks included, so the NO path can prove a complete set.
4. `leaf = keccak256(abi.encode(clipId, engine, index, startMs, endMs, tokensHash))`; ABI types are `(bytes32 clipId, uint8 engine (A = 0, B = 1), uint32 index, uint64 startMs, uint64 endMs, bytes32 tokensHash)`. `tokensHash` is keccak256 of UTF-8 canonical JSON `[["word",start,end],...]` with no whitespace.
5. Each engine's leaves stay in chunk order and form a Merkle tree with commutative keccak pair hashing, the same scheme as OpenZeppelin `MerkleProof`; an odd node is promoted unchanged. `rootA` and `rootB` go onchain in `createEpisode`.
6. `clipId = keccak256(sha256(media file) ‖ manifestId)`: the raw 32-byte digest followed by the UTF-8 manifest id (`encodePacked(bytes32, string)`), not the digest's hex text. Anyone holding the media can rerun the pinned engines and audit both transcripts.
7. **Reveal schedule.** The reveal API serves chunk `i` with its proof only after studio time passes `startsAt + chunkEnd + 2,000 ms` (presentation delay plus margin). After `closeEpisode`, every chunk is public.

Agreement rule: a word is said when both engines contain a matching token whose start times differ by at most 1,500 ms. The agreed spoken timestamp `t` is the earlier start. The flag schedule is computed offline from this rule.

## 7. Clock and playback

- Studio time is authoritative. `GET /v1/time` returns server milliseconds; the web estimates its offset from five pings and keeps the lowest round trip.
- The player computes `position = now + offset − startsAt − 1,500 ms` and seeks there. Drift above 250 ms is corrected with small `playbackRate` changes; scrubbing is disabled.
- Media is a progressive MP4 served with range requests from the VPS.

## 8. Trust model

| Actor | Can | Cannot |
|---|---|---|
| OPERATOR | Choose clip and words (committed before trading), flag, mark evidence, close, stop quoting | Change a transcript after commit, finalize a word, touch collateral |
| Owner | Set forwarder, expected workflow ID and report origin (simulation to production), void a word 24 h after close with no report, pause new episodes | Withdraw collateral, finalize a word |
| CRE | Report outcomes through the forwarder | Report for a different workflow ID |
| REPORTER key | In simulation mode, send the simulator's report transaction; `SaysoMarkets` accepts simulation-forwarder reports only when `tx.origin` is this key | Settle anything in DON mode (`reportOrigin` is zero) |
| Studio service | Reveal chunks on schedule, drip starter balances | Sign for a player |

In simulation mode, CRE runs on a single local node and the HTTP fetch is single-node consensus [V: [HTTP capability](https://docs.chain.link/cre/capabilities/http)]. The simulation forwarder verifies no signatures, so the REPORTER gate is the only thing stopping a forged report; trust in that mode rests on the studio host that holds REPORTER (SMART-CONTRACTS section 7). Deployed workflows run BFT consensus across a DON. The README states the mode of each settlement.

## 9. Tech stack

Versions are the latest stable releases checked on 2026-10-05 (`npm view`, GitHub releases). Pin exact versions in `package.json` and `foundry.toml`; upgrade deliberately.

| Layer | Choice | Version |
|---|---|---|
| Runtime, installs | Bun | 1.3.14 |
| Vite and Vitest runtime | Node | 24.21.0 |
| Language | TypeScript | 7.0.2 |
| UI | React | 19.3.0 |
| Build | Vite, `@vitejs/plugin-react` | 8.3.2, 6.1.1 |
| Routing | `@tanstack/react-router`, `@tanstack/router-plugin` | 1.170.41, 1.168.42 |
| Server state | `@tanstack/react-query` | 5.104.1 |
| Client state | zustand | 5.0.15 |
| Styling | Tailwind CSS | 4.3.3 |
| Motion | motion | 14.0.0 |
| PWA | vite-plugin-pwa | 2.0.0 |
| Validation | zod | 4.6.5 |
| Chain I/O | viem | 2.57.2 |
| Accounts | `@category-labs/mera`, `@scure/bip32`, `@scure/bip39` | 0.2.0, 2.4.0, 2.4.0 |
| Studio API | Hono on Bun, `bun:sqlite` | 4.13.13 |
| Contracts | Foundry, Solidity, OpenZeppelin Contracts | 1.8.4, 0.8.37, 5.7.0 |
| Settlement | CRE CLI, `@chainlink/cre-sdk` | 1.36.0, 1.23.0 |
| Indexer | Envio HyperIndex | 3.12.1 |
| Transcription | whisper.cpp (`ggml-base.en`), Vosk (`vosk-model-en-us-0.22`) | 1.9.4, 0.3.45 (latest published wheel; 0.3.50 is a source-only tag, S7) |
| Lint and format | Biome | 2.5.15 |
| Tests | Vitest, Playwright | 5.0.3, 1.63.0 |

**Why a router-only SPA.** The web app is static files: TanStack Router gives type-safe routes and loaders in the browser, and everything dynamic comes from the chain, Envio and the studio. TanStack Start adds server rendering and server functions, which need a request-scoped server; SAYSO's server work is long-running (clocks, quotes, reveals), so it lives in the studio. The SPA ships from any static host.

No ethers: Kuru's published SDK depends on ethers v5, so only its ABIs are vendored into `packages/core`.

## 10. Runtime and hosting

| Piece | Where | Notes |
|---|---|---|
| `apps/web` | Static files behind Caddy on the VPS | The domain is the passkey relying-party ID and must never change after the first real passkey |
| `apps/studio` | Bun under systemd on the VPS | Must run 24/7 through judging (14 to 27 Oct 2026) |
| Clip media, manifests, transcripts | Studio data directory; media served by Caddy with range requests | Ignored by git; chunks public only through the reveal API |
| Indexer | Envio hosted service or self-hosted on the VPS | Spike S6 |
| CRE | Deployed DON workflow, else studio-run simulation | Deploy access requested with `cre account access` |
| RPC | `https://testnet-rpc.monad.xyz` | Public endpoint; a provider key is optional |

Environment (`.env.example` lists every key): `RPC_URL`, `CHAIN_ID=10143`, `DEPLOYER_PK` (contract deploys only), `OPERATOR_PK`, `BOT_PK`, `DRIP_PK`, `REPORTER_PK` (signs simulated CRE reports; the only key `reportOrigin` accepts), `OPERATOR_ADDRESS` and `REPORTER_ADDRESS` (public addresses `Deploy.s.sol` wires), `SAYSO_MARKETS`, `AUSD`, `KURU_ROUTER`, `CRE_MODE=simulation|don`, `VITE_RP_ID`, `VITE_STUDIO_URL`, `VITE_INDEXER_URL`, and the offline transcription paths `WHISPER_CLI`, `WHISPER_MODEL`, `VOSK_MODEL`, optional `VOSK_PYTHON_PROJECT`.

### Testnet MON budget

Testnet MON comes from a rate-limited faucet, so the plan is lean. Targets are [I] until S1 to S4 measure real gas; Monad charges the declared gas limit at a 100 gwei minimum base fee [V: monskills `gas`], so a 300k-gas call costs about 0.03 MON.

| Key | Target | Spends on |
|---|---|---|
| DEPLOYER | 10 MON | Contract deploys and market creation, once |
| OPERATOR | 15 MON | One `flagSaid` per word, evidence batches, closes |
| BOT | 15 MON | Cancel and re-post of the 0.98 bid; inventory is AUSD, not MON |
| DRIP | 60 MON | About 0.5 MON per new player, so roughly 120 players |
| REPORTER | 5 MON | One simulated report transaction per evidence batch and per close (about 0.03 MON each) |

About 105 MON in total. Players start with under 10 MON, so the web sends their transactions one block apart (the reserve-balance rule in the `mera-passkeys` skill) and each pays gas only. The drip handler refuses new drips when DRIP falls below one drip plus gas; the join flow still works and S2 shows the faucet links. S1 to S4 replace these targets with measured costs.

## 11. Failure modes

| Failure | Behaviour |
|---|---|
| RPC errors | Studio retries with backoff and pauses the episode start; web shows the stale state with its age |
| Flag transaction late | The card still flips at presentation time from SSE; the chain flag follows; settlement is unaffected |
| Engines disagree on a word | No flag; the word resolves at close under the same agreement rule |
| CRE run fails | Studio retries the trigger; after 24 h with no report the owner may void |
| House inventory short | Episode start waits; lobby shows "restocking" |
| Starter drip empty | Join still works; S2 shows the faucet links |

## 12. Testing

- `packages/core`: unit tests for normalization, matching vectors, chunking, leaf and root vectors shared with Foundry.
- `contracts`: Foundry unit and invariant tests (collateral equals outstanding sets until redemption; no double resolution; only the forwarder settles).
- `cre/resolver`: workflow unit tests plus `cre workflow simulate` against testnet.
- `apps/studio`: episode runner against a local chain and recorded fixtures.
- `apps/web`: Playwright at a 412 px viewport for join, trade, flip, redeem, restore.
- Health: `GET /v1/health` reports chain head lag, key balances, house inventory, last CRE run and its mode.
