# SAYSO build plan

The live tracker for the build: every phase, every task, what proves it and where the proof lives. **Tick a box in the same commit as the work it describes.** Product rules live in [PRD](../PRD.md); this file only says what gets built, in what order, and how we know it works.

## How to read this file

- `- [x] **2.3** <task> — proof: <commit> · <command → observed result>` is done, with the evidence.
- `- [ ] **2.3** <task> — proof: <exact command or artefact required>` is open.
- Phase status: `TODO / DOING / DONE / BLOCKED / CUT`. A phase is DONE only when every box is ticked and the phase review passed.
- Labels: [V] verified by a command or source, [I] inference, [U] unresolved with the spike that settles it.
- Spike scratch work lives outside the repo in `handoff\sayso\spikes\`; results land in [INTEGRATIONS](INTEGRATIONS.md) section 9.

## Status at a glance (2026-10-05)

| Phase | Status | Done | Next action | Blocked by |
|---|---|---|---|---|
| 0 Workspace | DONE | 3/3 | none | none |
| 1 Core (TDD) | DOING | 8/10 | Phase 0+1 review, PROGRESS entry | none |
| Spikes | DOING | 1/6 | Fix the S2+S3 fork probe, then run it live | S1–S4 need MON; S4 needs the CRE CLI and account |
| 2 Contracts | TODO | 0/11 | 2.1 OutcomeToken tests | deploy (2.9) needs DEPLOYER MON |
| 3 Transcription | TODO | 0/3 | 3.1 transcribe CLI | 3.3 needs cleared clips |
| 4 CRE resolver | TODO | 0/3 | 4.1 `cre init` | CRE CLI install and login |
| 5 Studio | TODO | 0/8 | 5.1 Hono skeleton | live run needs funded keys |
| 6 Indexer | TODO | 0/3 | 6.1 after Phase 2 events are final | none |
| 7 Web | TODO | 0/7 | 7.2 design pass, one screen shown to the user | S5 needs the real domain |
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

- [x] **0.1** Bun workspace root, Biome 2.5.15, shared tsconfig (TS 7.0.2), `.env.example` with every key from ARCHITECTURE section 10 — proof: `50d8874` · clean clone `bun install && bun run verify` green
- [x] **0.2** `packages/core` skeleton with Vitest — proof: `44b625e` · Vitest 4/4
- [x] **0.3** Foundry with solc 0.8.37, Prague, Soldeer deps (forge-std 1.17.0, OZ 5.7.0 + upgradeable) — proof: `f265eee` · `forge soldeer install && forge build` exit 0; a throwaway OZ + forge-std import compiled with 0 warnings and was deleted

**Acceptance:** `bun run verify` and `forge build` green from a clean clone; `.env.example` complete; every commit authored by Febri Nirwana.
**Proof recorded:** `handoff\sayso\PROGRESS.md` Phase 0. Review folded into the Phase 1 review (1.9).

## Phase 1 — `packages/core` (TDD) · DOING

**Goal:** every rule that web, studio and CRE must agree on exists once, as pure tested TypeScript.

- [x] **1.1** `match.ts`: `normalizeToken`, `isValidTarget`, `matchesTarget`, `agreedSpokenTime`; every vector in the `word-matching` skill is a test — proof: `4a56950`
- [x] **1.2** `transcript.ts`: 10 s chunks, canonical token JSON, `leafHash`, `evidenceHash` per ARCHITECTURE section 6 — proof: `dae37c5` · 21 cases incl. boundary chunks and empty chunks
- [x] **1.3** `merkle.ts` with commutative keccak pairs; vectors exported to `contracts/test/fixtures/merkle.json` — proof: `3757459` · `forge test` 2/2, OpenZeppelin `MerkleProof` accepts the TypeScript roots and rejects a flipped leaf
- [x] **1.4** `units.ts`: prices on 100-tick grid 100..9900, sizes, AUSD helpers, BigInt only — proof: `1a3f39e` · boundaries 0.01, 0.50, 0.98, 0.99 tested
- [x] **1.5** `nickname.ts`: deterministic two-word name, checksum-insensitive — proof: `31cb946`
- [x] **1.6** Vendored Kuru OrderBook, Router, MarginAccount ABIs + `SOURCE.md` (`@kuru-labs/kuru-sdk@0.0.95`) — proof: `273f726`
- [x] **1.7** `addresses.ts` (testnet only) + `scripts/check-addresses.ts` (`cast code` each) — proof: `7b14999`
- [x] **1.8** One package entry exporting every module — proof: `59da66d` · `bun run verify` 159/159 tests; entry lists 43 exports
- [ ] **1.9** Phase 0+1 review (reviewer subagent) — proof: PASS against both acceptance lists in PROGRESS; findings fixed in `fix(core): close the review findings for phase 1`
- [ ] **1.10** PROGRESS entry for Phase 1 and spike S7 — proof: entry lists commits, checks and rulings

**Acceptance:** all vectors pass; Merkle vectors byte-identical between TypeScript and Foundry; no I/O in `packages/core/src` (no `fs`, `fetch`, timers or randomness outside tests).
**Moved out:** `abi/sayso.ts` → 2.10; `gas.ts` → 2.8.

## Spikes · DOING

Each spike answers one question with on-chain or on-device evidence, then writes its result into INTEGRATIONS section 9 in its own commit. Scratch code stays in `handoff\sayso\spikes\<id>\`.

- [ ] **S1** AUSD faucet supply · BLOCKED (DRIP has 0 MON)
  - [ ] two timed `requestFunds(DRIP)` broadcasts; amount and cadence recorded — proof: tx hashes + `balanceOf` before/after
  - [ ] if unusable: switch `AUSD` config to Kuru testnet USDC and say so in INTEGRATIONS and PRD
- [ ] **S2 + S3** Kuru book from a contract · DOING
  - [x] fork probe drafted: `spikes\s3\test\KuruProbe.t.sol` (149 lines) deploys a token and its book via `Router.deployProxy(0, …)`
  - [ ] probe compiles — currently `Stack too deep` (observed 2026-10-05); use `via_ir` or split locals
  - [ ] fork run green, including `test_ausdQuote` (last recorded run failed it)
  - [ ] live run from BOT: provision a flip ladder, contract-side `placeAndExecuteMarketBuy/Sell` with `isMargin = false` — proof: tx hashes; who is debited; where tokens land; `quoteSize` units; one live `Trade` log
- [ ] **S4** CRE on Monad testnet · BLOCKED (CLI not installed; user account)
  - [ ] CRE CLI 1.36.0 installed; `cre login`; `cre account access` requested — proof: `cre version`, access request id
  - [ ] `cre workflow supported-chains --output json` lists `monad-testnet`
  - [ ] a minimal `ReceiverTemplate` consumer receives a report via `simulate --broadcast` — proof: report tx hash and decoded event
- [ ] **S5** Mera PRF at the real domain on iOS Safari and Android Chrome (runs in Phase 7) — proof: create, sign, clear storage, restore the same address on both
- [ ] **S6** Envio hosting choice (runs in Phase 6) — proof: GraphQL query answered from the chosen host
- [x] **S7** Engine agreement — proof: `76f9a65` · three NASA clips, agreement 89–95 %, median skew 90–290 ms, p99 ≤ 1,220 ms; keep 1,500 ms [I]; Vosk pinned to 0.3.45 (0.3.50 has no wheel)

## Phase 2 — Contracts (Foundry, TDD) · TODO

**Goal:** `SaysoMarkets` + `OutcomeToken` + `KuruTrade` deployed on testnet, verified, with every rule in [SMART-CONTRACTS](SMART-CONTRACTS.md) enforced by a test.

- [ ] **2.1** `OutcomeToken`: clone-initializable ERC-20, 6 decimals, mint/burn only by markets, markets as trusted spender — proof: unit tests for init-once, unauthorised mint/burn revert, allowance-free transfer by markets
- [ ] **2.2** `SaysoMarkets` storage, roles, `createEpisode` (roots A/B committed), `listEpisode` via `KuruTrade` — proof: tests with mock router/book; event payloads asserted
- [ ] **2.3** Sets: `mintSet`, `mintSetWithPermit`, `burnSet` — proof: tests incl. ERC-2612 permit path and burn after partial trades
- [ ] **2.4** Trades: `buyYes`, `sellYes`, `buyNo`, `sellNo` + `Traded` — proof: tests shaped by S2+S3 findings; fork test against testnet Kuru once S2 passes
- [ ] **2.5** Lifecycle: `flagSaid`, `markEvidence` (emits `EvidenceReady` batches), `closeEpisode` (emits `EpisodeClosed`) — proof: role and state-transition tests
- [ ] **2.6** Receiver: inherit `ReceiverTemplate`; `_processReport` with every rejection rule; `redeem`; `voidWord` after 24 h (pays 0.5) — proof: tests with 64-byte metadata, wrong forwarder, wrong workflow id, unknown word, early No
- [ ] **2.7** Invariant suite, SMART-CONTRACTS section 5 items 1–7 — proof: `forge test --match-contract Invariant` green, runs and depth recorded
- [ ] **2.8** Gas: `forge test --gas-report` → `packages/core/src/gas.ts` (measured + 20 %); confirm an eight-word `listEpisode` fits the 30M tx limit or lower the cap and update PRD — proof: gas table in SMART-CONTRACTS
- [ ] **2.9** `Deploy.s.sol` to testnet with the simulation forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`; verify on Monadscan and MonadVision · needs DEPLOYER MON — proof: deployment log row, `cast code` non-empty, verification links
- [ ] **2.10** `packages/core/abi/sayso.ts` generated from forge artifacts; deployed addresses in `addresses.ts` — proof: generator check passes; `scripts/check-addresses.ts` green
- [ ] **2.11** Phase 2 review — proof: reviewer PASS in PROGRESS

**Acceptance:** all unit and invariant tests green; contracts deployed and verified; gas table filled; only the CRE forwarder can move a word to Yes or No.
**Proof recorded:** SMART-CONTRACTS deployment log and gas table; PROGRESS Phase 2.
