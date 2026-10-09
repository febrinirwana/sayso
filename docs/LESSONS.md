# Lessons

Newest on top. Each entry: root cause, then the durable rule.

## Technical

### 2026/10/10 — A server CRE run must not compile the workflow

- **Cause:** `cre workflow simulate` compiles the TypeScript resolver to WASM (and downloads Javy the first time) inside each run. On the 2-vCPU VPS under the service's CPU/memory caps that overran the runner's 120 s timeout, so episode 18's evidence run went ambiguous and, by design, blocked every later simulation until reconciled.
- **Rule:** build the resolver WASM once per release and set `CRE_RESOLVER_WASM` so runs use `--wasm` (6.4 s on the same host); rebuild it whenever `cre/resolver` changes.

### 2026/10/10 — Never run a Linux package install against the Windows checkout

- **Cause:** a WSL `bun install` during release staging wrote Linux symlinks into the repository's `node_modules` through `/mnt/c`. Windows tools then failed with "Unsupported reparse point type" and Bun could not overwrite them (`EEXIST`).
- **Rule:** stage releases only under a Linux path such as `/tmp`, verify the install landed there, and repair a polluted checkout by deleting the Linux links from WSL, then reinstalling on Windows.

### 2026/10/09 — A migrated studio database must catch up only its own episodes

- **Cause:** studio-data-12's CRE log catch-up started at the contract deployment block. Episodes 1–11 were created by earlier development databases, so their `EvidenceReady` logs had no local projection; discovery (correctly) refused to skip them, held its cursor at 69,236,243 and backed off for up to 10 minutes, which delayed episode 14's settlement discovery.
- **Rule:** `SAYSO_START_BLOCK` and the stored cursor start at the create block of the database's first episode; check `cre_runner_state` before starting a migrated studio.

### 2026/10/09 — A reservation that nothing signed must not outlive its request

- **Cause:** The starter drip reserves a row (sender gate plus the IP hour) before signing. A transient public-RPC failure between reservation and signing left an unsigned `pending` row; status reads kept answering `pending`, the web never re-posted, and the global "one unresolved sender nonce" gate then refused every other player's drip.
- **Rule:** Release a durable reservation on any failure while nothing is signed; keep only signed legs, which recover by re-posting the same bytes. Every client path that shows "pending" must be able to re-post the idempotent claim.

### 2026/10/09 — A settlement retry budget must not strand the episode queue

- **Cause:** The CRE runner gave every run five back-off retries (~13 min) and then marked it `failed`. While CRE login was missing, episode 11's close run failed permanently; an unsettled Closed episode blocks all later admission, so one outage would have stopped the product for the rest of judging. CRE QuickJS also lacks a global `URL`, so `z.url()` rejected every reveal URL only inside the real simulator.
- **Rule:** Terminal retry budgets belong only to work something else can redo (evidence runs; the close run re-decides every word). The run that unblocks admission keeps a capped back-off forever. Validate workflow config with pure checks, and prove a CRE workflow under the real CLI before trusting Node-hosted tests.

### 2026/10/09 — Isolate Envio simulation from deployed address and block filters

- **Cause:** The test config replaced only an inline `address: ...` scalar. Testnet deployment changed it to a multiline list and a nonzero creation block, leaving all ten block-1 synthetic handler scenarios unrouted in a clean Linux verification.
- **Rule:** The simulation fixture must replace either address form and reset its start block to zero, without changing production filters or handler assertions. Run the full economic handler suite from generated clean-checkout dependencies after deployment config changes.

### 2026/10/09 — Match received/spent cashflows at the consumer boundary

- **Cause:** The live episode 12 buy/cash-out receipts and Envio position agreed, but Results interpreted `cashIn` as spending, reversed the profit sign and added `redeemed` again. Portfolio treated any zero-token history row as redeemed, even though the player had sold into a bid and CRE had never settled the word.
- **Rule:** Follow ERD: `cashIn` is received AUSD and already includes redemptions; `cashOut` is spent AUSD. Profit is received minus spent plus unredeemed winning value. Use actual redemption totals for redemption labels, and regress both a real cash-out and partial/full redemption without double counting.

### 2026/10/09 — Initial funding is not an unattended operating budget

- **Cause:** The initial budget assigned market creation to DEPLOYER as a one-time expense, but OPERATOR creates and lists six new books every episode. Live episode 11 billed 1.229528808 OPERATOR and 1.294168146 BOT MON; repeated integration runs depleted role-specific gas reserves despite a well-funded DRIP.
- **Rule:** Budget recurring create/list and seed/cleanup separately from deployment, drip and CRE. Deduplicate receipt hashes across top-level actions and journal steps, use declared gas billing, and project the actual hourly/on-demand workload. Closing initial funding never proves judging-period runway; do not transfer between roles or disable the schedule without authorization.

### 2026/10/09 — Bound the browser action, not only the entire test

- **Cause:** A SAID event opened the ticket automatically; the live test clicked the card underneath that modal and waited for its 20-minute test timeout. The timeout hid a successful buy/flip behind a long stalled run.
- **Rule:** Reuse the visible ticket, bound individual interactions and receipt waits, and persist partial evidence in `finally`. A successful account test or chain cash-out does not replace the live browser cash-out path.

### 2026/10/08 — Fit the house seed inside the pre-roll

- **Cause:** Episode 5 seeded only 13 of 27 steps in its 60 s pre-roll: every BOT step ran 12-16 serial RPC round trips (forced chain id, a bytecode read per address, head, estimate, fees, nonce, balance, two receipt pre-checks, viem's block-watching receipt wait) plus between-step word, clock, allowance and log reads, about 3 s per receipt-gated step on a ~130 ms public RPC. Making receipts faster then exposed a stale 400 ms head cache: the post-cancel book snapshot read state from before the cancel's own block.
- **Rule:** Count serial rounds, not just requests, on a receipt-gated sender: put every pre-sign read (chain id, successor head, fees, nonce, balance, estimate, timing guard) in one parallel round, verify bytecode once per process, skip receipt pre-checks for bytes never sent, read allowances once up front and record books after the last ladder. Anchor any snapshot that follows a receipt at that receipt's block. Keep the fake-RPC test asserting ≤ 4 rounds per step; live, a 27-step seed took 27 s from list receipt.

### 2026/10/08 — Budget studio RPC calls per block

- **Cause:** The studio clock polled every 50 ms and each runner, maker and CRE call opened its own uncached transport, re-reading immutable episode/word/market data and bytecode: about 1,540 requests/s while Live in a fake-transport replay, against a public RPC that rate-limits, with failures swallowed as fixed text. Seeding also approved AUSD twice per word and deposited quote per word, 42 transactions per episode.
- **Rule:** Share one transport per RPC URL that caches by mutability (immutable forever, head per 400 ms block, state 2 s, chain id re-read before any sign or broadcast), sleep to the next scheduled action, and back off on 429 without retrying writes. Keep a fake-transport test asserting ≤ 8 req/s Live and ≤ 2 idle, and log failures as closed codes, never messages. Reuse bounded allowances and batch deposits.

### 2026/10/07 — Capture verified request identity before body buffering

- **Cause:** Hono bodyLimit replaces the raw Request for streamed bodies; identity keyed by the original object disappeared, causing valid drip claims to return invalid_ip.
- **Rule:** Store the already-verified IP in request context before buffering. Exercise streamed HTTP grants and same-IP rate limits through the real middleware, not only the identity helper.

### 2026/10/07 — A read-only studio checkout needs a writable CRE workflow

- **Cause:** CRE compilation writes beside the workflow; relocating source without its compiler contract also failed to find `tsconfig.json`. A read-only service checkout would break settlement compilation despite a healthy HTTP process.
- **Rule:** Keep application/dependencies read-only, copy workflow/config to private writable state, inherit strict typechecking with deployment-local include paths, and compile under the actual service sandbox before enabling broadcasts.

### 2026/10/07 — Reverse-proxy IP limits need an explicit trust boundary

- **Cause:** Direct-peer accounting behind Caddy groups all players under loopback; blindly trusting browser-supplied forwarding headers lets players bypass drip limits.
- **Rule:** Require explicit same-host proxy mode, force loopback binding, overwrite a single actual-peer header at Caddy and validate it at studio. Keep direct mode header-blind; a CDN needs its own reviewed boundary.

### 2026/10/06 — Public RPC log scans need 100-block windows

- **Cause:** The integrated fork inherited Monad's public RPC limit: an `eth_getLogs` request spanning 1,000 blocks failed with HTTP 413. The maker and CRE adapters also used windows larger than the observed 100-block limit.
- **Rule:** Scan inclusive windows of at most 100 blocks, advance durable CRE cursors only after canonical receipts are projected, and anchor book discovery to its listing block. Keep a later-trigger catch-up regression.

### 2026/10/06 — Kuru flip cancellation consumes both active partners

- **Cause:** A partial fill created two live paired IDs. Canceling both IDs in one batch reverted `OrderAlreadyFilledOrCancelled` after the first consumed the pair, despite the docs' idempotency wording.
- **Rule:** Read actual `s_orders.flippedId`, cancel one representative per active pair, and confirm the complete live house snapshot is empty. Never swallow cancellation errors or trust only the original seed IDs.

### 2026/10/06 — Native transfers to delegated accounts need execution gas

- **Cause:** The first real HTTP drip fork proof reverted at exactly 21,000 gas because the recipient carried EIP-7702 code. A code-bearing account can execute storage writes or forward the value; a successful receipt does not imply the recipient retained it.
- **Rule:** Use 21,000 only for empty-code recipients. Estimate the exact native invocation otherwise and budget/sign the same gas with the shared margin. A reverting receiver must fail preflight before either drip leg.

### 2026/10/06 — No report is not necessarily an ambiguous write

- **Cause:** The resolver legitimately withholds a report for false evidence or a pre-write capability failure. Treating every CLI completion without a report receipt as a possibly broadcast write blocked the subsequent close trigger.
- **Rule:** A bounded, exact pre-write completion marker may authorize terminal no-report or safe retry only after exit 0. Never emit it after entering submission. Actual report proof also binds the durable sender nonce; write-time timeouts remain ambiguous.

### 2026/10/06 — Recovery and shutdown must retain signer boundaries

- **Cause:** Receipt-null state checks could discard a saved signed flag after expiry/finalization; fresh adapters also forgot the previous receipt block, and process shutdown could close SQLite before the operator wrote its receipt.
- **Rule:** Replay saved bytes before unsigned skips, restore each role's latest confirmed receipt on restart, wait for a strictly later block before signing, and drain admitted work before closing the database.

### 2026/10/06 — Decode git document bytes explicitly as UTF-8

- **Cause:** Focused documentation staging decoded git output through the Windows default locale and corrupted math/range/cents symbols.
- **Rule:** Capture git bytes, decode UTF-8 explicitly and read documentation with an explicit UTF-8 encoding. Do not let platform locale rewrite unchanged prose.

### 2026/10/05 — Envio event selectors must preserve authoritative ABI metadata

- **Cause:** Type-only event signatures in Envio config replaced ABI field names with `_0`–`_3` and lost indexed metadata. A clean verification copy missing `vitest.config.ts` then loaded the intentionally unset production receiver instead of its isolated test config.
- **Rule:** Select events by name from core-generated ABI JSON; include every workspace's test configuration in clean-copy proofs. Run Envio 3.12.1 under Linux/macOS (WSL on Windows), never skip its native checks.

### 2026/10/05 — Require settlement identity before deployment broadcasts

- **Cause:** The deployment script accepted a zero simulation reporter and did not install a DON workflow ID, while both receiver checks are conditional; a valid forwarder alone did not bind outcomes to the authorized resolver.
- **Rule:** Reject missing mode-specific identity before `startBroadcast`, install authentication before enabling the operator, and test both unsafe and configured deployment paths.

### 2026/10/05 — Studio SQLite tests need Bun, not Node

- **Cause:** `bun run test` launches Vitest under Node, which cannot resolve `bun:sqlite`; a probe failed with `Cannot find package 'bun:sqlite'` while `bun --bun vitest run` ran a real SQLite transaction.
- **Rule:** Keep the studio test script on `bun --bun vitest run` and test against the production schema; never swap in a mocked database to make Node happy.

### 2026/10/05 — SDK compiler dependencies must be explicit under Bun isolation

- **Cause:** CRE SDK 1.23.0's compile scripts import `typescript` but list it only as a dev dependency. Bun's isolated linker resolves it upward from the SDK's realpath and found the root TypeScript 7, which has no compiler API; a workspace-local TypeScript pin did not help, and patching the manifest alone did not change the locked graph.
- **Rule:** Patch the SDK manifest to declare its compiler and keep the nested resolution in `bun.lock`; prove a clean `bun install --frozen-lockfile` still builds the WASM, and re-check both on any SDK upgrade.

### 2026/10/05 — Resolve contract reads before a one-call prank

- **Cause:** In `vm.prank(player); OutcomeToken(markets.word(id).no).transfer(...)` the `word` getter consumed the prank, so the transfer ran as the test contract and a set test failed for the wrong reason.
- **Rule:** Read addresses into locals before `vm.prank`, or use `vm.startPrank` when several calls must share the caller.

### 2026/10/05 — Prove exhausted order-book levels, not only partial fills

- **Cause:** The first fork probe filled part of one Kuru level; Kuru charges one extra quote unit when a level is exhausted, so exact-size YES buys sized with plain ceil rounding reverted on the real book while the mock passed.
- **Rule:** Before trusting quote maths or a mock, run partial, exhausted-integral and exhausted-fractional levels against the real book on a fork and pin each number in a parity test.

### 2026/10/05 — Kuru amounts use the book's precision, not the token's decimals

- **Cause:** `placeAndExecuteMarketBuy` takes `quoteSize` in pricePrecision units (1e4 = 1 AUSD), while `bestBidAsk` returns 1e18-scaled prices; passing 6-decimal AUSD amounts reverted `TransferFromFailed()` on a fork (spike S2+S3).
- **Rule:** Convert at one boundary (`KuruTrade` in contracts, `units.ts` off-chain) and test each Kuru call against a fork before trusting a unit.

### 2026/10/05 — Soldeer needs its config location when nothing can prompt

- **Cause:** `forge soldeer install` asks where to keep its config; with no terminal it failed with "error during IO operation: not connected".
- **Rule:** Run Soldeer with `--config-location foundry` in scripts, agents and CI.

### 2026/10/05 — A release tag is not an installable version

- **Cause:** Vosk 0.3.50 is tagged on GitHub but has no binaries and no PyPI wheel; the pinned version could not be installed (spike S7).
- **Rule:** Before pinning, install the exact version from the registry the project uses. Pin what installs; note the tag gap beside the pin.

### 2026/10/05 — Run the proof before writing it in a commit body

- **Cause:** A commit body can state a check that was never executed; the history then carries an unverified claim.
- **Rule:** Run the exact command first, read its output, then write it as proof. If it was not run, the body says so.

### 2026/10/05 — Re-probe external state before planning around it

- **Cause:** The testnet AUSD faucet reverted for every fresh address one day and accepted them the next.
- **Rule:** Faucet limits, balances and tenant permissions are observations with a date, not facts. Re-check before a plan depends on them and record the date.

### 2026/10/05 — Never track a file that reveals an outcome

- **Cause:** A tracked clip manifest with its word list and transcript would let anyone read the answers before trading.
- **Rule:** Outcome-bearing data (manifests, transcripts, flag plans) lives in studio data and becomes public only through the reveal schedule. Track fixtures only.

### 2026/10/05 — A reveal must never lead what the player hears

- **Cause:** Revealing a chunk at its end on the studio clock exposes the last seconds before delayed players hear them.
- **Rule:** Reveal time = chunk end + presentation delay + margin. Any new reveal or flag path is checked against the player's presentation time, not the studio clock.

### 2026/10/05 — Halt a market you do not own by pulling your own quotes

- **Cause:** Kuru's `toggleMarkets` is owner-only; our wallet gets `Unauthorized()`.
- **Rule:** Design halts as house quote pulls one block ahead of the event, and keep players on immediate-or-cancel orders so nothing of theirs rests on the book.

### 2026/10/05 — Match the market type to the base asset

- **Cause:** Kuru `deployProxy` reverts `MarketTypeMismatch()` (`0xbd6898be`) when the type does not fit the base: type 1 is native base, type 0 is ERC-20 base.
- **Rule:** Simulate every market deployment with the real parameters before writing them into code or docs.

### 2026/10/05 — Decode events from the vendored ABI, not the docs page

- **Cause:** Kuru's documentation declares event fields that differ from the deployed contracts.
- **Rule:** Derive topics from the vendored ABI, compare with a real log, and only then decode or value fills.

### 2026/10/05 — Vendor ABIs instead of SDKs that drag in a second web3 stack

- **Cause:** Kuru's SDK depends on ethers v5; SAYSO uses viem only.
- **Rule:** Copy the ABI JSON into `packages/core` with its source version; never add a second chain library for convenience.

### 2026/10/05 — CRE simulation and production use different forwarders

- **Cause:** `cre workflow simulate --broadcast` delivers through `MockKeystoneForwarder`; deployed workflows use `KeystoneForwarder`; deployment needs approved access.
- **Rule:** Keep the forwarder settable by the owner, record each settlement's mode, and request deploy access on day one.

### 2026/10/05 — Accept the forwarder's real metadata length

- **Cause:** The production forwarder passes 64 bytes of metadata (62 bytes of identity plus a 2-byte report ID).
- **Rule:** Never require `metadata.length == 62`; decode the first 62 bytes and ignore or read the report ID.

### 2026/10/05 — Simulation triggers do not fire on their own

- **Cause:** In `cre workflow simulate`, triggers are selected manually; only deployed workflows watch logs.
- **Rule:** Until deploy access exists, the studio drives the simulator for each trigger transaction; nothing assumes a log trigger fires by itself.

### 2026/10/05 — Monad bills the gas limit

- **Cause:** Monad charges the gas limit, not gas used.
- **Rule:** Every transaction sets an explicit limit from measured gas plus 20%; never rely on estimation padding.

### 2026/10/05 — Sequence low-balance senders by block

- **Cause:** Monad's reserve-balance rule can reject closely spaced spending from a low-balance sender; the emptying exception needs no other transaction from that sender in the prior three blocks.
- **Rule:** Sequence a player's transactions by block number, never a wall-clock sleep; give each studio role its own key and keep it above the reserve.

### 2026/10/05 — Fix the passkey domain before the first passkey

- **Cause:** Passkeys are bound to the relying-party ID; changing the domain orphans every account.
- **Rule:** Choose the production domain (`VITE_RP_ID`) before any real passkey exists and never change it.

## Working with the user

### 2026/10/05 — Explain first, build after "letsgo"

- **Cause:** The user wants to judge an idea and its trade-offs before any file exists.
- **Rule:** Brainstorm in chat with a recommendation and numbered decisions; once approved, execute end to end without re-asking.

### 2026/10/05 — Label every claim

- **Cause:** The user rejects mediocrity and anything hallucinated.
- **Rule:** Mark claims [V] with a source, [I] for inference, [U] with the spike that settles it. Say "not verified" plainly.

### 2026/10/05 — Reply in the user's register

- **Cause:** The user writes mixed Indonesian and English.
- **Rule:** Chat replies follow that mix; docs, code and commits stay in English.

### 2026/10/05 — No generic AI interface

- **Cause:** The user explicitly rejected "AI slop" visuals.
- **Rule:** Follow PRD section 8; every screen needs a deliberate visual idea and is checked rendered on a phone viewport.

### 2026/10/05 — Small commits, docs first, testnet first

- **Cause:** The user reviews history as a record of real work.
- **Rule:** One behaviour per commit, docs before code, testnet before anything else, body with why and proof.

### 2026/10/05 — Keep projects visibly separate

- **Cause:** Two hackathon projects share a parent folder and a machine.
- **Rule:** Each project has its own repo, identity and `handoff/<project>/` folder; never read or write another project's handoff.

### 2026/10/05 — Prefer free tools, explain choices plainly

- **Cause:** The user asked for free-tier tooling first and plain explanations of framework choices.
- **Rule:** Default to free or open tools; when a choice is technical, give one paragraph on what it is and why it fits.
