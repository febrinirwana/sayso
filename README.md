<p align="center">
  <img src="apps/web/public/icons/icon-512.png" width="112" alt="SAYSO logo" />
</p>

<h1 align="center">SAYSO</h1>

<p align="center"><b>Bet on the words before they're spoken.</b><br/>
Six words. One clip. Every word is its own market, and a spoken word flips to <b>SAID</b> during playback.</p>

<p align="center"><b>TESTNET ONLY</b> · Monad testnet 10143 · test AUSD · no real money</p>

---

SAYSO runs word markets on replayed video clips. Before playback, the board shows six words that might be said. Each word trades between 0 and 1 AUSD on its own Kuru order book. When a word is spoken, the studio flags it onchain and its card flips to SAID; the house then bids 0.98 for an immediate cash-out. The settlement workflow checks two transcripts committed onchain *before the first trade*. Only Chainlink CRE can finalize outcomes; authenticated live settlement is still pending, as shown below. Players join with a passkey through Mera: no wallet app, no seed phrase.

## Status

The status as of 9 October 2026. [BUILD-PLAN](docs/technical/BUILD-PLAN.md) has the full task list, with the proof for each task.

| Area | State | Evidence |
|---|---|---|
| Contracts | Deployed on Monad testnet; the source is an exact match on Sourcify | [Addresses](#monad-testnet-addresses) |
| Live episodes | Six books seed within pre-roll; episodes 11/12 paid 0.98 cash-outs. Episode 12 flags measured 1,065/669 ms, so the strict <1 s target missed once | [Live Kuru receipts](docs/technical/INTEGRATIONS.md#2-kuru-order-books); timing B14 and full browser path 7.7 remain open |
| Passkey accounts | Join, clear all storage, then restore the same address. Proven in Edge with a PRF virtual authenticator | BUILD-PLAN 7.3 |
| Web screens | Live Arena start, buy, SAID and cash-out reached testnet in Edge. The full run failed afterward because consumed liquidity hid the receipt feedback. Feedback and cashflow fixes passed independent rendered/regression proof; the corrected combined run remains pending. Results/Portfolio redemption awaits CRE | BUILD-PLAN 7.1–7.7 |
| CRE settlement | Settled episode 12 on Monad testnet through the real CRE simulator: the studio runner broadcast the close report and the house recycled every word unattended. DON deploy access is not enabled, so settlement runs in simulation mode | [INTEGRATIONS](docs/technical/INTEGRATIONS.md) §3, BLOCKERS B02 |
| Public URL | Waiting on the host and the domain | BLOCKERS B05, B06 |

## How one episode works

```mermaid
sequenceDiagram
  autonumber
  participant P as Player (passkey)
  participant S as Studio
  participant M as SaysoMarkets
  participant K as Kuru book (per word)
  participant C as Chainlink CRE
  S->>M: createEpisode(clip, six words, rootA, rootB)
  Note over M: both transcript Merkle roots are fixed before any trade
  S->>K: house seeds a YES/AUSD ladder per word
  P->>M: buyYes / buyNo (immediate-or-cancel through Kuru)
  Note over S: clip plays; the word will be spoken at t
  S->>K: pull quotes at t - 400 ms
  S->>M: flagSaid(word) at t
  M-->>P: card flips at t + 1.5 s presentation delay
  S->>K: after pull receipt and chain SAID, bid 0.98
  P->>M: sellYes (cash out)
  M->>K: immediate-or-cancel sale into the 0.98 bid
  S->>M: markEvidence(flagged words) once their chunks are revealed
  M-->>C: EvidenceReady (log trigger)
  C->>S: fetch the revealed chunks from both engines
  C->>C: verify every proof against rootA/rootB, match the word
  C->>M: onReport: WordResolved YES
  S->>M: closeEpisode
  M-->>C: EpisodeClosed (log trigger)
  C->>C: verify both full transcripts, decide every unresolved word
  C->>M: onReport: WordResolved for the rest
  P->>M: redeem winners
```

- **Nothing after the first trade can change an outcome.** Both transcripts are chunked, Merkle-committed and pinned onchain at `createEpisode`. The reveal API serves a chunk only after its end plus 1.5 s plus a margin, and CRE accepts only chunks whose leaf and proof match the committed roots.
- **SAID is fast; YES is final.** Episode 12 flag receipts measured 1,065/669 ms; the strict <1 s target is not yet consistently met. Only the CRE forwarder can settle a word. The owner's only override is a void, allowed 24 hours after close if no report arrived.
- **The house never quotes from the transcript.** It seeds the same ladder on every word before playback. When a word is spoken, it pulls that word's quotes and bids 0.98 for its YES. Players send immediate-or-cancel orders only.

## Why Monad

- **Fast flags fit the playback delay.** Blocks of about 400 ms and a 1.5 s presentation delay leave room for a mined `WordFlagged` before its visible card flip. The episode 12 receipts arrived in 1,065/669 ms, not a guaranteed single block. On testnet a SAID card is backed by a mined transaction, not by a server promise.
- **One order book per word, per episode.** Each episode lists six Kuru YES/AUSD markets. Cheap creation and matching make a market per spoken word practical.
- **Sequenced senders.** Every transaction carries an explicit gas limit taken from a measured table ([`packages/core/src/gas.ts`](packages/core/src/gas.ts)), because Monad bills the gas limit. Each sender waits for a later block before it sends again.

## Bounty map

Primary track: **03 Social, Attention & Culture**. [SUBMISSIONS](docs/SUBMISSIONS.md) has the eligibility research. Kuru New Assets is listed under Track 01 and is not claimed here without a written organizer ruling. Agora is out of scope.

Video timestamps are added with the recorded demo (BUILD-PLAN 8.5).

| Bounty | Requirement | Feature in SAYSO | Code |
|---|---|---|---|
| Best workflow with CRE | A CRE workflow that runs in a CLI simulation or deployment | Two log-trigger handlers. `EvidenceReady` settles flagged words YES from their revealed chunks; `EpisodeClosed` checks both full transcripts and settles the rest. Each handler verifies every Merkle proof against the two onchain roots before it writes a report through the forwarder | [`cre/resolver/src`](cre/resolver/src), receiver [`contracts/src/SaysoMarkets.sol`](contracts/src/SaysoMarkets.sol) (`_processReport`) |
| Best Mera-Powered UX | Mera is the whole account layer; works in a stateless test | A discoverable passkey whose PRF output derives the key in memory only. Clearing every storage and signing in again restores the same address. No wallet extension, no seed phrase, no custody backend | [`apps/web/src/account`](apps/web/src/account) |
| Best Use of Envio | Live indexed data powers a core feature | HyperIndex indexes episodes, words, trades, positions and resolutions; Arena history, Results, Portfolio and Leaderboard read it | [`indexer`](indexer), [`apps/web/src/records`](apps/web/src/records) |

## Monad testnet addresses

Every address below was checked with `cast code` before it entered the code.

| Contract | Address |
|---|---|
| `SaysoMarkets` | [`0xc8492B2906d57c184be372899d18EDF195D11CF8`](https://testnet.monadvision.com/address/0xc8492B2906d57c184be372899d18EDF195D11CF8) (deploy block 69,202,243) |
| `OutcomeToken` implementation | [`0xC0688e3810d79407cc65EbE1910AC57f6dcCcC6b`](https://testnet.monadvision.com/address/0xC0688e3810d79407cc65EbE1910AC57f6dcCcC6b) |
| AUSD (test) | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` |
| Kuru Router | `0x7EFbE105Ca7415dE98F96622173458ac1c054630` |
| Kuru MarginAccount | `0xd029C2D98ff85D8F64799017fE00a59B1159CE02` |

Transactions from the first live episode:

| Step | Transaction |
|---|---|
| Deploy `SaysoMarkets` | `0x1d130dcf42dddb0b31b6fc8dadede961f077e02fcbdfaefb18b03feb6c2595a1` |
| `createEpisode` (episode 1) | `0xb6d201e0df0cfb28535c4f20bd8bf83373cfe80f56bc294e7c4be95cf59925cd` |
| List six Kuru markets | `0x13fb7d67fcb5a51405482a99027009c8e48589e11d7ad8e1b27113c2a7a5b3ae` |
| `flagSaid` "market" | `0x74857e42662a6c2b43bd6a879a84ef5a8604184af17df25363ba90ffca101308` |
| `flagSaid` "block" | `0x833342c7e6c2ec47cf72c6ecee137accaef22b53857bd345451e5e86e3242a05` |
| `closeEpisode` | `0x06b0ed92d1abbd2641adb56e70275fd8daeaf905852ccc6ccc708eb29fdbe7d1` |

[SMART-CONTRACTS](docs/technical/SMART-CONTRACTS.md) has the deployment log, the gas table and the invariants.

## Settlement mode

**Simulation.** `CRE_MODE=simulation`: the receiver trusts the CRE simulation forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`, and only when `tx.origin` is the REPORTER key that runs `cre workflow simulate --broadcast`. Once DON deploy access is granted, the owner sets the production forwarder and the expected workflow ID, then clears the origin gate. The full procedure is in [SMART-CONTRACTS](docs/technical/SMART-CONTRACTS.md).

## Repository

| Path | Owns |
|---|---|
| [`apps/web`](apps/web) | Installable PWA: landing, game screens, Mera session, block-sequenced transactions, voxel art, sound |
| [`apps/studio`](apps/studio) | Scheduler, episode clock, flags, house market maker, starter drip, reveal API, CRE runner, health |
| [`packages/core`](packages/core) | Pure matcher, chunking, Merkle, units, gas table, ABIs |
| [`contracts`](contracts) | `SaysoMarkets`, `OutcomeToken`, `KuruTrade`; Foundry unit and invariant tests |
| [`cre/resolver`](cre/resolver) | CRE workflow |
| [`indexer`](indexer) | Envio HyperIndex config, schema, handlers |
| [`tools/transcribe`](tools/transcribe) | Offline two-engine transcription (whisper.cpp + Vosk), chunks and roots |
| [`tools/sfx`](tools/sfx) | Offline sound generation and mastering |

Design and technical documents: [PRD](docs/PRD.md) · [DESIGN](docs/DESIGN.md) · [ARCHITECTURE](docs/technical/ARCHITECTURE.md) · [INTEGRATIONS](docs/technical/INTEGRATIONS.md) · [ERD](docs/technical/ERD.md) · [LESSONS](docs/LESSONS.md).

## Run locally

Requirements: Bun 1.3.14, Node 24.21+, Foundry. The indexer CLI also needs Linux or macOS; on Windows, use WSL.

```sh
bun install
cp .env.example .env            # fill locally; never commit values
(cd contracts && forge soldeer install && forge test)
bun run --cwd apps/web dev      # http://localhost:5173, phone-sized viewport
```

The studio needs testnet role keys and a data directory outside the repo. The data directory holds the clip media, both transcripts and the flag plan, so outcomes never enter git:

```sh
bun --env-file=<studio.env> apps/studio/src/main.ts   # RPC_URL, CHAIN_ID=10143, STUDIO_DATA_DIR, role keys
```

`bun run verify` runs typecheck, Biome and Vitest across every workspace. On Windows, run it in WSL because of the Envio CLI.

## Build provenance and AI disclosure

- SAYSO development commits begin on 5 October 2026. This is not a claim that every dependency, mesh or supplied artwork was created during the hackathon.
- **AI tools.** Code, tests and docs were developed with Anthropic Claude and OpenAI GPT coding agents through omp. Commit messages record verification evidence; open acceptance criteria remain in BUILD-PLAN.
- **Vendored code.** Chainlink `ReceiverTemplate`/`IReceiver` ([`contracts/src/vendor/chainlink`](contracts/src/vendor/chainlink)), OpenZeppelin and forge-std (pinned through Soldeer), and the Kuru interfaces/ABIs.
- **Reused visuals.** The logo and voxel artwork were supplied by the developer. Decorative voxel mesh work was adapted from the existing bloop.tip reference. These assets are disclosed as reused, not original hackathon implementation.
- **Sound effects** were generated on the ElevenLabs free plan. Sound effects: elevenlabs.io.
- **Speech models**: whisper.cpp `ggml-base.en` and Vosk `vosk-model-en-us-0.22`, both run offline.

## Licence

[MIT](LICENSE) © 2026 Febri Nirwana
