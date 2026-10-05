# SAYSO build plan

The live tracker for the build: every phase, every task, what proves it and where the proof lives. **Tick a box in the same commit as the work it describes.** Product rules live in [PRD](../PRD.md); this file only says what gets built, in what order, and how we know it works.

## How to read this file

- `- [x] **2.3** <task> â€” proof: <commit> Â· <command â†’ observed result>` is done, with the evidence.
- `- [ ] **2.3** <task> â€” proof: <exact command or artefact required>` is open.
- Phase status: `TODO / DOING / DONE / BLOCKED / CUT`. A phase is DONE only when every box is ticked and the phase review passed.
- Labels: [V] verified by a command or source, [I] inference, [U] unresolved with the spike that settles it.
- Spike scratch work lives outside the repo in `handoff\sayso\spikes\`; results land in [INTEGRATIONS](INTEGRATIONS.md) section 9.

## Status at a glance (2026-10-05)

| Phase | Status | Done | Next action | Blocked by |
|---|---|---|---|---|
| 0 Workspace | DONE | 3/3 | none | none |
| 1 Core (TDD) | DONE | 10/10 | none | none |
| Spikes | DOING | 1/6 | Live S2+S3 from BOT (fork run green) | S1â€“S4 need MON; S4 needs the CRE CLI and account |
| 2 Contracts | DOING | 8/11 | 2.11 source review | DEPLOYER MON |
| 3 Transcription | DOING | 2/3 | 3.3 clip library | 3.3 needs cleared clips |
| 4 CRE resolver | DOING | 2/3 | 4.3 staged simulation, then broadcast | `cre login`, S4, deployed contract, reveal API |
| 5 Studio | DOING | 2/8 | 5.3 scheduler and runner | live run needs funded keys |
| 6 Indexer | TODO | 0/3 | 6.1 after Phase 2 events are final | none |
| 7 Web | TODO | 0/7 | 7.2 design pass, one screen shown to the user | S5 needs the real domain |
| 8 Ship | TODO | 0/5 | after Phase 7 | VPS, domain, team registration |

**Never cut** (PRD section 10): a word is said â†’ its card flips SAID â†’ a player cashes out or holds â†’ CRE settles â†’ the player redeems AUSD, on camera, every transaction on the testnet explorer.

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

## Phase 0 â€” Workspace Â· DONE

**Goal:** a clean clone installs, type-checks, lints, tests and compiles with one command each.

- [x] **0.1** Bun workspace root, Biome 2.5.15, shared tsconfig (TS 7.0.2), `.env.example` with every key from ARCHITECTURE section 10 â€” proof: `50d8874` Â· `bun run verify` first green from a clean clone at `44b625e` (the root alone has no workspace to test); re-run green from a clean clone at `4cfbf4a` by the Phase 0+1 review (159/159)
- [x] **0.2** `packages/core` skeleton with Vitest â€” proof: `44b625e` Â· Vitest 4/4
- [x] **0.3** Foundry with solc 0.8.37, Prague, Soldeer deps (forge-std 1.17.0, OZ 5.7.0 + upgradeable) â€” proof: `f265eee` Â· `forge soldeer install && forge build` exit 0; a throwaway OZ + forge-std import compiled with 0 warnings and was deleted

**Acceptance:** `bun run verify` and `forge build` green from a clean clone; `.env.example` complete; every commit authored by Febri Nirwana.
**Proof recorded:** `handoff\sayso\PROGRESS.md` Phase 0. Review folded into the Phase 1 review (1.9). This tracker was created at `cd6a859`, after Phases 0 and 1 landed, so their boxes were ticked retroactively; from Phase 2 on, a box is ticked in the commit that does the work.

## Phase 1 â€” `packages/core` (TDD) Â· DONE

**Goal:** every rule that web, studio and CRE must agree on exists once, as pure tested TypeScript.

- [x] **1.1** `match.ts`: `normalizeToken`, `isValidTarget`, `matchesTarget`, `agreedSpokenTime`; every vector in the `word-matching` skill is a test â€” proof: `4a56950`
- [x] **1.2** `transcript.ts`: 10 s chunks, canonical token JSON, `leafHash`, `evidenceHash` per ARCHITECTURE section 6 â€” proof: `dae37c5` Â· 21 cases incl. boundary chunks and empty chunks
- [x] **1.3** `merkle.ts` with commutative keccak pairs; vectors exported to `contracts/test/fixtures/merkle.json` â€” proof: `3757459` Â· `forge test` 2/2, OpenZeppelin `MerkleProof` accepts the TypeScript roots and rejects a flipped leaf
- [x] **1.4** `units.ts`: prices on 100-tick grid 100..9900, sizes, AUSD helpers, BigInt only â€” proof: `1a3f39e` Â· boundaries 0.01, 0.50, 0.98, 0.99 tested
- [x] **1.5** `nickname.ts`: deterministic two-word name, checksum-insensitive â€” proof: `31cb946`
- [x] **1.6** Vendored Kuru OrderBook, Router, MarginAccount ABIs + `SOURCE.md` (`@kuru-labs/kuru-sdk@0.0.95`) â€” proof: `273f726`
- [x] **1.7** `addresses.ts` (testnet only) + `scripts/check-addresses.ts` (`cast code` each) â€” proof: `7b14999`
- [x] **1.8** One package entry exporting every module â€” proof: `59da66d` Â· `bun run verify` 159/159 tests; entry lists 43 exports
- [x] **1.9** Phase 0+1 review (reviewer subagent) â€” proof: `handoff\sayso\reports\review-phase01.md` Â· FAIL at `4cfbf4a` (quote quantum, NaN/Infinity token times, three doc findings), fixed in `8f5b7fd`, `a22f1af`, `1b54ce0`; re-review at `96229af` PASS on every finding from a clean clone (verify 167/167, forge 27/27, both original failing commands now behave)
- [x] **1.10** PROGRESS entry for Phase 1 and spike S7 â€” proof: `handoff\sayso\PROGRESS.md` Phase 1 lists commits, checks, rulings and the recorded size/tracking exceptions

**Acceptance:** all vectors pass; Merkle vectors byte-identical between TypeScript and Foundry; no I/O in `packages/core/src` (no `fs`, `fetch`, timers or randomness outside tests).
**Moved out:** `abi/sayso.ts` â†’ 2.10; `gas.ts` â†’ 2.8.

## Spikes Â· DOING

Each spike answers one question with on-chain or on-device evidence, then writes its result into INTEGRATIONS section 9 in its own commit. Scratch code stays in `handoff\sayso\spikes\<id>\`.

- [ ] **S1** AUSD faucet supply Â· BLOCKED (DRIP has 0 MON)
  - [ ] two timed `requestFunds(DRIP)` broadcasts; amount and cadence recorded â€” proof: tx hashes + `balanceOf` before/after
  - [ ] if unusable: switch `AUSD` config to Kuru testnet USDC and say so in INTEGRATIONS and PRD
- [ ] **S2 + S3** Kuru book from a contract Â· DOING
  - [x] fork probe drafted: `spikes\s3\test\KuruProbe.t.sol` (149 lines) deploys a token and its book via `Router.deployProxy(0, â€¦)`
  - [x] probe compiles and the fork run is green, including `test_ausdQuote` â€” proof: `forge test --via-ir --fork-url https://testnet-rpc.monad.xyz -vv` â†’ 2 passed (2026-10-05); findings in INTEGRATIONS section 2 Â· `Stack too deep` only without `--via-ir`
  - [ ] live run from BOT: provision a flip ladder, contract-side `placeAndExecuteMarketBuy/Sell` with `isMargin = false` â€” proof: tx hashes; who is debited; where tokens land; `quoteSize` units; one live `Trade` log
- [ ] **S4** CRE on Monad testnet Â· BLOCKED (CLI not installed; user account)
  - [ ] CRE CLI 1.36.0 installed; `cre login`; `cre account access` requested â€” proof: `cre version`, access request id
  - [ ] `cre workflow supported-chains --output json` lists `monad-testnet`
  - [ ] a minimal `ReceiverTemplate` consumer receives a report via `simulate --broadcast` â€” proof: report tx hash and decoded event
- [ ] **S5** Mera PRF at the real domain on iOS Safari and Android Chrome (runs in Phase 7) â€” proof: create, sign, clear storage, restore the same address on both
- [ ] **S6** Envio hosting choice (runs in Phase 6) â€” proof: GraphQL query answered from the chosen host
- [x] **S7** Engine agreement â€” proof: `76f9a65` Â· three NASA clips, agreement 89â€“95 %, median skew 90â€“290 ms, p99 â‰¤ 1,220 ms; keep 1,500 ms [I]; Vosk pinned to 0.3.45 (0.3.50 has no wheel)

## Phase 2 â€” Contracts (Foundry, TDD) Â· DOING

**Goal:** `SaysoMarkets` + `OutcomeToken` + `KuruTrade` deployed on testnet, verified, with every rule in [SMART-CONTRACTS](SMART-CONTRACTS.md) enforced by a test.

- [x] **2.1** `OutcomeToken`: clone-initializable ERC-20, 6 decimals, mint/burn only by markets, markets as trusted spender â€” proof: `5fdc530` Â· `forge test --match-contract OutcomeTokenTest` 12/12 (init-once on implementation and clone, unauthorised mint/burn, allowance-free markets transfer, books still need allowances); full offline `forge test` 27/27
- [x] **2.2** `SaysoMarkets` storage, roles, `createEpisode` (roots A/B committed), `listEpisode` via `KuruTrade` â€” proof: `b84061b` Â· `forge test --match-contract SaysoMarketsEpisodesTest` 26/26 (event payloads, roles, time and word-count bounds, once-only listing, per-word books and approvals); full offline `forge test` 54 passed, 1 fork suite skipped; local `anvil --network monad` create + list of two words (`createEpisode` 974,182 gas, `listEpisode` 2,638,817 with mock books)
- [x] **2.3** Sets: `mintSet`, `mintSetWithPermit`, `burnSet` â€” proof: `51424a7` Â· `forge test --match-contract SaysoMarketsSetsTest` 10/10, red first (0/10 against stage 2): real `vm.sign` permit, front-run permit still mints, invalid permit without allowance mints nothing, failed NO burn rolls back YES and counters; full offline `forge test` 64 passed, 1 fork suite skipped; local `anvil --network monad` mint 3 / burn 1 left YES = NO = sets = held AUSD = 2,000,000
- [x] **2.4** Trades: `buyYes`, `sellYes`, `buyNo`, `sellNo` + `Traded` â€” proof: YES side `59bac94` (SaysoMarketsTradesTest 10/10, red first); NO side this commit: `forge test --match-contract SaysoMarketsTradesNoTest` 12/12 (red first: collateral-shortfall test failed before `_requireCollateral`), full offline `forge test` 86 passed, 1 fork suite skipped; local `anvil --network monad` buyNo then sellNo kept held AUSD = totalSets (22,000,000 then 20,999,999), returned 195 YES base units of dust, left markets holding zero YES and NO. Fork test against live Kuru books stays with S2 (needs MON)
- [x] **2.5** Lifecycle: `flagSaid`, `markEvidence` (emits `EvidenceReady` batches), `closeEpisode` (emits `EpisodeClosed`) â€” proof: `forge test --match-contract SaysoMarketsLifecycleTest` 9/9, red first 0/9 (roles, live-window boundaries, no re-flag, batch membership and state, close clock and once-only, mint blocked and burn allowed after close); full offline `forge test` 95 passed, 1 fork suite skipped; local `anvil --network monad` with episodes paused: two flags (53,187 gas each), one `markEvidence` (58,528, one `EvidenceReady [1,2]`), `closeEpisode` (42,511), held AUSD = totalSets = 3,000,000, then `mintSet` reverted `EpisodeIsClosed`
- [x] **2.6** Receiver: inherit `ReceiverTemplate`; `_processReport` with every rejection rule; `redeem`; `voidWord` after 24 h (pays 0.5) â€” proof: Reports 11/11 + Redeem 8/8, red first (17 failing; the 2 vendor-guard tests already passed): 64-byte metadata, wrong forwarder, zero forwarder, workflow-id mismatch, forged report from a non-REPORTER `tx.origin`, unknown word, early No, duplicates, revert-all, odd Void splits; full offline `forge test` 113 passed, 1 fork suite skipped; local `anvil --network monad`: report (83,408 gas) â†’ YES redeem 3 AUSD â†’ 24 h timeout void â†’ odd YES and NO Void redemptions left `totalSets` 0 and 1 base unit of unsweepable surplus
- [x] **2.7** Handler-based invariant suite, SMART-CONTRACTS section 5 items 1â€“7 â€” proof: `invariant_marketSafety` 128 runs Ã— depth 64 = 8,192 calls, 0 handler reverts; 14 actions cover sets, all four trades, flags/evidence, close, authenticated/forged reports, timeout Void and odd redemptions. A one-unit collateral-loss probe failed before restoration. Full offline `forge test` 115 passed, 0 failed, 1 skipped in 9.20 s. Runtime handler smoke finalized Yes/No/Void and paid four redemptions: held AUSD 480,000,039 â‰¥ reserve 480,000,038, owner movement 0. `forge build --sizes`: SaysoMarkets runtime 19,803 B (4,773 below EIP-170, 111,269 below Monad's 128 KB)
- [x] **2.8** Gas: `forge test --gas-report` (113 permanent tests plus 2 throwaway probes passed, 1 fork suite skipped) and real AUSD/Kuru Monad fork at block 68,394,814 â†’ `packages/core/src/gas.ts`, `gasLimit(kind,count?)` returns measured +20% rounded up. Isolated snapshots for all episode/batch counts; actual local-fork eight-word create/list receipts used 3,395,766 / 9,559,637 gas with limits 4,074,920 / 11,471,565, both status 1; eight books fit the 30M transaction limit. Table and measurement limits in SMART-CONTRACTS section 8; live house-ladder/permit/forwarder overhead remeasurement stays gated by S1â€“S4
- [ ] **2.9** `Deploy.s.sol` to testnet with the simulation forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`; verify on Monadscan and MonadVision Â· needs DEPLOYER MON â€” proof: deployment log row, `cast code` non-empty, verification links
- [ ] **2.10** `packages/core/abi/sayso.ts` generated from forge artifacts; deployed addresses in `addresses.ts` â€” proof: generator check passes; `scripts/check-addresses.ts` green Â· generator and first export landed early so CRE and studio code import one ABI; regenerate after each contract stage; addresses wait on 2.9
- [ ] **2.11** Phase 2 review â€” proof: reviewer PASS in PROGRESS

**Acceptance:** all unit and invariant tests green; contracts deployed and verified; gas table filled; only the CRE forwarder can move a word to Yes or No.
**Proof recorded:** SMART-CONTRACTS deployment log and gas table; PROGRESS Phase 2.

## Phase 3 â€” Transcription and fixture Â· DOING

**Goal:** any clip becomes two committed transcripts, chunk files, two roots and a flag plan with one command, reproducibly.

- [x] **3.1** `tools/transcribe` Bun CLI â€” proof: `bun run --cwd tools/transcribe typecheck && bun run --cwd tools/transcribe test` â†’ exit 0, 29/29; two real runs on the fixture WAV (whisper.cpp 1.9.4 `ggml-base.en` `-l en -t 4 -ng -ml 1 -sow -ojf`; Vosk 0.3.45 `vosk-model-en-us-0.22`, Python 3.12 via `uv`, `SetWords(True)`) exit 0 and write ten byte-identical files outside the repo; printed `clipId 0xd32d252dâ€¦02cc43`, `rootA 0x1839363fâ€¦db7f`, `rootB 0x9fb6c343â€¦2e49`, block SAID 10,860 ms, market SAID 7,090 ms, four words NO (no agreement)
  - [x] runs `whisper-cli` 1.9.4 and Vosk 0.3.45 exactly as spike S7 did; engine and model paths come from `WHISPER_CLI`, `WHISPER_MODEL`, `VOSK_MODEL` (optional `VOSK_PYTHON_PROJECT`)
  - [x] normalises, chunks, hashes and roots with `packages/core` only; writes `<out>/<id>/{clip.json,flag-plan.json,chunks/{A,B}/<index>.json}` and refuses an `--out` inside the repo
  - [x] prints `clipId`, `rootA`, `rootB` and the flag plan
- [x] **3.2** `clips/fixtures/tts-market/`: a 32,090 ms team-generated CC0 speech clip (Windows TTS via tracked `generate.ps1`; no media tracked) with manifest, both engines' chunks, expected roots and flag plan, used by transcribe, CRE and studio tests â€” proof: `tools/transcribe/src/fixture.test.ts` recomputes every leaf, proof, both roots and the flag plan from the tracked chunks and compares them byte for byte â†’ 29/29; the real CLI output matched all nine tracked payload files. Deviation: TTS instead of a public-domain recording keeps the fixture licence-free and the words known; regenerating on another Windows voice changes the media hash, so the tracked chunks, not the WAV, are the reference
- [ ] **3.3** Clip library in studio data (untracked): 8+ clips of 3â€“5 min, 6 curated words each (agreed-said words and decoys), licence recorded per clip Â· needs cleared clips (BLOCKERS 6) â€” proof: library manifest count and licence column

**Acceptance:** rerunning the pipeline on the fixture reproduces the tracked roots byte for byte.
**Note:** the S7 NASA clips are research inputs only; NASA's media guidelines bar implying endorsement of crypto activity, so episode clips need their own clearance [V: S7 report].

## Phase 4 â€” CRE resolver Â· DOING

**Goal:** CRE alone turns committed evidence into a Yes/No report that the contract accepts, and tampered evidence produces nothing.

- [x] **4.1** `cre/resolver` TypeScript workflow on SDK 1.23.0, `monad-testnet` target, strict config for the `SaysoMarkets` address, reveal API base URL and report gas â€” built by hand because `cre init` needs login â€” proof: `bun x --no-install cre-compile src/main.ts <tmp>.wasm` builds the WASM with no CRE auth, also from a clean `bun install --frozen-lockfile` (4,244,093 bytes, `\0asm` header); `cre workflow simulate` itself moves to 4.3
- [x] **4.2** Handler 0 (`EvidenceReady`) and handler 1 (`EpisodeClosed`) exactly as the `cre-resolver` skill; any missing, malformed or tampered chunk aborts the whole report â€” proof: `bun run --cwd cre/resolver test` 19/19 on core-built fixtures (agree â†’ Yes, false flag â†’ No at close, one engine only â†’ No, >1,500 ms apart â†’ No, tampered token/leaf/root â†’ no report, missing chunk â†’ no report, wrong clip/episode rejected, report ABI decodes as `(uint32,uint256[],uint8[],bytes32)` with Yes = 2, No = 3); root `bun run verify` 215/215
- [ ] **4.3** Simulation without broadcast, then `--broadcast` on a staged episode â€” proof: report tx hash, `WordResolved` events, latency from close to last resolution

**Acceptance:** a staged episode settles every word through the simulation forwarder; tampered data produces no report.

## Phase 5 â€” Studio Â· DOING

**Goal:** an episode runs end to end on testnet with nobody from the team online.

- [x] **5.1** Hono app, config, SQLite schema from ERD section 3, `GET /v1/time`, `GET /v1/health` â€” proof: `bun run --cwd apps/studio test` 22/22 on real `bun:sqlite` (Vitest runs inside Bun; under Node it cannot load `bun:sqlite`), schema applies to an empty DB, config refuses `CHAIN_ID` â‰  10143 and JSON/inspect output carries no key material; production `main.ts` against a local fake RPC answered `/v1/time` and `/v1/health` (`status ok`, head lag 796 ms, last CRE run with its mode)
- [x] **5.2** Clip library loader and reveal API `/v1/episodes/:id/chunks/:engine/:index`; schedule enforced (`startsAt + chunkEnd + 2,000 ms`, inclusive), full reveal once the episode is Closed or Settled â€” proof: same run covers fixture ingest, tampered chunk and root mismatch refused, boundary âˆ’ 1 ms â†’ empty `425`, exact boundary â†’ payload, unknown episode/engine/index â†’ empty `404`; live smoke: `curl` chunk A/3 of a Live episode â†’ `425 Too Early` with no body, of a Closed episode â†’ `200` with tokens, leaf and proof
- [ ] **5.3** Scheduler (hourly + on-demand `POST /v1/episodes`, one at a time) and runner: create, list, seed, clock, `actions` execution with explicit gas and per-key nonce streams â€” proof: runner test on a fake chain; one live episode
- [ ] **5.4** House market maker: ladder seeding, quote pull at `t âˆ’ 400 ms`, 0.98 bid on SAID, cancel at close, post-settlement withdraw and redeem â€” proof: live tx hashes for each action
- [ ] **5.5** `flagSaid` at `t`, `markEvidence` batches at chunk boundaries, `closeEpisode` at end; SSE `/v1/episodes/:id/stream` â€” proof: flag latency log under 1 s
- [ ] **5.6** CRE runner (simulation mode): watch `EvidenceReady` and `EpisodeClosed`, run the simulate command, record `cre_runs` â€” proof: `cre_runs` rows with report tx hashes
- [ ] **5.7** Starter drip: once per address, rate-limited by IP hash, MON + AUSD, refuses when DRIP is low (ARCHITECTURE section 10 budget) â€” proof: first drip succeeds, repeat refused, low-balance refusal tested
- [ ] **5.8** `deploy/` systemd unit and Caddy config; full episode against testnet from a local run â€” proof: episode id, all tx hashes, timings in PROGRESS

**Acceptance:** an on-demand episode is created, listed, seeded, flagged on time (latency logged under 1 s), closed, settled by CRE and its house inventory recycled with no human action.

## Phase 6 â€” Indexer Â· TODO

**Goal:** trade feed, positions and leaderboard come from Envio HyperIndex.

- [ ] **6.1** Envio 3.12.1 config for `SaysoMarkets` + dynamic `OutcomeToken` registration from `WordAdded`; schema from ERD section 2; add `indexer` to Bun workspaces â€” proof: `codegen` succeeds; local sync reaches head
- [ ] **6.2** Handlers for every event; profit = cashIn âˆ’ cashOut + settledValue, unsettled excluded (ERD) â€” proof: Envio test helpers cover each event
- [ ] **6.3** Spike S6 hosting decision and deployment; GraphQL URL documented â€” proof: query answered from the host

**Acceptance:** after a full episode, `Player.profit` matches a hand calculation from receipts for two players.

## Phase 7 â€” Web Â· TODO

**Goal:** a phone completes the PRD section 10 path, and it looks like SAYSO, not a template.

- [ ] **7.1** Vite + TanStack Router SPA, PWA manifest (standalone, portrait), Tailwind, routes S1â€“S8, query client, studio and indexer clients â€” proof: `bun run --cwd apps/web build`; routes render at 412 px
- [ ] **7.2** Design pass first: display, body and tabular fonts; colour tokens (studio dark, tally red, gain); split-flap card and haptic tick; recorded in PRD section 8 â€” proof: one rendered screen shown to the user and approved before 7.3
- [ ] **7.3** S1 Join + Mera session + restore (`mera-passkeys` skill), PRF-unavailable screen
- [ ] **7.4** S2 Arena: schedule, start episode, starter balance status
- [ ] **7.5** S3 Episode (synced video, word board, flip at presentation time) and S4 Ticket (block-sequenced transactions, cash out on SAID)
- [ ] **7.6** S5 Results with evidence links, S6 Portfolio with redeem all, S7 Leaderboard, S8 Account
- [ ] **7.7** Playwright at 412 px with a PRF-capable virtual authenticator: join, trade, flip, cash out, redeem, clear storage, restore â€” proof: green run; every screen screenshotted into `handoff\sayso\screens\`

**Acceptance:** the PRD section 10 path works on a real phone against testnet; S5 (Mera on devices) passes at the real domain.

## Phase 8 â€” Ship Â· TODO

**Goal:** judges can use it unaided from 14 to 27 Oct, and the README proves every bounty claim.

- [ ] **8.1** Deploy web, studio and indexer to the VPS and domain; set `VITE_RP_ID` before any real passkey Â· needs VPS + domain â€” proof: HTTPS URL, `/v1/health` green
- [ ] **8.2** CRE deploy if access arrived (`setForwarderAddress`, `setExpectedWorkflowId`, `CRE_MODE=don`); else keep simulation and say so â€” proof: workflow id or the stated mode in README
- [ ] **8.3** Rehearsal with 10+ real players â€” proof: episodes, players, trades, flag and settlement latency recorded
- [ ] **8.4** `README.md`: one-liner, TESTNET, video, how it works (mermaid), why Monad, bounty table (requirement â†’ feature â†’ code path â†’ video timestamp), addresses and tx hashes, settlement mode, run locally, AI-tool disclosure, licence
- [ ] **8.5** Demo video under 3 minutes showing the never-cut path (script in `handoff\sayso\VIDEO.md`)

**Acceptance:** a tester completes the PRD section 10 path alone on a phone from the public URL; README links resolve.
