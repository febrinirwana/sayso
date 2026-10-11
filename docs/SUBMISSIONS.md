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

The portal's "describe" fields allow 8,000 characters each; these stay under 3,700. Plain text, no em dashes, every claim tied to a file or receipt. Re-read each against the repo before pasting, and update the Mera paragraph that names real-phone proof once the S5 phone run (BUILD-PLAN S5, 7.7) is green. The two video fields take a public link starting with https://.

### 10.1 Best workflow with CRE

```text
SAYSO is a word-market game on replayed video clips. Each episode has six words, and each word is its own market on a Kuru order book on Monad testnet. Chainlink CRE is the only thing that can decide whether a word was said. No admin button settles an outcome.

The problem CRE solves: an outcome market is only fair if nobody can pick the answer after seeing the bets. So before the first trade, the studio commits two independent transcripts of the clip (Whisper and Vosk) as Merkle roots (rootA, rootB) in SaysoMarkets. Nothing after that moment can change what counts as "said". CRE checks the revealed evidence against those roots and writes the verdict back onchain.

Workflow (cre/resolver, TypeScript, two EVM log-trigger handlers):

1. EvidenceReady trigger, fired during playback when a word is flagged. CRE reads the episode and word state and both roots from SaysoMarkets with the EVM client. It fetches the revealed transcript chunks over the HTTP capability from the studio's reveal API (an external system, not a chain), using consensusIdenticalAggregation on schema-normalized JSON so every node must see the same chunk. It verifies each chunk's Merkle proof against the committed roots, then runs the shared matcher to find the spoken time. Two engines must agree within 1,500 ms. It then sends a report with the word ids, the outcomes and an evidence hash.

2. EpisodeClosed trigger. CRE re-reads every word of the episode, fetches the chunks it needs and resolves the remaining words. A word spoken late still resolves YES at close, and every unspoken word resolves NO. One report settles the episode.

3. SaysoMarkets accepts a report only from the Chainlink forwarder (ReceiverTemplate plus an explicit msg.sender check, and the report origin must be our reporter address). It emits WordResolved and winners redeem 1 AUSD per token. The owner cannot settle. The only admin path is voiding a word after 24 hours with no report.

The workflow fails closed. If a proof does not verify, the engines disagree or the word enumeration is incomplete, it emits no report and the market stays unsettled. A failed proof never produces a wrong payout.

Verified on Monad testnet (chain 10143):
- Episode 12: evidence report 0x216b9f1434c1239ed03f68eb2cb6fc30d4c704c90b98712434c7b681195e2348 (block 69,515,751, status 1) resolved word 68 YES. Close report 0xc3d77d95a48499ad7a5d39f604d775d0acf9f25887032e70bda1e9bab0a3dba6 (block 69,516,169, status 1) resolved word 67 YES (late) and words 69 to 72 NO, and the episode settled.
- Our hosted studio then ran the same workflow through the CRE CLI for later episodes: 24 successful runs and 2 failed runs recorded. Nine episodes have settled on testnet, and after each the house recycled every word unattended.

Honest status: the workflow runs through the CRE CLI simulation (cre workflow simulate --broadcast), which delivers real reports to the mock forwarder on Monad testnet. Deploy access to the live DON has been requested and is not enabled on our organization, so settlement runs in simulation mode. We say so plainly instead of claiming a DON deployment. The receiver is written for the production forwarder too, so going live is one setter call plus the deploy.

Why CRE and not a bot: one verifiable workflow combines an onchain read (roots, word state), an external HTTP source (revealed chunks), cryptographic verification and an onchain write. Replace it with a script and the fairness guarantee of the product is gone.

Code: cre/resolver/src/workflow.ts, resolve.ts, decide.ts. Contract: contracts/src/SaysoMarkets.sol (_processReport).
```

Video (up to 2 minutes, required): show `cre workflow simulate` finishing with a successful result, the two report transaction hashes opening on the explorer with status 1, the `WordResolved` event, and the `_processReport` forwarder check in the contract. Say "simulation" out loud.

### 10.2 Best Mera-Powered UX on Monad

```text
Mera is the entire account layer of SAYSO. There is no wallet extension, no seed phrase screen, no email login and no custody backend. A player taps "Join with passkey" and is in.

How it works (apps/web/src/account):
- Join: createPasskeyWithPrfOutput creates a discoverable passkey bound to our relying-party ID. The 32-byte PRF output becomes the key material: BIP-39 entropy, then the standard path m/44'/60'/0'/0/0, then a Mera secp256k1 signing session wrapped by toViemAccount. Every intermediate (the PRF output, the seed, each parent HD node, the raw private key) is zeroed as soon as it is used, so only the memory-owned Mera session survives.
- Keys never leave memory: no key or session material is written to localStorage, IndexedDB, cookies or a server (the only stored browser value is the sound on/off preference). Our studio holds no player key. It only sends a starter balance to the player's public address.
- Prompt-free signing: after the one ceremony, every trade, cash-out and redeem is signed by the in-memory session with no further prompt. Transactions go through a serialized send queue with explicit gas, and the next transaction waits for a strictly later block, so a player's actions never race each other on Monad.
- Session end and re-prompt: the session ends on sign-out, reload or tab close. If it ends in the middle of an action, the app asks for exactly one passkey tap (getPasskeyPrfOutput). It then accepts only the same address as before. A passkey for a different account can never send a transaction on behalf of the original player (accounts check in AccountProvider.tsx).
- Restore: clear all site storage, tap "I already have one", and the same passkey rebuilds the same address, the same AUSD balance and the same positions, because positions and balances live onchain and in the indexer, never in browser storage.
- Failure UX: if the device or browser returns no PRF output, the player sees a dedicated screen instead of a broken join (PRF_UNAVAILABLE).

Live Monad transactions through this account: starter drip, buy YES or NO on a word, cash out when the word flips to SAID, and redeem winners after CRE settles. All run on Monad testnet against Kuru books and SaysoMarkets.

What we verified: join, clearing all storage and restoring the same address (Edge with a CTAP2 PRF virtual authenticator at 412 px, BUILD-PLAN 7.3), no-PRF handling, and a live episode that joined, received the starter balance, bought, saw the word flip and sold, all signed by the Mera session. The production app is https://playsayso.vercel.app, so passkeys are bound to that real domain. Real-phone passkey proof on that domain is the one item still being recorded.

Code: apps/web/src/account/derive.ts, AccountProvider.tsx, sendQueue.ts, and the join screen in apps/web/src/screens/join.
```

Video (optional, up to 2 minutes): join with one tap, first trade and its elapsed seconds, a session re-prompt, clear site data, restore to the same address and the same positions. Record the device and browser. Same-browser cached state is not restore proof.

### 10.3 Best Use of Envio

```text
SAYSO's history, positions and rankings all come from an Envio HyperIndex indexer. It is not installed as decoration. Remove it and the Leaderboard, Portfolio history and Results screens go empty.

What we index (indexer/config.template.yaml, schema.graphql, src/handlers.ts):
- Source: HyperSync on Monad testnet (https://monad-testnet.hypersync.xyz), starting at the SaysoMarkets creation block. Sixteen SaysoMarkets events (EpisodeCreated, WordAdded, WordListed, SetMinted, SetBurned, Traded, WordFlagged, EvidenceReady, EpisodeClosed, WordResolved, EpisodeSettled, Redeemed, WordVoided and admin updates) plus OutcomeToken Transfer.
- Entities: Episode, Word, Trade, Position, Player and EpisodePlayer, with relations between them.
- Derived data, not raw logs: each Position tracks YES and NO balances, cash paid in, cash taken out and redeemed value. Each Player rolls these up into trades, volume, settled value and profit. Each EpisodePlayer holds the per-episode profit and a competition rank, with ties broken deterministically by address.
- Correct profit: profit counts only words the CRE report has resolved. Realized profit is cash in minus cash out plus the value of tokens still held at the resolved outcome. An open position can never inflate a ranking before it settles.

What it drives in the app (apps/web/src/data/indexer.ts, records/indexer.ts):
- Leaderboard: all-time and per-episode rankings, queried from Player and EpisodePlayer, ordered by profit.
- Portfolio: the player's positions and full trade history, queried by address, plus redeemable amounts.
- Results: the episode, its six resolved words, the evidence hash and the resolve transaction, next to the player's own cashflow.
- Arena: recent episodes and their settled state.

The split is deliberate. The chain stays the source of truth for balances, prices and trading, and Envio supplies the history and derived numbers the chain cannot give cheaply.

Deployment: Envio Cloud, public GraphQL at https://indexer.dev.hyperindex.xyz/0c56fbe/v1/graphql, deployed from the indexer/ directory of the public repo. The config, schema, handlers and a handler test suite (indexer/src/handlers.test.ts) are all public.

End to end path: a real trade or CRE resolution receipt on Monad testnet, then the handler writes Position and Player entities, then GraphQL, then the Leaderboard and Portfolio screens a player sees.
```

Video (optional, up to 2 minutes): make a trade, show the transaction on the explorer, then the same trade appearing in Portfolio history and the profit moving on the Leaderboard after settlement, with the GraphQL query shown once. For two players, reconcile profit against their actual cashflows before filming.

Before pasting 10.3, run one GraphQL query against the endpoint and confirm it answers at chain head; the indexer deployment is a 30-day development instance (ARCHITECTURE, hosting table).
