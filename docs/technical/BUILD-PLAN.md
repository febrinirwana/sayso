# SAYSO build plan

The live tracker for the build: every phase, every task, what proves it and where the proof lives. **Tick a box in the same commit as the work it describes.** Product rules live in [PRD](../PRD.md); this file only says what gets built, in what order, and how we know it works.

## How to read this file

- `- [x] **2.3** <task> — proof: <commit> · <command → observed result>` is done, with the evidence.
- `- [ ] **2.3** <task> — proof: <exact command or artefact required>` is open.
- Phase status: `TODO / DOING / DONE / BLOCKED / CUT`. A phase is DONE only when every box is ticked and the phase review passed.
- Labels: [V] verified by a command or source, [I] inference, [U] unresolved with the spike that settles it.
- Spike scratch work lives outside the repo in `handoff\sayso\spikes\`; results land in [INTEGRATIONS](INTEGRATIONS.md) section 9.
- External delivery gates and owner actions are tracked in [BLOCKERS](../BLOCKERS.md). Local fork/source proof never closes a live gate.

## Status at a glance (2026-10-09)

| Phase | Status | Done | Next action | Blocked by |
|---|---|---|---|---|
| 0 Workspace | DONE | 3/3 | none | none |
| 1 Core (TDD) | DONE | 10/10 | none | none |
| Spikes | DOING | 3/6 | S4 report path proved on episode 12 (only the owner's deploy-access request remains); next S5/S6 | phones/domain (S5); hosting (S6) |
| 2 Contracts | DOING | 10/11 | 2.9 Monadscan verification (deployed, MonadVision verified) | Etherscan API key |
| 3 Transcription | DOING | 2/3 | 3.3 original rights-cleared English clip library | B07; Indonesian/bilingual clips additionally B10 |
| 4 CRE resolver | DONE | 3/3 | none; production reveal URL set at deploy | reveal URL waits on hosting (B03/B05) |
| 5 Studio | DOING | 6/8 | Episode 12 settled by the studio CRE runner and recycled unattended; fresh combined run missed <1 s flag target once (1,065 ms) | RPC timing (B14), hosting (B05) |
| 6 Indexer | DOING | 1/3 | Local RPC sync proved; tracked HyperSync and public hosting remain | HyperSync token (B13), hosting (B05/B09) |
| 7 Web | DOING | 5/8 | Corrected full browser path, now including CRE settlement and redeem | domain (B06) for real-device passkeys |
| 8 Ship | DOING | 0/5 | README draft committed; final links/media and deployment remain | VPS, domain, team registration, settled demo |

**Never cut** (PRD section 10): a word is said → its card flips SAID → a player cashes out or holds → CRE settles → the player redeems AUSD, on camera, every transaction on the testnet explorer.

**Implementation is not acceptance.** An open box can have committed code and passing local checks while its required live proof is still missing. Funding gates B01/B04 are closed. CRE settlement is live-proved in simulation mode (episode 12); DON deployment still needs deploy access.

**Latest integrated source check:** WSL `bun run verify` passed all workspace typechecks and 648 tests (one opt-in fork test skipped), with zero lint errors and 71 warnings. Final web production build passed; Vite still reports the large decorative 3D chunk warning. These checks do not close the failed combined browser run or the <1 s timing target.

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

- [x] **S1** AUSD faucet supply
  - [x] two timed `requestFunds` broadcasts; amount and cadence recorded — proof: 2026-10-08 DRIP `0xe09ff14aee40c8879957f31ff59f47eb5153bf281c47a57524e07e28c98e4cd1` (block 69,201,554) and BOT `0x043a4ac3b89824c67aba7322ab9ea1ba870c7470af8ccf7c042682cf3eb53827` (block 69,201,793), each status 1 and `balanceOf` 0 → 10,000,000,000 (10,000 AUSD); block times 73 s apart. Right after the first, `eth_call` reverted `MaxFrequencyExceeded` for DRIP and BOT alike (global limit) and succeeded again within 66 s
  - [x] fallback not needed: AUSD stays the quote token
- [x] **S2 + S3** Kuru book from a contract — live buy and sell proved on episode 11; details in INTEGRATIONS section 2
  - [x] fork probe drafted: `spikes\s3\test\KuruProbe.t.sol` (149 lines) deploys a token and its book via `Router.deployProxy(0, …)`
  - [x] probe compiles and the fork run is green, including `test_ausdQuote` — proof: `forge test --via-ir --fork-url https://testnet-rpc.monad.xyz -vv` → 2 passed (2026-10-05); findings in INTEGRATIONS section 2 · `Stack too deep` only without `--via-ir`
  - [x] live run from BOT: provision a flip ladder, contract-side `placeAndExecuteMarketBuy/Sell` with `isMargin = false` — proof: `3bd5d1c` seeded all six books in 27 s on episode 7; episode 11 buy `0x03d14b142f6f22f1dc25cdb65260e841debdff7bb0852a8f895968c34da3a499` (block 69,319,428, status 1) debited the player's wallet 1,000,000 AUSD base units and delivered 1,960,784 YES; sell `0x8327ccc2ba13368bdc6d13e2010c2948fa0cd07aa74c47397355f5f0ab461eb8` (block 69,319,623, status 1) sold those YES and paid the player's wallet 1,921,500 AUSD at the 0.98 bid after quote rounding. Both receipts include the live Kuru `Trade` topic and the contract `Traded` event; fresh receipt reads confirmed these amounts on 2026-10-09. This is cash-out, not CRE settlement.
- [ ] **S4** CRE on Monad testnet · report path PROVED; only the deploy-access request (owner action, not needed for simulation) remains
  - [x] CRE CLI 1.36.0 installed; `cre login` — proof: `cre whoami` 2026-10-09 → org `org_YpkVpkPkyx9lDfpX`, Deploy Access "Not enabled"
  - [ ] `cre account access` requested — proof: access request id (owner runs it in a local terminal)
  - [x] `cre workflow supported-chains --output json` lists `monad-testnet` — selector 2183018362218727504, forwarder/mock match INTEGRATIONS section 3
  - [x] the real `SaysoMarkets` receiver gets a report via `simulate --broadcast` — proof: `0x216b9f1434c1239ed03f68eb2cb6fc30d4c704c90b98712434c7b681195e2348` status 1, `WordResolved(12, 68, Yes)`
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
- [ ] **2.9** `Deploy.s.sol` to testnet with the simulation forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`; verify on Monadscan and MonadVision · DOING: deployed 2026-10-08 (`SaysoMarkets` `0xc8492B29…1CF8`, block 69,202,243; four receipts status 1; `cast code` non-empty; owner/operator/reportOrigin/forwarder read back) and MonadVision Sourcify `exact_match` for both contracts — log in SMART-CONTRACTS section 9; Monadscan waits on an Etherscan API key
- [x] **2.10** `packages/core/abi/sayso.ts` generated from forge artifacts; deployed addresses in `addresses.ts` — proof: `export-sayso-abi.ts --check` → matches the Foundry artifacts; `bun run --cwd packages/core check-addresses` → 9/9 ok including `saysoMarkets` (19,836 bytes) and `outcomeTokenImplementation` (3,389 bytes); resolver config `saysoMarkets` and indexer address/`start_block` 69,202,243 set from the same deployment
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
- [x] **4.3** Simulation without broadcast, then `--broadcast` on a staged episode — proof: episode 12 dry run, then evidence report `0x216b9f14…2348` and runner close report `0xc3d77d95…dba6` (both status 1) resolved 68/67 Yes and 69–72 No through the simulation forwarder; close → last resolution 63 min only because CRE login arrived late (runner run itself 33 s); tampered A/0 under the real CLI → no report. Details: INTEGRATIONS section 3

**Acceptance:** a staged episode settles every word through the simulation forwarder; tampered data produces no report.

## Phase 5 — Studio · DOING

**Goal:** an episode runs end to end on testnet with nobody from the team online.

- [x] **5.1** Hono app, config, SQLite schema from ERD section 3, `GET /v1/time`, `GET /v1/health` — proof: `bun run --cwd apps/studio test` 22/22 on real `bun:sqlite` (Vitest runs inside Bun; under Node it cannot load `bun:sqlite`), schema applies to an empty DB, config refuses `CHAIN_ID` ≠ 10143 and JSON/inspect output carries no key material; production `main.ts` against a local fake RPC answered `/v1/time` and `/v1/health` (`status ok`, head lag 796 ms, last CRE run with its mode)
- [x] **5.2** Clip library loader and reveal API `/v1/episodes/:id/chunks/:engine/:index`; schedule enforced (`startsAt + chunkEnd + 2,000 ms`, inclusive), full reveal once the episode is Closed or Settled — proof: same run covers fixture ingest, tampered chunk and root mismatch refused, boundary − 1 ms → empty `425`, exact boundary → payload, unknown episode/engine/index → empty `404`; live smoke: `curl` chunk A/3 of a Live episode → `425 Too Early` with no body, of a Closed episode → `200` with tokens, leaf and proof
- [ ] **5.3** Scheduler (hourly + on-demand `POST /v1/episodes`, one at a time) and runner: create, list, seed, clock, durable `actions`, explicit gas and receipt-gated sender streams — live episodes 11/12 created/listed/seeded/flagged/closed with separate OPERATOR/BOT clocks. Episode 11 flags confirmed in 969/577 ms; episode 12 in 1,065/669 ms, so the strict <1 s timing target is not universally accepted. Signed recovery, later-block sender gates and shutdown drain remain covered by studio regressions. Episode 12 is now Settled by CRE, so the same studio admits the next episode; that repeat admission is not yet proved live. B01/B04 funding initialization is complete.
- [x] **5.4** House market maker: ladder seeding, quote pull at `t − 400 ms`, 0.98 bid on SAID, cancel at close, post-settlement withdraw and redeem — live episode 12's two pulls were included before their flags; a chain-sized 0.98 bid paid the browser player 1,921,500 AUSD base units for 1,960,784 YES (sell `0x431cd080407f35eb3881fac220869758c523507ce3cd61a6736c8521a7a020ab`). After CRE settled episode 12, the studio recycled all six words by itself: margin withdraw + redeem receipts `0xdb2ac6a2…`, `0x69925d13…`, `0xdafbd7cf…`, `0x175f9cac…`, `0x49d93378…`, `0x36700dad…` (blocks 69,516,457–69,516,494, all status 1, ≈ 0.25 BOT MON) and marked the episode Settled
- [x] **5.5** `flagSaid` at spoken `t`, `markEvidence` at verified chunk reveal boundaries, `closeEpisode` after the final 2,000 ms presentation margin; SSE `/v1/episodes/:id/stream` — source/local lifecycle proof retained. Live episode 12 confirmed two flags, two evidence batches and close `0xade5ed9844e3fa5d4564e7d8cc8e9ad7fb6e5d60da5ebebe34e12101b460bbd6` at block 69,452,774. Recorded flag observation latency is 1,065/669 ms, not a guaranteed one-block result; strict timing remains under 5.3/B14. CRE settlement of the same episode is proved under 4.3/5.6.
- [x] **5.6** CRE runner (simulation mode): watch `EvidenceReady` and `EpisodeClosed`, run the simulate command, record `cre_runs` — the real studio runner, with the real CLI and a private resolver copy (`CRE_RESOLVER_DIR`), broadcast episode 12's close report `0xc3d77d95a48499ad7a5d39f604d775d0acf9f25887032e70bda1e9bab0a3dba6` and recorded a durable `success` row in 33 s. Live evidence also showed five CRE-unavailable retries (~13 min) permanently failed close runs, stranding episode 11 and blocking later admission; close runs now keep the capped 10-minute back-off (regression red → green); evidence runs may still give up because the close run re-decides every word
- [x] **5.7** Starter drip: once per address, rate-limited by direct-peer IP HMAC, MON + AUSD, refuses when DRIP is low — 19/19 regressions cover insufficient balance, atomic reservation, concurrent claims, restart/unknown receipt recovery, reverted legs, IP canonicalization and shutdown. Real Monad/AUSD fork via HTTP granted exactly 0.5 MON + 10 AUSD to an empty-code recipient, returned 201, repeat 409 and malformed JSON 400; delegated recipient native call also confirmed with estimated gas. Local proof only; funded unattended operation remains part of 5.8
- [ ] **5.8** `deploy/` systemd unit and Caddy config; full episode against testnet from a local run — deployment preparation and actual local Caddy/systemd restart/security proofs retained. Local testnet episode 12 now proves create/list/seed/flags/evidence/close, cash-out, CRE settlement and unattended recycling (5.4/5.6); a second episode admitted from the same persistent studio is not yet proved. Public HTTPS/VPS remains B03/B05/B06; ongoing reserve is B15.

**Acceptance:** an on-demand episode is created, listed, seeded, flagged on time (latency logged under 1 s), closed, settled by CRE and its house inventory recycled with no human action.

**Continuation verification (2026-10-06):** full `bun run verify` under WSL passes all workspace typechecks, Biome with 73 non-null assertion warnings and zero errors, and 348 tests (core 172, studio 114, resolver 23, transcription 29, indexer 10). Production read API smoke: time/health 200, unconfigured drip/episode writes 503. Source-review findings and runtime corrections are recorded in `handoff\sayso\reports\review-phase5.md`; the live acceptance above is still open.

**Deployment-preparation verification (2026-10-07):** full WSL `bun run verify`: all typechecks passed, zero lint errors / unchanged 73 warnings, 353 tests (studio 119). Independent operational source review PASS; security review found streamed-body identity loss, closed by a failing-before/passing-after real middleware grant/rate-limit regression and actual Caddy chunked HTTP proof. No UI shipped/visually reviewed, remote deployment or live transaction. Clip rights/language guidance and unresolved gate B10 are tracked separately.

## Phase 6 — Indexer · DOING

**Goal:** trade feed, positions and leaderboard come from Envio HyperIndex.

- [ ] **6.1** Envio 3.12.1 config for chain 10143 + dynamic OutcomeToken registration, ERD schema and workspace landed; Linux/WSL codegen and typecheck pass with generated core ABI · DOING 2026-10-08: a WSL runtime copy synced from block 69,202,243 to head (progress 69,236,871 = source head) and served episodes 1–4 with words, markets and SAID flags over GraphQL; it used an untracked RPC source because the tracked HyperSync config needs `ENVIO_API_TOKEN` (BLOCKERS B13)
- [x] **6.2** Event handlers, Transfer-only token balances, actual payer/recipient set cashflows, final-word-only profit and settled ranks — proof: Envio test-indexer helpers 10/10 under Linux/WSL, including gifted contract-caller mint/direct burn (not tx.origin), all four trades, sellNo YES dust, winner/No/Void redemption, unsettled exclusion and two-player hand calculation. Runtime handler pipeline discovered clones, indexed buy→resolution→redemption without profit double count; economic smoke: payer −3, holder +2, cash recipient +1 AUSD, origin unindexed. Full root `bun run verify` 270 tests passed under WSL (15 Biome non-null warnings, no errors)
- [ ] **6.3** Spike S6 hosting decision and deployment; GraphQL URL documented — proof: query answered from the host

**Acceptance:** after a full episode, `Player.profit` matches a hand calculation from receipts for two players.

## Phase 7 — Web · DOING

**Goal:** a phone completes the PRD section 10 path, and it looks like SAYSO, not a template.

- [x] **7.1** Vite + TanStack Router SPA, PWA manifest (standalone, portrait), Tailwind with [DESIGN](../DESIGN.md) tokens and fonts, query client, S0 route and not-found; each S1–S8 route lands with its own task (no placeholder screens) — proof: `bun run --cwd apps/web build` → built in 3.0 s, PWA precache 6 entries; `typecheck` and `biome check apps/web` clean
- [x] **7.2** Design pass per [DESIGN](../DESIGN.md): voxel WebP pipeline, sticker primitives, S0 landing with the 3D hero, S3 board with the SAID flip on a dev-only specimen route, plus S1/S2/S5–S8 specimens on `/design/player` and `/design/records` — proof: screenshots at 412/1440/1920 in `handoff\sayso\screens\v3\` and `v4\` shown to the user, who approved the design on 2026-10-08 ("dari segi design saya sudah suka and easy to navigate") and asked for symmetry fixes; after them 212/212 geometry assertions pass (sibling cards equal ±1 px, clip/position/ticket edges flush, no horizontal overflow at 412)
- [x] **7.8** Sound: `tools/sfx` generates and masters the DESIGN section 10 bubbly set; web sound module (unlock, mute, duck, tap/pop pitch variation) wired to tap, flip and countdown — proof: `bun run --cwd tools/sfx measure` → 12/12 within target, 126,747 bytes; in Edge every `/sfx/<id>.mp3` returns 200 and decodes, a FAQ press starts one `tap` buffer (rate 0.98), the mascot press starts `pop`; countdown ticks covered by `episode/cues.test.ts`
- [x] **7.3** S1 Join + Mera session + restore (`mera-passkeys` skill), PRF-unavailable screen — proof: discoverable Mera passkey, PRF entropy → BIP-39 → `m/44'/60'/0'/0/0`, intermediates zeroed, memory-only session, serialized explicit-gas sends gated to a strictly later block (unit tests with a fake client: no second broadcast before the next block, a reverted receipt rejects and releases the queue). Headless Edge with a CTAP2 resident PRF virtual authenticator (`handoff\sayso\spikes\account\account-proof.mjs`): join → `0x1e83b257f4F29ffFE65bA8C1A1d10AAa674c27A5`; localStorage, sessionStorage, IndexedDB and cookies cleared; sign-in restored the same address and the S8 restore check matched; `hasPrf:false` rendered the unsupported-browser screen. Real phones stay with spike S5
- [x] **7.4** S2 Arena with the studio and indexer clients: schedule, start episode, starter balance status — proof: committed live screen in `5d79915`; Edge 412 px episode 12 run joined with a PRF passkey, received the starter grant, showed its AUSD balance and started an on-demand episode through Arena. Studio request/create/list receipts confirmed and six books seeded before playback. `screens/e2e/live-01-arena-funded.png` and `e2e-live.json` record this path. Public deployment and real-device passkeys remain 8.1/S5, not falsely closed by a local browser.
- [ ] **7.5** S3 Episode and S4 Ticket: synced video, presentation-time flip, block-sequenced trades and SAID cash-out · DOING: live browser episode 12 bought 1,960,784 YES for 1 AUSD (`0x676997dbca228f8f4a842037bd09833039f2d2fe48df86ca06eff7068e453b22`), showed SAID/98¢ and sold for 1,921,500 AUSD base units (`0x431cd080407f35eb3881fac220869758c523507ce3cd61a6736c8521a7a020ab`), both status 1. The run failed afterward: refreshed empty holdings/book removed Filled feedback. The correction prioritizes sending/filled feedback over refreshed liquidity and has consumer regression proof; its complete live rerun still needs B15. The playing fixture is TTS/flat-colour video, not a rights-cleared sports demo.
- [ ] **7.6** S5 Results/evidence, S6 Portfolio/redeem-all, S7 Leaderboard and S8 Account — live readers and proof verification are implemented (`5d79915`); S8 is proved under 7.3. Episode 12's real received/spent cashflows exposed a reversed Results formula and false Redeemed label for a sold-out Portfolio row. Corrected consumers follow ERD (`cashIn` includes redemptions; never add `redeemed` twice) and distinguish closed positions from CRE redemption. Actual settled redemption remains B02; a separate fresh-session Portfolio read also failed with the honest complete-snapshot error on the public RPC, so this is not full acceptance.
- [ ] **7.7** Playwright at 412 px with a PRF-capable virtual authenticator: join, trade, flip, cash out, redeem, clear storage, restore — full green run remains required. Account join/clear/restore and no-PRF paths passed independently. Live episode 12 proved drip, Arena start, buy, SAID and a successful sell; it failed at the post-sell receipt UI after a bounded 120 s wait, so Results/Portfolio/restore were not reached by that same run. Screens/JSON preserve the partial evidence; corrected full rerun needs B15, and actual redemption needs CRE B02.

**Acceptance:** the PRD section 10 path works on a real phone against testnet; S5 (Mera on devices) passes at the real domain.

## Phase 8 — Ship · DOING

**Goal:** judges can use it unaided throughout the confirmed judging period, and the README proves every eligible bounty claim. Packaging, organizer contacts and the unresolved judging-date conflict are tracked in [SUBMISSIONS](../SUBMISSIONS.md).

- [ ] **8.1** Deploy web, studio and indexer to the VPS and domain; set `VITE_RP_ID` before any real passkey · needs VPS + domain — proof: HTTPS URL, `/v1/health` green
- [ ] **8.2** CRE deploy if access arrived (`setForwarderAddress`, `setExpectedWorkflowId`, `CRE_MODE=don`); else keep simulation and say so — proof: workflow id or the stated mode in README
- [ ] **8.3** Rehearsal with 10+ real players — proof: episodes, players, trades, flag and settlement latency recorded
- [ ] **8.4** `README.md`: one-liner, TESTNET, technical-demo and pitch links, how it works (mermaid), why Monad, eligible bounty table (requirement → feature → code path → video timestamp), addresses and tx hashes, settlement mode, run locally, AI-tool disclosure, licence; exclude Agora and do not claim Kuru Track 03 eligibility without a written ruling ([SUBMISSIONS](../SUBMISSIONS.md)) · DOING: judge-first draft committed in `3d89179`; public demo, technical/pitch video links and timestamps remain required, so the draft does not close 8.4.
- [ ] **8.5** Submission media per [SUBMISSIONS](../SUBMISSIONS.md): technical demo ≤3 minutes showing the never-cut path, separate team/problem pitch ≤2 minutes, logo ≤3 MB, and selected sponsor clips within their caps (CRE ≤2 minutes); scripts/media remain outside the repo

**Acceptance:** a tester completes the PRD section 10 path alone on a phone from the public URL; README links resolve.
