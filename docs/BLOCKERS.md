# SAYSO blockers

Tracked delivery gates. Updated 2026-10-08. Product requirements remain in [PRD](PRD.md); implementation status and acceptance proof remain in [BUILD-PLAN](technical/BUILD-PLAN.md). This is the canonical blocker register; the external handoff ledger links here rather than maintaining a competing list.

## Open gates

| ID | Gate and evidence | Blocks | Owner / next action | Closure proof |
|---|---|---|---|---|
| B02 | CRE authentication unavailable [V: previous CLI 1.36.0 workflow attempts stopped at `not logged in`; recorded in the handoff ledger]. Current authenticated session is not assumed. DON deploy approval is a separate gate. | S4, resolver 4.3 and real simulation-runner broadcast proof. | User: create the account at https://app.chain.link/cre/discover and complete local `cre login`; request deployment access with `cre account access`. Do not paste credentials or a signing key into chat. Lead then verifies the account, supported chain and non-broadcast staged run before any broadcast. | Authenticated Monad-testnet dry run, then authorized report transaction with matching receiver `WordResolved` events. DON mode additionally needs approved workflow ID. |
| B03 | No deployed SAYSO receiver/config [V: resolver config has explicit deployment placeholders; `indexer/config.yaml` has receiver `address: []` and `start_block: 0`]. This is dependent on B01, not a request to invent an address. | 2.10 addresses, 4.3 resolver, 6.1 live indexing, production studio composition. | Lead after B01: deploy fail-closed authenticated contracts, `cast code` receiver, record deployment block and explorers, generate resolver/indexer config from those facts. | Nonempty receiver bytecode, verification links, exact creation block; indexer sync reaches head and resolver report uses the same receiver. |
| B05 | Production host not supplied [U: VPS SSH host/user and service destination absent from the handoff ledger]. | Hosted studio/web/media, 5.8 deployment, 8.1 public demo and unattended judging. | User: provide host/user and an approved SSH access route through local configuration; no passwords or keys in chat. Lead can prepare service configuration without inventing a host. | Deployed service survives restart, HTTPS health passes and a judge can launch an episode unaided. |
| B06 | Stable production domain / relying-party ID undecided [U: handoff item 4]. Choosing the RP ID after real passkeys exist breaks account portability. | Device spike S5, first real passkey enrollment and production web deployment. | User: choose the permanent SAYSO domain/subdomain. Lead sets HTTPS and `VITE_RP_ID` before real enrollment. | iOS and Android create/sign/clear-storage/restore the same address at that exact origin. |
| B07 | Cleared clip library incomplete [V: BUILD-PLAN 3.3 requires **8+ clips**, each 3–5 minutes with six curated words]. No exact football/MPL source or redistribution clearance supplied [U]. Screen recording is not evidence of ownership; the loader currently accepts only `team-recorded`, `public-domain`, `CC0` [V: `library.ts` / transcribe manifest]. | 3.3, repeat judge sessions and final media licensing proof. | Lead/user: prefer original team/creator commentary with consent and no third-party broadcast/music. For a broadcast, first identify the exact source/rightsholder and obtain permission for clipping, hosting, public replay and the disclosed testnet word-market context; then add an accurately reviewed licence contract before ingest, never relabel it team-recorded. Licensing research/recording guidance lives in [INTEGRATIONS §7](technical/INTEGRATIONS.md#7-transcription-offline-free). Keep actual media/manifests/transcripts/flag plans outside git. | Eight or more compliant clips ingested with committed roots and retained source/licence evidence; no early public outcomes. |
| B08 | Team eligibility/registration unconfirmed [U: handoff item 5]. | Metropolis submission readiness. | User: confirm registered SAYSO team and that no member is registered on another Metropolis project. | Registration/eligibility confirmed by the user; no credentials or personal membership details needed in git. |
| B09 | Indexer hosting decision not proved [U: S6]. Linux/WSL codegen and handler tests are already available; native Windows CLI support is **not** an unresolved blocker. | 6.3 hosted GraphQL and web read models. | Lead: choose self-hosting on the supplied VPS or hosted Envio after B03. User only needs an Envio hosted account if that option is chosen. | Public GraphQL query returns indexed testnet episode/trade/position data; two-player profit matches receipts. |
| B10 | Indonesian/bilingual sports commentary is not validated [V: CLI fixes Whisper to `-l en`, pinned model is `ggml-base.en`, second engine `vosk-model-en-us-0.22`]. Noisy overlapping commentary/domain-name accuracy is also unmeasured [U: expanded S7]. | Indonesian football/MPL episode selection, not the English fixture or all backend work. | Lead: use clear original English speech for the first library. If Indonesian clips are required, run a separate two-engine/model + ground-truth timestamp spike before changing the pipeline; do not translate transcripts or weaken agreement to force a flag. User supplies one cleared representative sample for that spike. | Both independent engines agree against reviewed spoken-word/timestamp ground truth on representative clips; deterministic commitments and unchanged agreement tests pass, or the clip is rejected. |
| B11 | Sound effects come from the free ElevenLabs plan [V: user statement 2026-10-07; key lacks `user_read`, so the tier cannot be read via API]. Free-plan output is non-commercial and must credit "elevenlabs.io" ([terms](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform.md)) [V]. | Public use of `apps/web/public/sfx/` in the demo and judging deployment. | Lead: keep "Sound effects: elevenlabs.io" in the S0 footer, S8 and README. User: optionally regenerate on a paid plan before submission for a commercial licence. | Attribution visible in the deployed footer/S8 and README, or sounds regenerated under a paid plan. |

## Closed gates

| ID | Gate | Closure proof |
|---|---|---|
| B01 | Ops wallets unfunded | [V: 2026-10-08 `cast balance`] DEPLOYER 10, OPERATOR 15, BOT 15, DRIP 60, REPORTER 5 testnet MON (user funded); the first funded transactions are the S1 faucet receipts. |
| B04 | AUSD faucet cadence and BOT/DRIP inventory unproved | [V: 2026-10-08, BUILD-PLAN S1] two live `requestFunds` receipts paid 10,000 AUSD each to DRIP and BOT; the global limit reopened within 66 s. House and drip receipt proofs remain under BUILD-PLAN 5.4 and 5.7. |

## Public testnet funding destinations

Public EOAs, not contract dependencies or credentials. Their balances closed B01; their keys stay outside git.

| Role | Monad testnet address |
|---|---|
| DEPLOYER | `0x59c9dBfc47aAf5521EBBa04df9C51dF7260e352a` |
| OPERATOR | `0xf1C053127c04286eD02C2142e7eBa0121295770e` |
| BOT | `0xF2fE2d9FD723B59CDbee3bBC13275d967A3EcCB4` |
| DRIP | `0x32D5023d8d5E2786eF9006DD06306B9b9220a34C` |
| REPORTER | `0x77A2b406D29805984d1C7BDA40df11acb525522f` |

## Working rules

- Continue unblocked code, local runtime proofs and documentation while external gates remain open. Never replace live acceptance with mocks, local forks or a source-review PASS.
- Add new blockers with an observed failure or an explicitly labelled unresolved prerequisite, affected BUILD-PLAN items, the smallest owner action and concrete closure proof.
- Keep closed entries with their proof instead of silently deleting history. Never store keys, credentials, `.env` values or private studio data here.
- The rejected early dark web prototype is recorded in handoff progress. The approved direction is [DESIGN](DESIGN.md) (2026-10-07).
