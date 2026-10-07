# SAYSO build plan

The live tracker for the build: every phase, every task, what proves it and where the proof lives. **Tick a box in the same commit as the work it describes.** Product rules live in [PRD](../PRD.md); this file only says what gets built, in what order, and how we know it works.

## How to read this file

- `- [x] **2.3** <task> — proof: <commit> · <command → observed result>` is done, with the evidence.
- `- [ ] **2.3** <task> — proof: <exact command or artefact required>` is open.
- Phase status: `TODO / DOING / DONE / BLOCKED / CUT`. A phase is DONE only when every box is ticked and the phase review passed.
- Labels: [V] verified by a command or source, [I] inference, [U] unresolved with the spike that settles it.
- Spike scratch work lives outside the repo in `handoff\sayso\spikes\`; results land in [INTEGRATIONS](INTEGRATIONS.md) section 9.
- External delivery gates and owner actions are tracked in [BLOCKERS](../BLOCKERS.md). Local fork/source proof never closes a live gate.

## Status at a glance (2026-10-07)

| Phase | Status | Done | Next action | Blocked by |
|---|---|---|---|---|
| 0 Workspace | DONE | 3/3 | none | none |
| 1 Core (TDD) | DONE | 10/10 | none | none |
| Spikes | DOING | 1/6 | Live S2+S3 from BOT (fork run green) | S1–S4 need MON; S4 needs the CRE CLI and account |
| 2 Contracts | DOING | 9/11 | 2.9 deploy, then 2.10 addresses | DEPLOYER MON |
| 3 Transcription | DOING | 2/3 | 3.3 original rights-cleared English clip library | B07; Indonesian/bilingual clips additionally B10 |
| 4 CRE resolver | DOING | 2/3 | 4.3 staged simulation, then broadcast | `cre login`, S4, deployed contract, reveal API |
| 5 Studio | DOING | 4/8 | Funded live house/runner and authenticated CRE proof | B01–B04; hosting B05 |
| 6 Indexer | DOING | 1/3 | 6.1 live sync, then 6.3 hosting | deployed receiver; Linux/macOS tooling (WSL on Windows) |
| 7 Web | DOING | 2/8 | 7.2 screenshots approved by the user, then 7.3 S1 Join | S5 needs the real domain |
| 8 Ship | TODO | 0/5 | after Phase 7 | VPS, domain, team registration |

**Never cut** (PRD section 10): a word is said → its card flips SAID → a player cashes out or holds → CRE settles → the player redeems AUSD, on camera, every transaction on the testnet explorer.

## Schedule (WIB)

| Day | Target |
|---|---|
| Mon 5 Oct | Phase 0, Phase 1, spike S7 |
| Tue 6 Oct | Spikes S1 to S4 (once funded), Phase 2 contracts |
| Wed 7 Oct | Phase 2 deploy, Phase 3 transcription + fixture, Phase 4 resolver |
| Thu 8 Oct | Phase 5 studio |
| Fri 9 Oct | Phase 5 finish, Phase 6 indexer |
| Sat 10 to Sun 11 Oct | Phase 7 web |
| Mon 12 Oct | Phase 8 deploy, rehearsal with real players |
| Tue 13 Oct | README, video, submission by 18:00 WIB (official deadline Wed 14 Oct 10:59 WIB) |

## Phase 0 — Workspace · DONE

**Goal:** a clean clone installs, type-checks, lints, tests and compiles with one command each.

- [x] **0.1** Bun workspace root, Biome 2.5.15, shared tsconfig (TS 7.0.2), `.env.example` with every key from ARCHITECTURE section 10 — proof: `50d8874` · `bun run verify` first green from a clean clone at `44b625e` (the root alone has no workspace to test); re-run green from a clean clone at `4cfbf4a` by the Phase 0+1 review (159/159)
- [x] **0.2** `packages/core` skeleton with Vitest — proof: `44b625e` · Vitest 4/4
- [x] **0.3** Foundry with solc 0.8.37, Prague, Soldeer deps (forge-std 1.17.0, OZ 5.7.0 + upgradeable) — proof: `f265eee` · `forge soldeer install && forge build` exit 0; a throwaway OZ + forge-std import compiled with 0 warnings and was deleted

**Acceptance:** `bun run verify` and `forge build` green from a clean clone; `.env.example` complete; every commit authored by Febri Nirwana.
**Proof recorded:** `handoff\sayso\PROGRESS.md` Phase 0. Review folded into the Phase 1 review (1.9). This tracker was created at `cd6a859`, after Phases 0 and 1 landed, so their boxes were ticked retroactively; from Phase 2 on, a box is ticked in the commit that does the work.

## Phase 1 — `packages/core` (TDD) · DONE

**Goal:** every rule that web, studio and CRE must agree on exists once, as pure tested TypeScript.

- [x] **1.1** `match.ts`: `normalizeToken`, `isValidTarget`, `matchesTarget`, `agreedSpokenTime`; every vector in the `word-matching` skill is a test — proof: `4a56950`
- [x] **1.2** `transcript.ts`: 10 s chunks, canonical token JSON, `leafHash`, `evidenceHash` per ARCHITECTURE section 6 — proof: `dae37c5` · 21 cases incl. boundary chunks and empty chunks
- [x] **1.3** `merkle.ts` with commutative keccak pairs; vectors exported to `contracts/test/fixtures/merkle.json` — proof: `3757459` · `forge test` 2/2, OpenZeppelin `MerkleProof` accepts the TypeScript roots and rejects a flipped leaf
- [x] **1.4** `units.ts`: prices on 100-tick grid 100..9900, sizes, AUSD helpers, BigInt only — proof: `1a3f39e` · boundaries 0.01, 0.50, 0.98, 0.99 tested
- [x] **1.5** `nickname.ts`: deterministic two-word name, checksum-insensitive — proof: `31cb946`
- [x] **1.6** Vendored Kuru OrderBook, Router, MarginAccount ABIs + `SOURCE.md` (`@kuru-labs/kuru-sdk@0.0.95`) — proof: `273f726`
- [x] **1.7** `addresses.ts` (testnet only) + `scripts/check-addresses.ts` (`cast code` each) — proof: `7b14999`
- [x] **1.8** One package entry exporting every module — proof: `59da66d` · `bun run verify` 159/159 tests; entry lists 43 exports
- [x] **1.9** Phase 0+1 review (reviewer subagent) — proof: `handoff\sayso\reports\review-phase01.md` · FAIL at `4cfbf4a` (quote quantum, NaN/Infinity token times, three doc findings), fixed in `8f5b7fd`, `a22f1af`, `1b54ce0`; re-review at `96229af` PASS on every finding from a clean clone (verify 167/167, forge 27/27, both original failing commands now behave)
- [x] **1.10** PROGRESS entry for Phase 1 and spike S7 — proof: `handoff\sayso\PROGRESS.md` Phase 1 lists commits, checks, rulings and the recorded size/tracking exceptions

**Acceptance:** all vectors pass; Merkle vectors byte-identical between TypeScript and Foundry; no I/O in `packages/core/src` (no `fs`, `fetch`, timers or randomness outside tests).
**Moved out:** `abi/sayso.ts` → 2.10; `gas.ts` → 2.8.

## Spikes · DOING

Each spike answers one question with on-chain or on-device evidence, then writes its result into INTEGRATIONS section 9 in its own commit. Scratch code stays in `handoff\sayso\spikes\<id>\`.

- [ ] **S1** AUSD faucet supply · BLOCKED (DRIP has 0 MON)
  - [ ] two timed `requestFunds(DRIP)` broadcasts; amount and cadence recorded — proof: tx hashes + `balanceOf` before/after
  - [ ] if unusable: switch `AUSD` config to Kuru testnet USDC and say so in INTEGRATIONS and PRD
- [ ] **S2 + S3** Kuru book from a contract · DOING
  - [x] fork probe drafted: `spikes\s3\test\KuruProbe.t.sol` (149 lines) deploys a token and its book via `Router.deployProxy(0, …)`
  - [x] probe compiles and the fork run is green, including `test_ausdQuote` — proof: `forge test --via-ir --fork-url https://testnet-rpc.monad.xyz -vv` → 2 passed (2026-10-05); findings in INTEGRATIONS section 2 · `Stack too deep` only without `--via-ir`
  - [ ] live run from BOT: provision a flip ladder, contract-side `placeAndExecuteMarketBuy/Sell` with `isMargin = false` — proof: tx hashes; who is debited; where tokens land; `quoteSize` units; one live `Trade` log
- [ ] **S4** CRE on Monad testnet · BLOCKED (CLI not installed; user account)
  - [ ] CRE CLI 1.36.0 installed; `cre login`; `cre account access` requested — proof: `cre version`, access request id
  - [ ] `cre workflow supported-chains --output json` lists `monad-testnet`
  - [ ] a minimal `ReceiverTemplate` consumer receives a report via `simulate --broadcast` — proof: report tx hash and decoded event
- [ ] **S5** Mera PRF at the real domain on iOS Safari and Android Chrome (runs in Phase 7) — proof: create, sign, clear storage, restore the same address on both
- [ ] **S6** Envio hosting choice (runs in Phase 6) — proof: GraphQL query answered from the chosen host
- [x] **S7** Engine agreement — proof: `76f9a65` · three NASA clips, agreement 89–95 %, median skew 90–290 ms, p99 ≤ 1,220 ms; keep 1,500 ms [I]; Vosk pinned to 0.3.45 (0.3.50 has no wheel)

## Phase 2 — Contracts (Foundry, TDD) · DOING

**Goal:** `SaysoMarkets` + `OutcomeToken` + `KuruTrade` deployed on testnet, verified, with every rule in [SMART-CONTRACTS](SMART-CONTRACTS.md) enforced by a test.

- [x] **2.1** `OutcomeToken`: clone-initializable ERC-20, 6 decimals, mint/burn only by markets, markets as trusted spender — proof: `5fdc530` · `forge test --match-contract OutcomeTokenTest` 12/12 (init-once on implementation and clone, unauthorised mint/burn, allowance-free markets transfer, books still need allowances); full offline `forge test` 27/27
- [x] **2.2** `SaysoMarkets` storage, roles, `createEpisode` (roots A/B committed), `listEpisode` via `KuruTrade` — proof: `b84061b` · `forge test --match-contract SaysoMarketsEpisodesTest` 26/26 (event payloads, roles, time and word-count bounds, once-only listing, per-word books and approvals); full offline `forge test` 54 passed, 1 fork suite skipped; local `anvil --network monad` create + list of two words (`createEpisode` 974,182 gas, `listEpisode` 2,638,817 with mock books)
- [x] **2.3** Sets: `mintSet`, `mintSetWithPermit`, `burnSet` — proof: `51424a7` · `forge test --match-contract SaysoMarketsSetsTest` 10/10, red first (0/10 against stage 2): real `vm.sign` permit, front-run permit still mints, invalid permit without allowance mints nothing, failed NO burn rolls back YES and counters; full offline `forge test` 64 passed, 1 fork suite skipped; local `anvil --network monad` mint 3 / burn 1 left YES = NO = sets = held AUSD = 2,000,000
- [x] **2.4** Trades: `buyYes`, `sellYes`, `buyNo`, `sellNo` + `Traded` — proof: YES side `59bac94` (SaysoMarketsTradesTest 10/10, red first); NO side this commit: `forge test --match-contract SaysoMarketsTradesNoTest` 12/12 (red first: collateral-shortfall test failed before `_requireCollateral`), full offline `forge test` 86 passed, 1 fork suite skipped; local `anvil --network monad` buyNo then sellNo kept held AUSD = totalSets (22,000,000 then 20,999,999), returned 195 YES base units of dust, left markets holding zero YES and NO. Fork test against live Kuru books stays with S2 (needs MON)
- [x] **2.5** Lifecycle: `flagSaid`, `markEvidence` (emits `EvidenceReady` batches), `closeEpisode` (emits `EpisodeClosed`) — proof: `forge test --match-contract SaysoMarketsLifecycleTest` 9/9, red first 0/9 (roles, live-window boundaries, no re-flag, batch membership and state, close clock and once-only, mint blocked and burn allowed after close); full offline `forge test` 95 passed, 1 fork suite skipped; local `anvil --network monad` with episodes paused: two flags (53,187 gas each), one `markEvidence` (58,528, one `EvidenceReady [1,2]`), `closeEpisode` (42,511), held AUSD = totalSets = 3,000,000, then `mintSet` reverted `EpisodeIsClosed`
- [x] **2.6** Receiver: inherit `ReceiverTemplate`; `_processReport` with every rejection rule; `redeem`; `voidWord` after 24 h (pays 0.5) — proof: Reports 11/11 + Redeem 8/8, red first (17 failing; the 2 vendor-guard tests already passed): 64-byte metadata, wrong forwarder, zero forwarder, workflow-id mismatch, forged report from a non-REPORTER `tx.origin`, unknown word, early No, duplicates, revert-all, odd Void splits; full offline `forge test` 113 passed, 1 fork suite skipped; local `anvil --network monad`: report (83,408 gas) → YES redeem 3 AUSD → 24 h timeout void → odd YES and NO Void redemptions left `totalSets` 0 and 1 base unit of unsweepable surplus
- [x] **2.7** Handler-based invariant suite, SMART-CONTRACTS section 5 items 1–7 — proof: `invariant_marketSafety` 128 runs × depth 64 = 8,192 calls, 0 handler reverts; 14 actions cover sets, all four trades, flags/evidence, close, authenticated/forged reports, timeout Void and odd redemptions. A one-unit collateral-loss probe failed before restoration. Full offline `forge test` 115 passed, 0 failed, 1 skipped in 9.20 s. Runtime handler smoke finalized Yes/No/Void and paid four redemptions: held AUSD 480,000,039 ≥ reserve 480,000,038, owner movement 0. `forge build --sizes`: SaysoMarkets runtime 19,803 B (4,773 below EIP-170, 111,269 below Monad's 128 KB)
- [x] **2.8** Gas: `forge test --gas-report` (113 permanent tests plus 2 throwaway probes passed, 1 fork suite skipped) and real AUSD/Kuru Monad fork at block 68,394,814 → `packages/core/src/gas.ts`, `gasLimit(kind,count?)` returns measured +20% rounded up. Isolated snapshots for all episode/batch counts; actual local-fork eight-word create/list receipts used 3,395,766 / 9,559,637 gas with limits 4,074,920 / 11,471,565, both status 1; eight books fit the 30M transaction limit. Table and measurement limits in SMART-CONTRACTS section 8; live house-ladder/permit/forwarder overhead remeasurement stays gated by S1–S4
- [ ] **2.9** `Deploy.s.sol` to testnet with the simulation forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`; verify on Monadscan and MonadVision · needs DEPLOYER MON — proof: deployment log row, `cast code` non-empty, verification links
- [ ] **2.10** `packages/core/abi/sayso.ts` generated from forge artifacts; deployed addresses in `addresses.ts` — proof: generator check passes; `scripts/check-addresses.ts` green · generator and first export landed early so CRE and studio code import one ABI; regenerate after each contract stage; addresses wait on 2.9
- [x] **2.11** Phase 2 source review — reviewer PASS after R1–R4 corrections: fail-closed deploy authentication, explicit gift cashflow parties, non-vacuous invariant fills/payouts and aligned lifecycle docs. Lead corrected contract proof: 119 passed, 0 failed, 1 skipped; invariant 128 × 64; ABI check matched. Report: `handoff/sayso/reports/review-phase2.md`. Live deployment/CRE acceptance remains open; indexer consumer verification is tracked separately

**Acceptance:** all unit and invariant tests green; contracts deployed and verified; gas table filled; only the CRE forwarder can move a word to Yes or No.
**Proof recorded:** SMART-CONTRACTS deployment log and gas table; PROGRESS Phase 2.

## Phase 3 — Transcription and fixture · DOING

**Goal:** any clip becomes two committed transcripts, chunk files, two roots and a flag plan with one command, reproducibly.

- [x] **3.1** `tools/transcribe` Bun CLI — proof: `bun run --cwd tools/transcribe typecheck && bun run --cwd tools/transcribe test` → exit 0, 29/29; two real runs on the fixture WAV (whisper.cpp 1.9.4 `ggml-base.en` `-l en -t 4 -ng -ml 1 -sow -ojf`; Vosk 0.3.45 `vosk-model-en-us-0.22`, Python 3.12 via `uv`, `SetWords(True)`) exit 0 and write ten byte-identical files outside the repo; printed `clipId 0xd32d252d…02cc43`, `rootA 0x1839363f…db7f`, `rootB 0x9fb6c343…2e49`, block SAID 10,860 ms, market SAID 7,090 ms, four words NO (no agreement)
  - [x] runs `whisper-cli` 1.9.4 and Vosk 0.3.45 exactly as spike S7 did; engine and model paths come from `WHISPER_CLI`, `WHISPER_MODEL`, `VOSK_MODEL` (optional `VOSK_PYTHON_PROJECT`)
  - [x] normalises, chunks, hashes and roots with `packages/core` only; writes `<out>/<id>/{clip.json,flag-plan.json,chunks/{A,B}/<index>.json}` and refuses an `--out` inside the repo
  - [x] prints `clipId`, `rootA`, `rootB` and the flag plan
- [x] **3.2** `clips/fixtures/tts-market/`: a 32,090 ms team-generated CC0 speech clip (Windows TTS via tracked `generate.ps1`; no media tracked) with manifest, both engines' chunks, expected roots and flag plan, used by transcribe, CRE and studio tests — proof: `tools/transcribe/src/fixture.test.ts` recomputes every leaf, proof, both roots and the flag plan from the tracked chunks and compares them byte for byte → 29/29; the real CLI output matched all nine tracked payload files. Deviation: TTS instead of a public-domain recording keeps the fixture licence-free and the words known; regenerating on another Windows voice changes the media hash, so the tracked chunks, not the WAV, are the reference
- [ ] **3.3** Clip library in studio data (untracked): 8+ clips of 3–5 min, 6 curated words each (agreed-said words and decoys), licence recorded per clip · needs cleared clips ([B07](../BLOCKERS.md)) — proof: library manifest count and licence column

**Acceptance:** rerunning the pipeline on the fixture reproduces the tracked roots byte for byte.
**Note:** the S7 NASA clips are research inputs only; NASA's media guidelines bar implying endorsement of crypto activity, so episode clips need their own clearance [V: S7 report].

## Phase 4 — CRE resolver · DOING

**Goal:** CRE alone turns committed evidence into a Yes/No report that the contract accepts, and tampered evidence produces nothing.

- [x] **4.1** `cre/resolver` TypeScript workflow on SDK 1.23.0, `monad-testnet` target, strict config for the `SaysoMarkets` address, reveal API base URL and report gas — built by hand because `cre init` needs login — proof: `bun x --no-install cre-compile src/main.ts <tmp>.wasm` builds the WASM with no CRE auth, also from a clean `bun install --frozen-lockfile` (4,244,093 bytes, `\0asm` header); `cre workflow simulate` itself moves to 4.3
- [x] **4.2** Handler 0 (`EvidenceReady`) and handler 1 (`EpisodeClosed`) exactly as the `cre-resolver` skill; any missing, malformed or tampered chunk aborts the whole report — proof: `bun run --cwd cre/resolver test` 19/19 on core-built fixtures (agree → Yes, false flag → No at close, one engine only → No, >1,500 ms apart → No, tampered token/leaf/root → no report, missing chunk → no report, wrong clip/episode rejected, report ABI decodes as `(uint32,uint256[],uint8[],bytes32)` with Yes = 2, No = 3); root `bun run verify` 215/215
- [ ] **4.3** Simulation without broadcast, then `--broadcast` on a staged episode — proof: report tx hash, `WordResolved` events, latency from close to last resolution

**Acceptance:** a staged episode settles every word through the simulation forwarder; tampered data produces no report.

## Phase 5 — Studio · DOING

**Goal:** an episode runs end to end on testnet with nobody from the team online.

- [x] **5.1** Hono app, config, SQLite schema from ERD section 3, `GET /v1/time`, `GET /v1/health` — proof: `bun run --cwd apps/studio test` 22/22 on real `bun:sqlite` (Vitest runs inside Bun; under Node it cannot load `bun:sqlite`), schema applies to an empty DB, config refuses `CHAIN_ID` ≠ 10143 and JSON/inspect output carries no key material; production `main.ts` against a local fake RPC answered `/v1/time` and `/v1/health` (`status ok`, head lag 796 ms, last CRE run with its mode)
- [x] **5.2** Clip library loader and reveal API `/v1/episodes/:id/chunks/:engine/:index`; schedule enforced (`startsAt + chunkEnd + 2,000 ms`, inclusive), full reveal once the episode is Closed or Settled — proof: same run covers fixture ingest, tampered chunk and root mismatch refused, boundary − 1 ms → empty `425`, exact boundary → payload, unknown episode/engine/index → empty `404`; live smoke: `curl` chunk A/3 of a Live episode → `425 Too Early` with no body, of a Closed episode → `200` with tokens, leaf and proof
- [ ] **5.3** Scheduler (hourly + on-demand `POST /v1/episodes`, one at a time) and runner: create, list, seed, clock, durable `actions`, explicit gas and receipt-gated sender streams — permanent maker and CRE hooks now wired. Runner regressions 23/23 cover signed recovery before expiry/state skips, strict restart receipt boundaries and shutdown drain. Production admission returns 503 without maker/CRE prerequisites. Integrated local Monad/AUSD/Kuru fork created/listed/seeded six words with the real BOT adapter; one funded live episode remains required (B01–B04)
- [ ] **5.4** House market maker: ladder seeding, quote pull at `t − 400 ms`, 0.98 bid on SAID, cancel at close, post-settlement withdraw and redeem — permanent implementation and 13/13 regression tests landed. Integrated real-Kuru fork: six books/24 orders, partial IOC 15,576,730 YES, paired replacement flip pull, 1 YES cash-out for 980,000 AUSD base units, Yes/No/Void inventory recycled, zero remaining orders or duplicate actions. GraphQL transport fixture used chain-read positions; settlement used a local authenticated forwarder fixture, not CRE. Live transaction hashes and real Envio/CRE proof still required (B01–B04)
- [x] **5.5** `flagSaid` at spoken `t`, `markEvidence` at verified chunk reveal boundaries, `closeEpisode` after the final 2,000 ms presentation margin; SSE `/v1/episodes/:id/stream` — proof: 42 studio tests cover no future flag leakage, receipt sequencing, persistent recovery, exact 10 s duration boundaries and skipped expired flags; real Monad/Kuru fork lifecycle smoke created/listed six words, two flag receipts took 570 / 622 ms, emitted evidence and closed episode 1. This is local fork proof, not live testnet settlement; funded live proof stays with 5.8
- [ ] **5.6** CRE runner (simulation mode): watch `EvidenceReady` and `EpisodeClosed`, run the simulate command, record `cre_runs` — 30/30 regressions cover canonical trigger receipt-array indices, 100-block RPC catch-up, reporter nonce attribution, bounded pre-write no-report protocol, ambiguous-write reconciliation and shutdown. Runtime fake CLI submitted real local receiver/forwarder transactions; both trigger rows recorded corroborated report hashes and two resolved words. Resolver WASM rebuilt (4,247,033 bytes, `0061736d` header); authenticated real CLI broadcast remains gated by B01–B03
- [x] **5.7** Starter drip: once per address, rate-limited by direct-peer IP HMAC, MON + AUSD, refuses when DRIP is low — 19/19 regressions cover insufficient balance, atomic reservation, concurrent claims, restart/unknown receipt recovery, reverted legs, IP canonicalization and shutdown. Real Monad/AUSD fork via HTTP granted exactly 0.5 MON + 10 AUSD to an empty-code recipient, returned 201, repeat 409 and malformed JSON 400; delegated recipient native call also confirmed with estimated gas. Local proof only; funded unattended operation remains part of 5.8
- [ ] **5.8** `deploy/` systemd unit and Caddy config; full episode against testnet from a local run — preparation landed: dedicated-account hardened unit, Caddy drop-in, separate opaque-MP4/public-web roots, explicit loopback proxy identity and writable strict-checked resolver. Actual Caddy 2.11.7 proof: range 206/416, JSON/directories 404, encoded traversal did not expose private data, spoofed IP replaced by actual peer, SSE delivered and reload succeeded. Hardened WSL systemd main (account/path/bind substitutions only) survived two SIGKILL restarts with a read-only SQLite marker retained, stopped SIGTERM with exit 0, and enforced deployment settings despite conflicting env. Sandboxed relocated resolver compiled to 4,247,157-byte WASM without CRE login. Public HTTPS/VPS and full funded/authenticated testnet episode remain open (B01–B06)

**Acceptance:** an on-demand episode is created, listed, seeded, flagged on time (latency logged under 1 s), closed, settled by CRE and its house inventory recycled with no human action.

**Continuation verification (2026-10-06):** full `bun run verify` under WSL passes all workspace typechecks, Biome with 73 non-null assertion warnings and zero errors, and 348 tests (core 172, studio 114, resolver 23, transcription 29, indexer 10). Production read API smoke: time/health 200, unconfigured drip/episode writes 503. Source-review findings and runtime corrections are recorded in `handoff\sayso\reports\review-phase5.md`; the live acceptance above is still open.

**Deployment-preparation verification (2026-10-07):** full WSL `bun run verify`: all typechecks passed, zero lint errors / unchanged 73 warnings, 353 tests (studio 119). Independent operational source review PASS; security review found streamed-body identity loss, closed by a failing-before/passing-after real middleware grant/rate-limit regression and actual Caddy chunked HTTP proof. No UI shipped/visually reviewed, remote deployment or live transaction. Clip rights/language guidance and unresolved gate B10 are tracked separately.

## Phase 6 — Indexer · DOING

**Goal:** trade feed, positions and leaderboard come from Envio HyperIndex.

- [ ] **6.1** Envio 3.12.1 config for chain 10143 + dynamic OutcomeToken registration, ERD schema and workspace landed; Linux/WSL codegen and typecheck pass with generated core ABI. Receiver address remains unset; local sync-to-head requires funded deployment and a cast-code-verified address/start block, so this item remains open
- [x] **6.2** Event handlers, Transfer-only token balances, actual payer/recipient set cashflows, final-word-only profit and settled ranks — proof: Envio test-indexer helpers 10/10 under Linux/WSL, including gifted contract-caller mint/direct burn (not tx.origin), all four trades, sellNo YES dust, winner/No/Void redemption, unsettled exclusion and two-player hand calculation. Runtime handler pipeline discovered clones, indexed buy→resolution→redemption without profit double count; economic smoke: payer −3, holder +2, cash recipient +1 AUSD, origin unindexed. Full root `bun run verify` 270 tests passed under WSL (15 Biome non-null warnings, no errors)
- [ ] **6.3** Spike S6 hosting decision and deployment; GraphQL URL documented — proof: query answered from the host

**Acceptance:** after a full episode, `Player.profit` matches a hand calculation from receipts for two players.

## Phase 7 — Web · TODO

**Goal:** a phone completes the PRD section 10 path, and it looks like SAYSO, not a template.

- [x] **7.1** Vite + TanStack Router SPA, PWA manifest (standalone, portrait), Tailwind with [DESIGN](../DESIGN.md) tokens and fonts, query client, S0 route and not-found; each S1–S8 route lands with its own task (no placeholder screens) — proof: `bun run --cwd apps/web build` → built in 3.0 s, PWA precache 6 entries; `typecheck` and `biome check apps/web` clean
- [ ] **7.2** Design pass per [DESIGN](../DESIGN.md): voxel WebP pipeline, sticker primitives, S0 landing with the 3D hero, S3 board with the SAID flip on a dev-only specimen route — proof: screenshots at 412 px and 1440 px shown to the user and approved before 7.3
- [x] **7.8** Sound: `tools/sfx` generates and masters the DESIGN section 10 set; web sound module (unlock, mute, duck) wired to tap, flip and countdown — proof: `bun run --cwd tools/sfx measure` → 11/11 within target, 115,417 bytes; in Chromium on `/design` a card flip starts exactly one 0.79 s `said` buffer, Go live starts the 1.23 s `start` sting, buttons the 0.14 s `tap`; countdown ticks covered by `episode/cues.test.ts`
- [ ] **7.3** S1 Join + Mera session + restore (`mera-passkeys` skill), PRF-unavailable screen
- [ ] **7.4** S2 Arena with the studio and indexer clients: schedule, start episode, starter balance status
- [ ] **7.5** S3 Episode (synced video, word board, flip at presentation time) and S4 Ticket (block-sequenced transactions, cash out on SAID)
- [ ] **7.6** S5 Results with evidence links, S6 Portfolio with redeem all, S7 Leaderboard, S8 Account
- [ ] **7.7** Playwright at 412 px with a PRF-capable virtual authenticator: join, trade, flip, cash out, redeem, clear storage, restore — proof: green run; every screen screenshotted into `handoff\sayso\screens\`

**Acceptance:** the PRD section 10 path works on a real phone against testnet; S5 (Mera on devices) passes at the real domain.

## Phase 8 — Ship · TODO

**Goal:** judges can use it unaided from 14 to 27 Oct, and the README proves every bounty claim.

- [ ] **8.1** Deploy web, studio and indexer to the VPS and domain; set `VITE_RP_ID` before any real passkey · needs VPS + domain — proof: HTTPS URL, `/v1/health` green
- [ ] **8.2** CRE deploy if access arrived (`setForwarderAddress`, `setExpectedWorkflowId`, `CRE_MODE=don`); else keep simulation and say so — proof: workflow id or the stated mode in README
- [ ] **8.3** Rehearsal with 10+ real players — proof: episodes, players, trades, flag and settlement latency recorded
- [ ] **8.4** `README.md`: one-liner, TESTNET, video, how it works (mermaid), why Monad, bounty table (requirement → feature → code path → video timestamp), addresses and tx hashes, settlement mode, run locally, AI-tool disclosure, licence
- [ ] **8.5** Demo video under 3 minutes showing the never-cut path (script in `handoff\sayso\VIDEO.md`)

**Acceptance:** a tester completes the PRD section 10 path alone on a phone from the public URL; README links resolve.
