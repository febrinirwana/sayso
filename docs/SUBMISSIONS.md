# SAYSO submission readiness

Verified 8 October 2026 against the authenticated Metropolis dashboard: four primary tracks, all 21 sponsor bounties, Prizes, Resources and the Rules v3.0 modal (last updated 3 September). [V] is published requirement text, [I] is our feature mapping, [U] is an unresolved organizer ruling or runtime proof. A planned integration is not a completed submission.

This document owns submission packaging, bounty eligibility and organizer questions. [PRD](PRD.md) owns product scope; [BUILD-PLAN](technical/BUILD-PLAN.md) owns implementation status; [BLOCKERS](BLOCKERS.md) owns external delivery gates. Tick a submission box only after recording its actual evidence. The portal's final submission form, field validation and character limits have not been inspected: the audited account had no project. The questions below come from the official opportunity pages.

## 1. Decision and deadline

- Primary track: **03 — Social, Attention & Culture**. No track change is authorized by this research.
- Monad testnet **10143 only**; Replay Arena, not livestreams; no real money or mainnet claim.
- Core targets: **Chainlink CRE, Mera UX, Envio**. Eligibility is possible; awards require working evidence and are not guaranteed.
- **Kuru New Assets is pending eligibility**, not a confirmed Track 03 bounty: the portal tags it Track 01. It explicitly suggests event/outcome contracts, so product fit is strong, but cross-track entry requires written organizer confirmation.
- **Agora is skipped.** Its trading bounty requires Mera + AUSD + **Perpl trades**, not Kuru. Cross-border payments is also outside this product. Do not add Perpl/remittance to chase a prize.
- Final deadline: **13 October 2026, 23:59 ET = 14 October, 03:59 UTC / 10:59 WIB**. Internal target: **13 October, 18:00 WIB**. Submission edits are allowed until the final deadline; late submissions are rejected.

## 2. Submission package

The four track pages share these deliverables; Rules §§4, 7 and 9 add code, documentation and provenance requirements.

| Asset | Requirement | Proof before ticking |
|---|---|---|
| Logo/graphic | JPG, JPEG, PNG or WEBP, maximum **3 MB** | Accepted upload with correct format/size |
| Public GitHub | Public source under an OSI-approved license; SAYSO uses MIT | Open repo and LICENSE while signed out |
| Technical demo | **Maximum 3 minutes**, public YouTube/Loom/Vimeo; operating product and Monad interactions, not slides/code walkthrough | Public link, duration and filmed tx hashes |
| Pitch video | **Maximum 2 minutes**; team, problem and why we are building it | Separate playable public link and duration |
| Live product | Deployed on Monad mainnet or testnet; our scope is testnet | HTTPS URL and clear judge instructions |
| Documentation | Description, architecture, stack, setup/deployment | README links and clean-clone instructions |
| Monad proof | Contract addresses or transaction hashes; explain purpose and why Monad | Correct chain, explorer links and receipt/code evidence |
| Build provenance | External-code attribution, in-window history, AI-tool disclosure; declare any pre-existing components | Accurate README disclosure matching history |
| Advertisement | Optional, maximum **30 seconds**, not scored | Only prepare after required assets |

**No pitch deck requirement was found** in the track pages or Rules read. A pitch video is required by track deliverables. Sponsor clips have separate caps and do not replace the primary technical demo or pitch.

- [ ] Complete project description: player/community, Replay Arena loop, differentiation, why Monad; state TESTNET and the settlement mode.
- [ ] Confirm team eligibility: 1–5 members, primary contact, one project per participant; no participant overlaps another Metropolis submission.
- [ ] Publish repo, license, README setup, architecture/stack links and AI disclosure; never publish keys, credentials, personal data or hidden outcome-bearing studio data.
- [ ] Fix the public HTTPS hostname/passkey relying-party ID before real passkeys, and document supported authenticators and judge access.
- [ ] Test the public URL on a fresh phone with no team member assisting.
- [ ] Upload logo and both required videos; verify links while signed out and check durations.
- [ ] Submit only eligible bounties; complete their exact response fields and video caps below.
- [ ] Record submission receipt/time and re-open the saved submission to verify links before the deadline.

## 3. Bounty eligibility and prize amounts

| Target | Portal track | Published award | SAYSO decision |
|---|---|---|---|
| Track 03 | Social, Attention & Culture | $30,000 pool; 3 × $10,000 | Primary category |
| Best workflow with CRE | All tracks | $3,000, single prize | Target; successful CLI simulation or CRE deployment qualifies |
| Best Mera-Powered UX | All tracks | $2,500, single prize | Target; prove the stateless test and signing sessions |
| Best Use of Envio | All tracks | $1,000, single prize | Target; live indexed data must power a core feature |
| Bring New Assets and Markets to Kuru | Track 01 | $5,000, single prize | Pending written cross-track ruling; do not count as eligible yet |
| Best Community Team Project | All tracks | $5,000, single prize | Conditional on actual onboarded/selectable community affiliation |
| Bring Any-Chain Liquidity to Monad | All tracks | $5,000 pool: $2,500/$1,500/$1,000 | Stretch only; real cross-chain flow required, testnet compatibility unresolved |
| Grand Champion | Across all submissions | $25,000 | Judged separately; not a promised award |

[Prizes](https://hackathon.monad.xyz/prizes) explicitly allows main-track/sponsor stacking and multiple earned bounties. This does not waive track restrictions. Sponsor terms govern sponsor awards; USD labels are not a guarantee of payment. Alchemy, KIMI and Qwen award credits; Hunyuan awards vouchers, not cash.

Not current targets: Agora (Perpl/payments scope mismatch), Qwen (Track 04), Hunyuan/KIMI (would require meaningful model-powered product functionality and a published article), Dynamic/Privy (not our approved account design), Cleanverse/MetaMask/Perpl (different integrations). No blanket Mera/Privy/Dynamic exclusivity clause was found; Mera still must be the **entire account layer** without seed phrase, wallet extension or custody backend.

## 4. Target requirements and exact sponsor response fields

### Chainlink CRE

[V] At least one blockchain plus an external API/system/data source/LLM/agent; meaningful orchestration; a successful CRE CLI simulation **or** live CRE network deployment. Production workflow access approval is not required for the simulation route.

Asked for at submission:

> Describe how your project meaningfully utilizes Chainlink CRE as an orchestration layer
>
> Submit a demo video (up to 2 mins) showing a successful simulation (via the CRE CLI) or a live deployment on the CRE network.

[I] SAYSO proof: log trigger → revealed transcript chunks → Merkle verification + shared matcher → report → WordResolved → redeem. Remove CRE and final settlement must not have an admin shortcut. Record trigger/report txs, final outcomes and latency; disclose simulation versus DON deployment. A successful offchain simulation alone does not complete SAYSO's live settlement acceptance.

### Mera UX

[V] One passkey ceremony; prompt-free signing sessions with clear scope/expiry; live Monad transactions; storage-cleared/fresh-device identity and access reconstructed from passkey, plus untrusted storage if used. Judges assess taps/seconds to first transaction and session-expiry UX.

Asked for at submission:

> Describe how your project meaningfully integrates Mera as the entire account layer
>
> Submit an optional demo video (up to 2 mins) showing how Mera is integrated into your app, focusing on UX elements

[I] Proof: join → funded first trade → session actions → session end/re-prompt → clear site data/fresh device → same address and chain positions. Record device/browser, elapsed time, taps and tx hash. Same-browser cached state is not restore proof.

### Envio

[V] HyperIndex, HyperSync or HyperRPC must supply live/correct data to an actual feature. Cloud or self-hosted is allowed. Public config/schema/handlers or HyperSync client code, a consumer and end-to-end data proof are required; derived/aggregated entities and sensible schema strengthen the entry.

Asked for at submission:

> Describe how your project meaningfully uses Envio's HyperIndex, HyperSync or HyperRPC to power real on-chain data in your app — not just installed, but actually driving a feature.
>
> Submit an optional demo video (up to 2 mins) showing the data flowing end to end through Envio's HyperIndex, HyperSync or HyperRPC.

[I] Proof: real trade/resolution receipts → handler entities → GraphQL → positions/leaderboard. For two players reconcile profit against actual cashflows and unredeemed settled value; unsettled positions must not inflate realized ranking. Record event-to-query latency, deployed endpoint and code paths.

### Kuru New Assets — only after eligibility confirmation

[V] New tradable asset class on Kuru's spot book, demand/customer evidence, credible issuance/redemption/settlement, legal/operational plan, liquidity/initial market formation and post-hackathon roadmap. Prediction markets are explicitly suggested. Portal track is **01**, not All tracks.

Asked for at submission:

> Clearly describe the new asset class or classes that your project brings to Kuru
>
> Clearly describe your plan for bringing the asset onchain legally and operationally, including a strategy for liquidity and initial market formation
>
> Clearly describe your roadmap for the product beyond the hackathon.

[I] Evidence: YES/NO complete sets, live YES/AUSD Kuru books/trades, transcript-root commitment, CRE settlement/redemption and disclosed house liquidity. Rights-cleared clips and a testnet label do not constitute a legal approval for real-money rollout. Do not imply a Kuru partnership/listing commitment.

## 5. Demo, pitch and evidence checklist

- [ ] Film the never-cut sequence: word heard → SAID flip → cash out or hold → CRE final settlement → redeem, with explorer proof.
- [ ] Show a judge starting an episode unaided, plus passkey restore after clearing storage/on another device.
- [ ] Measure time to first trade, spoken-time-to-flag receipt and close-to-last-resolution latency; distinguish presentation delay from chain latency.
- [ ] Prepare a separate ≤2-minute pitch: team, named community/user, pain, why Replay Arena/Monad, actual user-testing evidence and specific distribution/creator-acquisition plan.
- [ ] Map each claimed bounty in README: exact requirement → operating feature → actual code path → video timestamp.
- [ ] Keep selected sponsor videos within their caps; CRE's ≤2-minute clip is requested, Mera/Envio clips are optional fields.
- [ ] Separate external users from team-controlled trades. Rules §§8.2/10.4 prohibit wash trading/fake volume and bot price manipulation; testnet does not automatically waive these provisions.

Record deployment/tx evidence in [SMART-CONTRACTS](technical/SMART-CONTRACTS.md), runtime measurements in BUILD-PLAN/README, and organizer rulings in section 7. Do not mark an unchecked item complete based on this guide's existence.

## 6. Organizer contacts and ready-to-send questions

1. **Primary: [Metropolis Support Forum](https://hackathon.monad.xyz/support?tab=forum).** Support is the portal's organizer/mentor help route. Choose Rules/eligibility if that category is offered. Save a written reply URL and quoted ruling; no thread has been posted by this documentation task.
2. **Escalation: [Monad Developer Discord](https://discord.gg/monaddev).** Verified by [official Monad links](https://docs.monad.xyz/official-links). The dashboard also offers joining the developer server and obtaining the Metropolis role. Ask staff for the correct Metropolis organizer channel; no specific channel name or response time is verified.
3. **Public developer account: [DevNads / @monad_dev](https://x.com/monad_dev).** Officially listed; useful for routing, not proof that private DMs are open or that a reply grants eligibility.
4. `metropolis@hackathon.monad.xyz` appears in track deliverables as the GitHub access identity. It is **not verified as a general support mailbox**; do not mislabel it.

Ready-to-send eligibility question (draft, not sent):

> SAYSO is a Monad testnet Replay Arena app with spoken-word YES/NO outcome tokens, YES/AUSD markets on Kuru, Mera onboarding and CRE transcript-based settlement. Our intended primary track is Social, Attention & Culture (03). The Kuru New Assets bounty explicitly suggests event/outcome contracts but is tagged Onchain Finance & Trading (01). Can a Track 03 submission enter that bounty, or must its primary track be 01? Please confirm in writing before we select it.

Also obtain clarification on:

- Rules §5.2 has five equal 20% weights; track pages show Technical 20%, Design 20%, Originality 15%, Founder/Market 25%, Traction 20%. Which rubric governs?
- Rules §5.1 says judging 14–27 October/winners 3 November; dashboard says judging through 3 November/winners from 4 November. Which service-availability period should teams plan for?
- How should disclosed house liquidity and controlled testnet trades be demonstrated under the wash-trading/bot-manipulation rules without claiming organic volume?
- If seeking Community Team: must our actual affiliated group be selectable on the profile, and how should that affiliation be documented? Mere attendance is not proof.

No primary-track change or new integration is approved by these draft questions. Until dates are clarified, [I] plan hosting through 4 November rather than switching off after 27 October.

## 7. Ruling and final-link record

- [ ] Record each organizer question's thread URL, response date, exact ruling and resulting decision before changing eligibility status.
- [ ] Record final project page, GitHub, live product, logo, technical demo, pitch and selected sponsor clip links in README and the saved portal submission.
- [ ] Record the final submission timestamp/receipt and responsible primary contact; exclude private credentials and personal identification documents.

No cross-track ruling or final submission receipt has been recorded here.

## 8. Rules, free resources and prize caveats

[V] Rules §5.2: main-track Product Quality, Technical Excellence, Monad Integration, Track Fit and Innovation are each 20%; sponsor scoring is requirement adherence 40%, technical implementation 30%, Monad integration 20%, innovation 10%. The track-page rubric conflict is recorded in section 6. Prepare user/community evidence as well as correct code.

Rules require public source throughout and after the event, accurate attribution and non-confidential review. Teams retain ownership; the organizer/sponsors receive promotional-use rights. Prize recipients may need KYC and are responsible for taxes; main prizes are USDC/equivalent within 30 days of the later of announcement or verification completion. Sponsor awards have separate terms. Testnet tokens have no real-money value.

[Resources](https://hackathon.monad.xyz/resources) offers **one voucher per team per resource**: Quicknode Build 3 months (new accounts only), Tenderly Pro, Zerion API Builder 1 month, BlockVision Lite 2 months, Spectrum Business 2 months, Dwellir Developer 3 months. The user claimed Quicknode Build on 2026-10-09; the studio used it until 2026-10-11 and now runs on the public endpoint (INTEGRATIONS §1). Winner services/rebates on Prizes are not extra cash; Envio's winner perk is two months Cloud hosting free and a third month at 50% off.

## 9. Official source index

- [Track 03 scope, rubric and shared deliverables](https://hackathon.monad.xyz/tracks/social-culture)
- [Rules v3.0: Dashboard → VIEW THE RULES](https://hackathon.monad.xyz/dashboard)
- [CRE requirements](https://hackathon.monad.xyz/tracks/best-workflow-with-cre)
- [Mera UX requirements](https://hackathon.monad.xyz/tracks/best-mera-powered-ux-on-monad)
- [Envio requirements](https://hackathon.monad.xyz/tracks/best-use-of-envio)
- [Kuru New Assets requirements and track restriction](https://hackathon.monad.xyz/tracks/bring-new-assets-and-markets-to-kuru)
- [Agora trading: Mera + AUSD + Perpl](https://hackathon.monad.xyz/tracks/best-mobile-trading-app-on-monad-agora-onchain-trading-bount)
- [Community eligibility](https://hackathon.monad.xyz/tracks/best-community-team-project)
- [Aurora real cross-chain flow and prize split](https://hackathon.monad.xyz/tracks/bring-any-chain-liquidity-to-monad)
- [Prizes and stacking](https://hackathon.monad.xyz/prizes), [participant resources](https://hackathon.monad.xyz/resources)

Dashboard sources require login. Sponsor terms supplement Rules. Requirements are verified; product completion and organizer exceptions still require their own evidence.

## 10. Portal answers, ready to paste

The portal's "describe" fields allow 8,000 characters each; these stay under 2,000. Plain text, no em dashes, every claim tied to a file or receipt. Re-read each against the repo before pasting, and update the Mera paragraph that names real-phone proof once the S5 phone run (BUILD-PLAN S5, 7.7) is green. The two video fields take a public link starting with https://.

### 10.1 Best workflow with CRE

```text
SAYSO is a word-market game on replayed video clips. Every episode has six words, and each word is its own market on Kuru, on Monad testnet. Chainlink CRE is the only thing that can say whether a word was spoken. There is no admin settle button.

For that to be fair, nobody can choose the answer after seeing the bets. So before the first trade, two independent transcripts of the clip (Whisper and Vosk) are committed onchain as Merkle roots. CRE checks the revealed evidence against those roots and writes the result back.

The workflow (cre/resolver) has two EVM log triggers:
1. EvidenceReady, when a word is flagged. CRE reads the word and both roots from the contract, fetches the revealed transcript chunks over HTTP, verifies each Merkle proof, and checks that both engines place the word within 1,500 ms. Then it sends a report.
2. EpisodeClosed. CRE resolves whatever is left: spoken late is YES, never spoken is NO.

SaysoMarkets only accepts reports from the Chainlink forwarder. Winners redeem 1 AUSD per token, and the owner cannot settle anything. If a proof fails or the engines disagree, CRE sends no report and the market stays open. It never guesses.

Proof on Monad testnet: episode 12's evidence report 0x216b9f1434c1239ed03f68eb2cb6fc30d4c704c90b98712434c7b681195e2348 resolved word 68 YES, and the close report 0xc3d77d95a48499ad7a5d39f604d775d0acf9f25887032e70bda1e9bab0a3dba6 settled the rest. Our server has since run the same workflow automatically for every episode: 12 episodes (12 to 23) and 72 words settled, 34 successful CRE runs. Episode 22 example: evidence report 0xb89006abecf77dd078ab0236ec828e32fa71a37ae42bb87f5bc263afb72cfea4, close report 0xece2f9453716ce15f284b14dca7ba82a0b19e452120ff49118c9ba321b778962.

To be clear about status: this runs through `cre workflow simulate --broadcast`, which sends real reports to the mock forwarder on Monad testnet. Our DON deploy access is requested but not enabled yet, so we are not claiming a live deployment.

Code: cre/resolver/src (workflow.ts, resolve.ts, decide.ts) and contracts/src/SaysoMarkets.sol (_processReport).
```

Video (up to 2 minutes, required): show `cre workflow simulate` finishing with a successful result, the two report transaction hashes opening on the explorer with status 1, the `WordResolved` event, and the `_processReport` forwarder check in the contract. Say "simulation" out loud.

### 10.2 Best Mera-Powered UX on Monad

```text
Mera is the whole account layer. There is no wallet extension, seed phrase, email login or custody backend. A player taps "Join with passkey" and plays.

The passkey's PRF output becomes the signing key, wrapped in a Mera signing session. It is zeroed right after use and lives only in memory. Nothing is stored in the browser or on our server, and the studio only sends a starter balance to the player's public address.

After that one tap, trades, cash-outs and redeems sign without prompts. Transactions go through a queue with explicit gas that waits for the next block between sends. If the session ends mid-action, the app asks for one passkey tap and accepts only the same address, so a different passkey can never send for the original player.

Clear all site data, tap "I already have one", and the same address comes back with the same balance and positions, because those live onchain. A browser without PRF support gets a clear message instead of a broken join.

Live on Monad testnet at https://playsayso.vercel.app. Verified: join, storage wipe and restore to the same address in Edge with a virtual PRF authenticator; and on the founder's Android phone at the production domain, join, starter kit, live trades, sign out, sign back in with the same passkey and redeem a winning word (9.80 test AUSD back). iOS has not been tested on a real device yet.

Code: apps/web/src/account (derive.ts, AccountProvider.tsx, sendQueue.ts).
```

Video (optional, up to 2 minutes): join with one tap, first trade and its elapsed seconds, a session re-prompt, clear site data, restore to the same address and the same positions. Record the device and browser. Same-browser cached state is not restore proof.

### 10.3 Best Use of Envio

```text
Envio is where SAYSO's history and rankings come from. Without it the Leaderboard, Portfolio history and Results screens are empty.

We index SaysoMarkets on Monad testnet through HyperSync: episodes, words, trades, SAID flags, CRE resolutions, redemptions and token transfers. The handlers turn those events into Positions, Players and per-episode rankings (indexer/src/handlers.ts, schema.graphql).

One rule matters: profit only counts words CRE has already resolved. That is cash in minus cash out plus the value of tokens still held at the resolved outcome, so an open position cannot move anyone up the board.

The app reads it over GraphQL for the Leaderboard (all-time and per episode), Portfolio (positions and trade history), Results (resolved words, evidence hash, resolve tx) and recent episodes in the Arena. Balances, prices and trading stay on the chain.

Hosted on Envio Cloud: https://indexer.dev.hyperindex.xyz/0c56fbe/v1/graphql. Config, schema, handlers and tests are in the repo under indexer/.
```

Video (optional, up to 2 minutes): make a trade, show the transaction on the explorer, then the same trade appearing in Portfolio history and the profit moving on the Leaderboard after settlement, with the GraphQL query shown once. For two players, reconcile profit against their actual cashflows before filming.

Before pasting 10.3, run one GraphQL query against the endpoint and confirm it answers at chain head; the indexer deployment is a 30-day development instance (ARCHITECTURE, hosting table).

## 11. Main project form, ready to paste

Seen on the portal on 2026-10-12 (owner screenshots): one-line description (200 characters), Description (8,000), go-to-market and user acquisition (8,000), GitHub repository, and an optional private Judge access instructions field (8,000). Plain text, no em dashes, every number tied to a receipt, the indexer or the studio database on 2026-10-11. The 8 early testers and their quotes are owner-supplied (pitch SCRIPT); re-read every number before pasting.

### 11.1 One-line description

Recommended (162 characters):

```text
Bet on the words before they're spoken. Six words per clip flip SAID onchain in a second, settled by Chainlink CRE from transcripts locked before the first trade.
```

Shorter alternative (122 characters):

```text
A word-calling game show on Monad: bet on what gets said in a clip, watch words flip SAID live, get paid by Chainlink CRE.
```

### 11.2 Description

```text
SAYSO is a word-calling game show on Monad. Pick a clip, see six words, and call YES or NO on each one before it plays. The moment a word is spoken, its card flips SAID onchain in about a second. Cash out at 98 cents right away, or hold until Chainlink CRE settles it and redeem 1 AUSD per winning share. A full round takes about three minutes. Live on Monad testnet: https://playsayso.vercel.app

THE PROBLEM
Millions of people watch casters, streamers and finals, and the only thing they can do is watch. The appetite to play along is real: traders staked more than $47 million on what NFL announcers would say in a single season, and Kalshi plus Polymarket traded $53 billion in July 2026 alone. But these "mention markets" have three problems:
1. They settle after the fact, by trust. Someone reads a transcript afterwards and declares the result. Players cannot check the answer key, and the operator could change it. In August 2026 Kalshi pulled its sports mention markets amid a federal inquiry.
2. They are not a game. You bet and wait hours. Nothing happens while you watch.
3. They start with a wallet. Seed phrases, extensions and gas lose most people before their first call.

THE SOLUTION
SAYSO makes the answer key provable and the game live.
- Fair by construction. Before the first trade, two independent transcripts of the clip (Whisper and Vosk) are cut into 10-second chunks and committed onchain as Merkle roots in createEpisode. Nothing after that can change an outcome, not even us.
- Live. Every word is its own YES/AUSD market on a Kuru order book. When a word is spoken, the studio mines flagSaid on Monad within about a second (measured 455 to 1,257 ms from spoken word to mined transaction) and the card flips SAID on every player's screen. The house posts a disclosed 98 cent bid so players can lock in a win instantly.
- Settled by Chainlink CRE, never by an admin. A CRE workflow with two EVM log triggers reads both roots from the contract, fetches the revealed transcript chunks, verifies every Merkle proof, requires both engines to agree on the word, and writes the result through the Chainlink forwarder. If a proof fails or the engines disagree, it sends nothing and the market stays open. The owner's only power is to void a word 24 hours after close if no report ever arrived.
- Invisible onboarding. Mera is the whole account layer: one passkey tap creates the account, the key is derived from the passkey's PRF output in memory only, and every trade, cash-out and redeem after that signs without a popup. Sign out, clear the browser, sign back in with the same passkey: same address, same positions. No wallet app, no seed phrase, no extension.
- Free to play. Testnet only: players claim a free starter kit of test AUSD and test MON. No fees, no real money.

WHAT MAKES IT USEFUL
For players it is a reason to lean in while watching, with friends, in a three-minute round. For creators and leagues it turns any replayed clip into an interactive moment with a leaderboard. For the market category it shows mention markets can settle provably and instantly instead of by trust.

WHY MONAD
SAID has to feel live. Monad's fast blocks let a SAID card be backed by a mined transaction inside the 1.5-second presentation delay, not by a server promise. Each episode deploys six fresh Kuru books, one per word, which is only practical with cheap, fast execution. Every transaction carries an explicit measured gas limit, because Monad bills the limit.

SPONSOR INTEGRATIONS
- Chainlink CRE: the only path that can settle a word. Runs through the official CLI (cre workflow simulate --broadcast) for every episode; DON deploy access is requested.
- Mera: the entire account layer, passkey to prompt-free signing session to restore.
- Envio HyperIndex (hosted): powers the Leaderboard, Portfolio history, Results and the Arena's recent rounds; profit counts only CRE-resolved words.
- Kuru: one YES/AUSD order book per word per episode; players trade immediate-or-cancel through our contract.
- AUSD: the collateral and quote token; 1 AUSD mints a YES plus a NO, the winner redeems 1 AUSD.

PROOF, ON MONAD TESTNET (as of 11 Oct 2026)
- 12 episodes played and settled end to end (episodes 12 to 23), 72 word markets resolved (26 YES, 46 NO), zero admin overrides.
- 34 successful CRE workflow runs: 23 evidence reports and 11 close reports.
- 65 player trades from 13 wallets (team and early testers), 78 positions redeemed.
- SaysoMarkets 0xc8492B2906d57c184be372899d18EDF195D11CF8, source verified on Sourcify and Monadscan.
- Full transaction-by-transaction evidence, architecture diagrams and setup are in the README: https://github.com/febrinirwana/sayso

STATUS, HONESTLY
Contracts, studio, CRE settlement, indexer and web app are live and have run 12 consecutive episodes without manual settlement. CRE runs in simulation mode through the official CLI until DON access is enabled. Passkeys are proven in Edge and on an Android phone; iOS is not yet tested on a real device. Not audited. Testnet only.

WHO BUILT IT
Febri Nirwana, solo founder and smart contract engineer, ETHOnline 2026 winner with Mandate. Built during Metropolis with AI coding agents under human direction; the full AI disclosure is in the README.
```

### 11.3 Go-to-market and user acquisition

```text
SUMMARY
SAYSO grows community by community, free to play first. Our wedge is people who already gather around a stream and want something to do while they watch: Monad's own community today, Southeast Asian esports fans next, and creators who run watch parties after that. Money only enters where it is legal.

WHO OUR FIRST USERS ARE
1. The Monad community (now). Testnet users and builders who want apps that feel fast. They already have the habit of trying new testnet products, they understand passkeys and test tokens, and they are concentrated in a few channels we can reach directly. SAYSO is a natural showcase for Monad: a SAID card is a mined transaction about a second after the word.
2. Southeast Asian esports fans (next 3 months). Mobile Legends is the biggest esports title in the region: the MPL Indonesia Season 17 final peaked at 2.9 million viewers (Esports Charts). These fans watch on their phones, in groups, with chat open, and love predicting what casters will shout. The founder is based in Indonesia, so we can work in the language and the communities directly.
3. Creators and casters who host watch parties and replays (3 to 6 months). They have audiences and want engagement tools. SAYSO gives them a three-minute interactive segment with a leaderboard, and a revenue share once sponsored words exist.

WHAT WE LEARNED SO FAR
8 early testers played closed builds. They loved the gameplay and the sound ("the UI is super nice, and I love the sound, it makes the platform feel lively"; "you can predict what gets said next, and it's all verifiable? Wow"). Their main ask was a simpler operator side, so creators can run episodes without us. That is the first item on our roadmap.

HOW WE REACH THEM
Phase 1, launch inside the Monad ecosystem (now to month 1)
- Weekly "SAID Night": a scheduled community episode with a live host on X Spaces and Discord, the leaderboard reset each week, and the top callers shouted out.
- Shareable result cards (next to build): after every round a player will be able to share "I called 4 of 6" with their nickname and voxel avatar, and every card links back to a free round.
- Ecosystem cross-promotion: SAYSO is a live showcase for Mera passkeys, Kuru books, Chainlink CRE and Envio, so we will ask each partner to feature it, and we will publish short build threads showing a word flipping SAID onchain.
- Zero-friction first round: one passkey tap, a free starter kit, and a round that starts on demand. Target: under 60 seconds from opening the link to the first trade.

Phase 2, Southeast Asian esports communities (months 1 to 3)
- Partner with Indonesian Mobile Legends community admins and fan pages for weekly replay episodes of licensed or creator-owned commentary.
- Indonesian-language clips and transcription, so the words on the board are the words fans actually hear.
- Campus and community game nights in Indonesia with seasonal leaderboards and sponsor prizes.

Phase 3, creators run their own episodes (months 3 to 6)
- An operator console: upload a clip, pick six words, launch. The transcripts are committed automatically, so creators cannot rig outcomes either.
- Sponsored words: a brand buys a word on the board ("Will the caster say MONAD?"), the creator earns a share, players play free.
- White-label word markets for streaming platforms and leagues.

WHY THIS WORKS
- The loop is social and fast: three minutes, six words, a result you want to share. Every round ends with a leaderboard and a reason to play the next one.
- Trust is the product. Mention markets were just pulled from a major platform amid a federal inquiry; SAYSO's answer key is onchain before the first trade and settled by Chainlink CRE, which is a story communities can verify themselves.
- Onboarding is invisible: no wallet, no seed phrase, no gas to buy.

WHAT WE MEASURE
Time to first trade, rounds per player per week, day-7 return rate, share-card click-through, and episodes started by people other than us. We will report these publicly with every SAID Night.

BUSINESS MODEL
1. Free-to-play seasons funded by sponsors and creators (sponsored words, branded episodes).
2. White-label word markets for platforms and leagues.
3. Trading fees only where real-money prediction markets are legal and after an audit. Until then SAYSO stays free to play and testnet only.

COMMITMENT
SAYSO is not a hackathon throwaway. We are committing to it beyond Metropolis: next are the operator console, a licensed clip library, Indonesian commentary, and Chainlink CRE on the DON. We would welcome every form of support the Monad ecosystem offers: mentorship, grants, introductions to creators and esports leagues, and early users.
```

### 11.4 Judge access instructions (private)

```text
No test login is needed: a passkey creates your account in one tap. Please use a phone.

1. Open https://playsayso.vercel.app on Android Chrome or iOS Safari. Desktop browsers whose passkeys live in a local profile often lack the PRF extension that Mera needs; the app tells you if so. Optional: tap "Install app" on the landing page.
2. Tap Play, then "Join with passkey". Give the passkey a name you will recognise (for example "SAYSO judge"), then confirm with your fingerprint, face or PIN.
3. In the Arena, tap "Claim starter kit". You receive 10 test AUSD and 0.5 test MON, once per account. TESTNET only, no real money.
4. Tap "Start an episode", or "Join now" if one is already running. During the 60-second pre-roll the clip is hidden: tap any word and buy YES or NO (1 AUSD is enough). Bets lock 20 seconds before kickoff.
5. Watch the board. Words flip SAID about a second after they are spoken. Tap a SAID word to cash out at 98 cents, or hold.
6. When the clip ends you land on Results. Chainlink CRE settles every word within seconds (usually under 30). Tap "Redeem AUSD" for winners. Then open Portfolio and Leaderboard (indexed by Envio).
7. Account, Sign out, then "I already have one" and pick the same passkey: the same address, balance and positions come back.

Every transaction links to the Monad testnet explorer. The full round takes about 3 minutes.

FAIR-USE LIMITS (they keep the game free during judging)
- One episode runs at a time for everyone. If one is already running, join it.
- One "Start an episode" per network (IP address) per hour.
- One starter kit per account, and one new account per network per hour. If you share Wi-Fi with another judge and see "rate-limited", switch to mobile data.
- Six clips rotate, least recently played first, so a second round gives you a different clip.

IF SOMETHING LOOKS STUCK
- Studio health (public): https://sayso-studio.43-129-38-115.nip.io/v1/health
- Contract and transactions: https://testnet.monadvision.com/address/0xc8492B2906d57c184be372899d18EDF195D11CF8
- A step-by-step evidence table with every transaction of one episode is in the README: https://github.com/febrinirwana/sayso
- If a passkey prompt shows "No passkeys available" on Android, check Settings, Passwords and autofill: Chrome uses Google Password Manager by default, and some Samsung phones save passkeys to Samsung Pass instead.
```
