# SAYSO blockers

Tracked delivery gates. Updated 2026-10-06. Product requirements remain in [PRD](PRD.md); implementation status and acceptance proof remain in [BUILD-PLAN](technical/BUILD-PLAN.md). This is the canonical blocker register; the external handoff ledger links here rather than maintaining a competing list.

## Open gates

| ID | Gate and evidence | Blocks | Owner / next action | Closure proof |
|---|---|---|---|---|
| B01 | Ops wallets unfunded [V: 2026-10-06 `cast balance <public role address> --rpc-url https://testnet-rpc.monad.xyz` returned **0 wei for DEPLOYER, OPERATOR, BOT, DRIP and REPORTER**]. | Live S1–S4, contract deployment 2.9, live house/flags/drip and CRE broadcast. Local forks do not close these items. | User: claim **testnet** MON at https://faucet.monad.xyz/ and fund role wallets listed below. Target amounts live in [ARCHITECTURE §10](technical/ARCHITECTURE.md#10-runtime-and-hosting). Fund DEPLOYER first to unlock deployment. Never send real/mainnet money. | Public balance receipts meet the measured gas budget; funded deployment/transactions have successful testnet receipts. |
| B02 | CRE authentication unavailable [V: previous CLI 1.36.0 workflow attempts stopped at `not logged in`; recorded in the handoff ledger]. Current authenticated session is not assumed. DON deploy approval is a separate gate. | S4, resolver 4.3 and real simulation-runner broadcast proof. | User: create the account at https://app.chain.link/cre/discover and complete local `cre login`; request deployment access with `cre account access`. Do not paste credentials or a signing key into chat. Lead then verifies the account, supported chain and non-broadcast staged run before any broadcast. | Authenticated Monad-testnet dry run, then authorized report transaction with matching receiver `WordResolved` events. DON mode additionally needs approved workflow ID. |
| B03 | No deployed SAYSO receiver/config [V: resolver config has explicit deployment placeholders; `indexer/config.yaml` has receiver `address: []` and `start_block: 0`]. This is dependent on B01, not a request to invent an address. | 2.10 addresses, 4.3 resolver, 6.1 live indexing, production studio composition. | Lead after B01: deploy fail-closed authenticated contracts, `cast code` receiver, record deployment block and explorers, generate resolver/indexer config from those facts. | Nonempty receiver bytecode, verification links, exact creation block; indexer sync reaches head and resolver report uses the same receiver. |
| B04 | AUSD faucet cadence and funded BOT/DRIP inventory remain unproved live [U: S1; real-AUSD local fork is not a faucet cadence proof]. | Reliable house restocking and first-player drip; autonomous funded episodes. | Lead after B01: execute the two timed faucet requests, measure amount/cadence, then fund BOT/DRIP against actual inventory consumption. | Two successful request receipts and recorded interval/amount; sufficient observable AUSD balances; house and drip real receipt proofs. |
| B05 | Production host not supplied [U: VPS SSH host/user and service destination absent from the handoff ledger]. | Hosted studio/web/media, 5.8 deployment, 8.1 public demo and unattended judging. | User: provide host/user and an approved SSH access route through local configuration; no passwords or keys in chat. Lead can prepare service configuration without inventing a host. | Deployed service survives restart, HTTPS health passes and a judge can launch an episode unaided. |
| B06 | Stable production domain / relying-party ID undecided [U: handoff item 4]. Choosing the RP ID after real passkeys exist breaks account portability. | Device spike S5, first real passkey enrollment and production web deployment. | User: choose the permanent SAYSO domain/subdomain. Lead sets HTTPS and `VITE_RP_ID` before real enrollment. | iOS and Android create/sign/clear-storage/restore the same address at that exact origin. |
| B07 | Cleared clip library incomplete [V: BUILD-PLAN 3.3 requires **8+ clips**, each 3–5 minutes with six curated words]. The tracked TTS fixture is test evidence, not a completed public library. | 3.3, repeat judge sessions and final media licensing proof. | Lead: assemble cleared alternatives and retain source/license evidence. User-supplied team clips help but do not waive the eight-clip requirement. NASA research inputs are not approved episode media (BUILD-PLAN Phase 3 note). Keep real media/manifests/transcripts/flag plans outside git. | Studio ingest accepts eight or more compliant clips and committed roots; source/license evidence recorded without exposing outcomes. |
| B08 | Team eligibility/registration unconfirmed [U: handoff item 5]. | Metropolis submission readiness. | User: confirm registered SAYSO team and that no member is registered on another Metropolis project. | Registration/eligibility confirmed by the user; no credentials or personal membership details needed in git. |
| B09 | Indexer hosting decision not proved [U: S6]. Linux/WSL codegen and handler tests are already available; native Windows CLI support is **not** an unresolved blocker. | 6.3 hosted GraphQL and web read models. | Lead: choose self-hosting on the supplied VPS or hosted Envio after B03. User only needs an Envio hosted account if that option is chosen. | Public GraphQL query returns indexed testnet episode/trade/position data; two-player profit matches receipts. |

## Public testnet funding destinations

These are public EOAs, not contract dependencies or credentials. Their balances were read for B01; no transaction was sent.

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
- The rejected early web prototype is recorded in handoff progress. Redesign is planned Phase 7 work, not a reason to stall backend implementation.
