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

[Resources](https://hackathon.monad.xyz/resources) offers **one voucher per team per resource**: Quicknode Build 3 months (new accounts only), Tenderly Pro, Zerion API Builder 1 month, BlockVision Lite 2 months, Spectrum Business 2 months, Dwellir Developer 3 months. The user claimed Quicknode Build on 2026-10-09; it serves only the studio's private `RPC_URL` (INTEGRATIONS §1). Winner services/rebates on Prizes are not extra cash; Envio's winner perk is two months Cloud hosting free and a third month at 50% off.

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
