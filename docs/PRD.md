# SAYSO — Product Requirements

**Bet on the words before they're spoken.**
SAYSO turns a short video clip into a set of live word markets. Before playback, the board shows six words that might be said. Each word trades between 0 and 1 AUSD. When a word is spoken, its card flips to SAID within one Monad block; Chainlink CRE then checks two independent transcripts and settles it. Players join with a passkey: no wallet app, no seed phrase.

Testnet only. No real money moves through SAYSO.

Evidence labels: **[V]** verified with the linked source, **[I]** inference, **[U]** unverified, with the spike that settles it.

## 1. Problem

- Watching is passive. Opinion markets on culture are a judge-stated wish ("spectator capital and opinion markets", [Electric Capital 2026](https://data.electriccapital.com/posts/investing-in-user-owned-technology-26-opportunities-in-2026)) [V].
- Mention markets exist at centralized venues, settled by staff reading a transcript [I]. Onchain prediction markets settle in hours or days through dispute games [I].
- Nobody settles a spoken-word market inside the clip it is about, with the resolution evidence committed before anyone trades [I].

## 2. Product in one loop

```mermaid
flowchart LR
  A[Join with passkey] --> B[Pick an episode]
  B --> C[60 s pre-roll: trade the six words]
  C --> D[Playback: words flip SAID live]
  D --> E[Cash out a SAID word at 0.98 now]
  D --> F[Clip ends: CRE settles every word]
  F --> G[Redeem winners, climb the leaderboard]
  G --> B
```

## 3. Scope decisions

| # | Decision |
|---|---|
| P1 | **Replay Arena only.** Episodes play pre-recorded clips whose titles are hidden. No live streams in this release. |
| P2 | **SAID is instant, settlement is CRE.** The studio flags a spoken word onchain in about one block; only the CRE workflow finalizes YES or NO. |
| P3 | **Cash out now.** While a word is SAID but not yet final, the house bids 0.98 AUSD for its YES. |
| P4 | **Only YES trades on Kuru.** NO is a complete-set position: mint YES+NO for 1 AUSD and sell the YES in one transaction. |
| P5 | **Mobile-first PWA.** Installable web app, portrait. No app-store build. |
| P6 | **Free tooling first.** Offline transcription, public RPC, Envio HyperSync, CRE simulation until deploy access is granted. |
| P7 | **Testnet first.** Monad testnet 10143 for every contract, token and market. |

## 4. Users

- **Player** on a phone, crypto-curious, arrives from a shared link. Wants a round under five minutes and a clear win or loss.
- **Judge** testing between 14 and 27 Oct 2026 at any hour. Must be able to start an episode alone, clear storage mid-round, and recover the same account from the passkey.
- **Operator** (the team): curates clips and word lists, funds the house, watches studio health.

## 5. The episode

| Stage | Duration | What the player sees | What happens onchain |
|---|---|---|---|
| Scheduled | until start | Countdown, word board with opening prices | `EpisodeCreated`; one YES/NO pair and one Kuru YES/AUSD market per word |
| Pre-roll | 60 s | Board live, video poster, "starts in 0:42" | Players buy YES or NO; house ladders rest on each book |
| Playback | clip length, 3 to 5 min | Video plays; a spoken word flips to SAID with a haptic tick | `WordFlagged` within about one block of the detection; house pulls that word's quotes and bids 0.98 |
| Closed | until settlement | "Settling" on unflagged words; evidence links appear | `EpisodeClosed`; set minting stops |
| Settled | permanent | Green YES / grey NO per word, redeem button, CRE transaction link | `WordResolved` per word through the CRE receiver |

Rules:
- Six words per episode. Curators pick a mix of spoken words and decoys; the ratio is never shown per episode.
- Every episode commits two transcript Merkle roots before the first trade (section 7 of ARCHITECTURE). The words that will be said are fixed and provable before anyone trades.
- A judge can start an on-demand episode from the lobby when none is running. A scheduled episode also starts every hour so the leaderboard stays alive.
- Opening prices are 0.50 for every word. The house never quotes from transcript knowledge; its only informed actions are pulling quotes at the flag and the 0.98 cash-out bid, both disclosed on screen.

### 5.1 What counts as "said"

A word counts when both transcription engines contain it within the same 1.5 s window after normalization: case-insensitive, punctuation stripped, plural `-s`/`-es` and possessive `'s` forms count, hyphenated compounds count when the word is a whole part. Homophones, partial words and words inside other words do not count. The full rule and test vectors live in `.claude/skills/word-matching/SKILL.md`; the CRE workflow and the studio import the same matcher from `packages/core`.

### 5.2 Prices and payouts

- YES and NO are ERC-20 tokens with 6 decimals. 1 YES + 1 NO always redeems for 1 AUSD before settlement.
- After settlement the winning side redeems for 1 AUSD and the losing side for 0.
- Prices display as cents ("62¢"); the tick is 1¢.
- Buying NO costs `1 − best YES bid`; the transaction refunds the YES sale proceeds.
- No fees on testnet.

## 6. Screens

Portrait, designed at 390 to 430 px wide.

| # | Screen | Must show |
|---|---|---|
| S1 | Join | "Join with passkey" and "I already have one"; one sentence on what a passkey is; TESTNET label |
| S2 | Arena | Running or next episode with countdown, "Start an episode" when idle, last results, starter balance status |
| S3 | Episode | Video (16:9) above a 2×3 word board; each card shows word, price, state (open / SAID / YES / NO), own position |
| S4 | Ticket | Bottom sheet: YES/NO, amount, cost, payout if right, one confirm; cash-out button on SAID words |
| S5 | Results | Outcome per word, the transcript chunk that proves it, the CRE transaction, own profit or loss |
| S6 | Portfolio | Open positions, redeemable amount, "Redeem all" |
| S7 | Leaderboard | Episode and all-time profit in AUSD, trade count, rank change |
| S8 | Account | Address, deterministic nickname, balances, restore check, TESTNET |

## 7. Account and onboarding

- **Mera is the whole account layer.** The passkey PRF output derives the signing key; there is no seed phrase, extension or custody backend.
- **Stateless test.** Clearing storage or switching devices and signing in with the same passkey restores the same address, positions and nickname. The nickname is derived from the address, so no server profile exists.
- **Starter balance.** On first sign-in the studio drips testnet MON for gas and test AUSD for play, once per address, rate-limited.
- **One-time approval.** AUSD uses its ERC-2612 permit for complete sets; the Kuru book approval happens once during onboarding.
- Mera's PRF is unavailable in some desktop browser profiles; S1 detects this and points to a phone or a supported browser.

## 8. Design principles

No generic AI interface. The direction is a late-night game-show board run from a broadcast control room.

- One signal colour (tally red) means SAID or LIVE and nothing else; one gain colour; everything else neutral on a dark studio background, never pure black.
- Words set in a condensed display face, prices in tabular figures. Fonts are chosen in the design pass.
- The signature moment is the card flip: a split-flap turn plus a haptic tick when a word is said.
- Motion only reports a state change. No ambient animation, gradients, glassmorphism, glow, emoji icons or drop-shadow card grids.
- Every number on screen opens its source: book, transaction, transcript chunk.

The design system document is written in a later pass; until then these rules and the `emil-design-eng` skill govern UI work.

## 9. Bounties and tracks

| Priority | Target | Load-bearing proof |
|---|---|---|
| P0 | Track 03 Social, Attention & Culture | "Markets on cultural outcomes" is an official example ([track brief](https://monad.xyz/developers/hackathons/metropolis)) [V] |
| P0 | Kuru: Bring New Assets & Markets | Each spoken-word YES token is a new asset with its own Kuru YES/AUSD book |
| P0 | Chainlink CRE | Only the CRE forwarder can finalize a word; remove CRE and nothing settles |
| P0 | Mera-powered UX | Passkey-only accounts and the stateless restore |
| P1 | Envio | Trade feed, positions and leaderboard come from HyperIndex |
| Out | Agora mobile trading | Requirement text unverified; not targeted in this release |

## 10. Success criteria

The demo never cuts this path: a word is said in the clip → its card flips SAID → a player cashes out or holds → CRE settles → the player redeems AUSD, all on camera, with every transaction on the testnet explorer.

- A fresh phone completes S1 to a first trade in under 90 seconds.
- Flag latency (spoken timestamp to `WordFlagged` receipt) under 1 second.
- Settlement latency (clip end to the last `WordResolved`) measured and reported in the README.
- A judge can start an episode with nobody from the team online.

## 11. Non-goals

Live streams, mainnet deployment, real money, app-store builds, user-created episodes, fees, and any market not tied to a committed transcript.

## 12. Risks

| Risk | Response |
|---|---|
| Gambling law (Indonesia prohibits gambling) | Testnet tokens only, no fiat path, stated in the README and video |
| Thin books | House flip-order ladders on every word; players only send immediate-or-cancel orders, so no player order rests on a book |
| A clip is recognisable | Titles hidden, team-recorded and public-domain sources, testnet stakes |
| CRE deploy access not granted in time | The studio runs the same workflow through `cre workflow simulate --broadcast`; README states which mode produced each settlement |
| Test AUSD supply | Faucet cadence spike S1; fallback quote token listed in INTEGRATIONS |
