# Lessons

Newest on top. Each entry: root cause, then the durable rule.

## Technical

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
