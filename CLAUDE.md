# SAYSO working guide

## 1. What this is

SAYSO runs word markets on replayed video clips: six words per episode, each trading 0 to 1 AUSD on its own Kuru book. A spoken word flips SAID within a block; Chainlink CRE settles it from two committed transcripts. Players use Mera passkeys only.
Read `docs/PRD.md` before any product, copy or scope decision.

## 2. Deadline

Metropolis submission Tue 13 Oct 2026 11:59 PM ET (Wed 14 Oct 10:59 WIB). Internal target Tue 13 Oct 18:00 WIB.
Judging runs 14 to 27 Oct 2026: the web app, the studio and the indexer must stay up and a judge must be able to start an episode alone.

## 3. Testnet first

Monad testnet 10143 for every contract, token and market. No real money, no mainnet deploy, no fiat path.
Show TESTNET wherever a balance, price or payout appears.

## 4. Non-negotiable rules

The full list and the pre-commit checklist are in `.claude/skills/sayso-rules/SKILL.md`. The ones that break the product if missed:

1. Transcript roots are onchain before the first trade; nothing after can change an outcome.
2. Never leak an outcome: manifests, transcripts and flag plans are untracked studio data; chunks reveal at end + 1.5 s + margin.
3. Only the CRE forwarder settles a word. The operator flags; the owner can only void after 24 h without a report.
4. The house never quotes from transcript knowledge; players only send immediate-or-cancel orders.
5. Mera is the whole account layer; PRF output and keys never leave memory.
6. Chain is truth; Envio and SQLite are read models.
7. Explicit gas on every transaction (Monad bills the limit); sequence each sender by block.
8. `cast code` every address before it enters code or docs.
9. External facts carry [V] with source, [I], or [U] with the spike that settles them (`docs/technical/INTEGRATIONS.md` section 9).
10. No generic AI interface: PRD section 8 and `docs/DESIGN.md` govern every screen.

## 5. Repo map

| Path | Owns |
|---|---|
| `apps/web` | PWA landing and screens, Mera session, signing, block-sequenced transactions, voxel and sound assets |
| `apps/studio` | Scheduler, episode clock, flags, house market maker, drip, reveal API, CRE runner, health |
| `packages/core` | Matcher, chunking, Merkle, units, nickname, gas table, vendored ABIs; pure, no I/O |
| `contracts` | `SaysoMarkets`, `OutcomeToken`, `KuruTrade`; Foundry tests and scripts |
| `cre/resolver` | CRE workflow: two log-trigger handlers, proof checks, report |
| `indexer` | Envio HyperIndex config, schema, handlers |
| `tools/transcribe` | Offline two-engine transcription, chunks, roots |
| `tools/sfx` | Offline ElevenLabs sound effects and ffmpeg mastering |
| `clips/fixtures` | The one tracked test clip |
| `docs` | Product, technical, lessons |
| `.claude/skills` | Vendored and project skills |
| `.omp/agents` | Persona subagents: `visual-designer`, `sound-engineer` |

## 6. Commands

Commands exist once their owning phase lands; never report one as run before it exists.

| Command | Purpose |
|---|---|
| `bun install` | Install workspaces |
| `bun run verify` | Typecheck, Biome, Vitest across workspaces |
| `bun run --cwd apps/web dev` | Web on a phone-sized viewport |
| `bun run --cwd apps/studio dev` | Studio against testnet with `.env` (needs `RPC_URL`, `CHAIN_ID=10143`, `STUDIO_DATA_DIR`; ingests `STUDIO_DATA_DIR/clips` at start) |
| `forge soldeer install` (in `contracts`) | Restore pinned forge-std and OpenZeppelin from `soldeer.lock` after a clean clone |
| `forge test` (in `contracts`) | Unit and invariant tests; add `--gas-report` when gas changes |
| `bun packages/core/scripts/export-sayso-abi.ts [--check]` | Regenerate (or check) `packages/core/abi/sayso.ts` from `forge build` artifacts after any contract interface change |
| `bun run --cwd tools/transcribe transcribe -- --media <file> --manifest <manifest.json> --out <studioDataDir>` | Offline Whisper + Vosk transcription into studio data outside the repo; `--help` lists env and file contract |
| `bun run --cwd tools/sfx generate -- [--only <ids>]` / `measure` | Generate and master DESIGN section 10 sounds from ElevenLabs (`ELEVEN_LABS_API_KEY`) into `apps/web/public/sfx`; `measure` checks every file against its targets |
| `cre workflow simulate . --target monad-testnet --non-interactive --trigger-index <i> ...` (in `cre/resolver`) | Resolver run; see `cre-resolver` skill and INTEGRATIONS section 3 |
| `bun x --no-install cre-compile src/main.ts <out>.wasm` (in `cre/resolver`) | Build the resolver WASM without CRE login |
| `bun run --cwd indexer codegen` / `dev` | Envio generation and local indexer (Linux/macOS; Windows uses WSL). `dev` requires deployed/cast-code-verified receiver config |

Bun installs and runs scripts; Node 24 runs Vite and Vitest, except `apps/studio`, whose tests run Vitest inside Bun (`bun --bun vitest run`) to exercise `bun:sqlite`.

With the indexer workspace present, full `bun run verify` requires Linux/macOS (WSL on Windows): Envio 3.12.1 does not publish a Windows CLI native addon. Keep indexer checks enabled rather than bypassing them.

## 7. Docs table

Each document owns one subject. Cross-reference; never duplicate a competing fact.

| Document | Owns |
|---|---|
| `docs/PRD.md` | Product, episode rules, screens, design principles, bounties, scope |
| `docs/DESIGN.md` | Colour, type, shape, layout, motion, 3D, illustration assets, sound, copy |
| `docs/technical/BUILD-PLAN.md` | Phases, task checklist with proof, spike status, schedule; tick boxes in the same commit as the work |
| `docs/BLOCKERS.md` | External delivery gates, owner actions, observed blocker evidence and closure proof |
| `docs/technical/ARCHITECTURE.md` | Components, repo layout (built vs planned), flows, transcript commitment, trust model, pinned stack, hosting, MON budget |
| `docs/technical/INTEGRATIONS.md` | Monad, Kuru, CRE, Mera, AUSD, Envio, transcription facts and spikes |
| `docs/technical/SMART-CONTRACTS.md` | Contract storage, functions, events, invariants, deployment log |
| `docs/technical/ERD.md` | Chain, Envio, SQLite and payload schemas |
| `docs/LESSONS.md` | Durable causes and rules |
| `README.md` | Judge-first demo, requirement proof, addresses, setup, AI disclosure |

## 8. Skills

Load the matching skill before acting.

| Situation | Skill |
|---|---|
| Any change or commit | `sayso-rules` |
| New feature or behaviour | `brainstorming`, then `writing-plans` |
| Executing a plan | `executing-plans`, `subagent-driven-development` |
| Code | `test-driven-development` |
| Bug or surprise | `systematic-debugging` |
| Claiming done | `verification-before-completion` |
| Matching, flags, outcomes | `word-matching` |
| Sets, prices, Kuru, house maker | `outcome-markets` |
| Resolver, receiver, simulation | `cre-resolver`, `chainlink-cre-skill` |
| Sign-in, keys, restore | `mera-passkeys` |
| Chain calls and addresses | monskills `gas`, `addresses`, `concepts` |
| Indexer | monskills `indexer` |
| UI and motion | `visual-designer` agent, `emil-design-eng`, `improve-animations`, `review-animations`, `animation-vocabulary` |
| Sound | `sound-engineer` agent |
| New or edited skill | `writing-skills` |

## 9. How to work here

- Auditor stance: blockers first, evidence next, cost of each option explicit.
- At most 3 subagents at a time. Executors edit only their assigned files and never stage or commit; the lead integrates and commits.
- Prove a changed path at runtime, not only with a green check. UI is checked rendered at a 412 px viewport; say whether you saw it.
- Pending work is stated as pending with its gate, never dressed up as done. Start each session from the status table in `docs/technical/BUILD-PLAN.md`.
- Keep pure modules deterministic; tests cover what a player or judge would notice.

## 10. Commits

- One behaviour per commit, 50 to 250 changed lines; a larger indivisible file or vendored drop explains itself in the body.
- Subject `feat|fix|refactor|test|docs|perf|chore(scope): outcome in plain words`. Body: why, plus the proof command you actually ran and its result.
- Author `Febri Nirwana <324392918+febrinirwana@users.noreply.github.com>` (repo-local git config). No agent attribution. Never push or add a remote unless the user asks.
- Docs that describe the change ride in the same commit.
- Never commit `.env` values, keys, studio data, clip media, manifests, transcripts, flag plans or machine settings.

## 11. Lessons

Durable lessons live in `docs/LESSONS.md`, newest on top, format `### YYYY/MM/DD — headline` with Cause and Rule bullets. Add one whenever a mistake or discovery would bite again.
