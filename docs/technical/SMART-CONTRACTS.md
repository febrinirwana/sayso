# Smart contracts

Contract surface for SAYSO on Monad testnet (10143): storage, functions, events, invariants, Kuru and CRE wiring, gas and deployment. Flows that call these functions are in `ARCHITECTURE.md` section 5.

Toolchain: Foundry 1.8.4, Solidity 0.8.37, OpenZeppelin Contracts 5.7.0 (plus the upgradeable package at the same version for clone initializers), forge-std 1.17.0. Dependencies install through Soldeer and are pinned in `contracts/soldeer.lock`; `evm_version = "prague"`, the fork Monad executes [V: [Monad Hardhat guide](https://docs.monad.xyz/tooling-and-infra/toolkits/hardhat)]; `network = "monad"` makes tests and gas reports use Monad's gas model and 128 KB code limit [V: `forge config` shows the key on 1.8.3].

## 1. Contracts

| Contract | Role |
|---|---|
| `SaysoMarkets` | Episodes, words, collateral, trade entry points, CRE receiver. Inherits CRE `ReceiverTemplate` (which brings `Ownable`). |
| `OutcomeToken` | ERC-20 implementation (6 decimals) cloned twice per word: YES and NO. Mint and burn only by `SaysoMarkets`; `SaysoMarkets` is a trusted spender, so players never approve outcome tokens. |
| `KuruTrade` (library) | Wraps Kuru order book calls: market deployment and approvals, IOC buy and sell, exact-size YES buy. Converts 6-decimal amounts to Kuru units and measures every fill by balance delta. |

## 2. Storage

```solidity
enum EpisodeState { Scheduled, Live, Closed, Settled }   // Live is derived from block.timestamp
enum WordState { Open, SaidPending, Yes, No, Void }

struct Episode {
    bytes32 clipId;
    bytes32 rootA;        // engine A transcript Merkle root
    bytes32 rootB;        // engine B transcript Merkle root
    uint64 startsAt;      // unix seconds
    uint64 endsAt;
    uint64 closedAt;
    uint8 wordCount;
    uint8 resolvedCount;
    bool listed;          // Kuru markets deployed
    bool closed;
}

struct Word {
    uint32 episodeId;
    WordState state;
    uint16 chunkA;        // flagged chunk index, engine A
    uint16 chunkB;
    uint32 offsetMs;      // agreed spoken time from clip start
    bytes32 text;         // UTF-8, at most 32 bytes
    address yes;
    address no;
    address market;       // Kuru YES/AUSD order book
    uint256 sets;         // before finalization: outstanding complete sets; after: remaining maximum payout liability
}
```

Immutables: `AUSD`, `KURU_ROUTER`, `TOKEN_IMPL`. Mutable: `operator`, `episodesPaused`, `reportOrigin`, `totalSets` (ÃŽÂ£ `word.sets` over all words: the AUSD the contract must hold; after a word finalizes its `sets` is the remaining payout reserve, not token supply).

Readers: `episode(uint32) returns (Episode)`, `word(uint256) returns (Word)`, `episodeWords(uint32) returns (uint256[])`; unknown ids revert. Episode and word ids start at 1, and word ids are global across episodes. Outcome clones are named `YES <word>` / `NO <word>` (trailing NUL bytes dropped) with symbols `YES` / `NO`.

## 3. Functions

Amounts are in 6-decimal units for AUSD, YES and NO.

| Function | Caller | Rules |
|---|---|---|
| `createEpisode(bytes32 clipId, bytes32 rootA, bytes32 rootB, uint64 startsAt, uint64 endsAt, bytes32[] words) returns (uint32 episodeId)` | operator | 1 to 8 words, none zero; `startsAt >= block.timestamp`; `endsAt > startsAt`; not paused. Clones YES and NO per word. |
| `listEpisode(uint32 episodeId)` | operator | Existing episode, once, before `endsAt` (pausing does not block listing an episode already created). Deploys one Kuru market per word (`deployProxy` type 0, parameters in section 6) and approves each book for AUSD and that word's YES. Trading requires `listed`. |
| `mintSet(uint256 wordId, uint256 amount, address to)` / `mintSetWithPermit(uint256 wordId, uint256 amount, address to, uint256 deadline, uint8 v, bytes32 r, bytes32 s)` | anyone | Episode listed and not closed; word Open or SaidPending. Pulls `amount` AUSD, mints `amount` YES and NO to `to`. The permit is attempted in `try/catch` and the AUSD allowance stays authoritative, so a front-run permit cannot block the mint. |
| `burnSet(uint256 wordId, uint256 amount, address to)` | holder | Word not final (also after close). Burns both sides from the caller, pays `amount` AUSD to `to`. `SetMinted.account` is the recipient; `SetBurned.account` is the holder. |
| `buyYes(uint256 wordId, uint256 ausdIn, uint256 minYesOut) returns (uint256 yesOut)` | anyone | Word listed and not final (trading continues after close until the word resolves; close only stops new sets). IOC market buy; unspent AUSD is refunded in the call. |
| `sellYes(uint256 wordId, uint256 yesIn, uint256 minAusdOut) returns (uint256 ausdOut)` | holder | Word listed and not final. IOC market sell; unsold YES is returned in the call. Cash-out uses this against the 0.98 bid. `Traded` carries the measured fill and the net AUSD moved, refunds excluded. |
| `buyNo(uint256 wordId, uint256 noAmount, uint256 maxAusdIn) returns (uint256 ausdSpent)` | anyone | Episode listed and not closed; word Open or SaidPending. Creates `noAmount` sets, sells all `noAmount` YES via IOC (partial fill reverts), sends `noAmount` NO and pulls only the measured net cost `noAmount Ã¢Ë†â€™ proceeds` from the player, which must be Ã¢â€°Â¤ `maxAusdIn`; proceeds above `noAmount` revert. |
| `sellNo(uint256 wordId, uint256 noIn, uint256 minAusdOut) returns (uint256 ausdOut)` | holder | Word listed and not final, also after close. Pulls `noIn` NO, buys at least `noIn` YES with pooled AUSD via `KuruTrade.buyExactBase` (quote cap `noIn Ã¢Ë†â€™ minAusdOut`), burns exactly `noIn` of both sides, pays `noIn Ã¢Ë†â€™ spent` and sends YES rounding dust to the player. Thin asks or payout slippage revert the whole call. |
| `flagSaid(uint256 wordId, uint16 chunkA, uint16 chunkB, uint32 offsetMs)` | operator | Episode listed and live (`startsAt <= block.timestamp < endsAt`); word Open. Sets SaidPending, records `chunkA`, `chunkB`, `offsetMs` and emits `WordFlagged`. Cannot rewrite a flag or settle anything. Pause does not block it. |
| `markEvidence(uint32 episodeId, uint256[] wordIds)` | operator | Existing episode; every word exists, belongs to it and is SaidPending. Validates the whole batch, then emits one `EvidenceReady`; changes no state. Allowed after clip end and while paused. |
| `closeEpisode(uint32 episodeId)` | operator | `block.timestamp >= endsAt`; once. Sets `closed`, records `closedAt = block.timestamp` (the 24 h void clock starts here) and emits `EpisodeClosed`. Stops `mintSet`, `mintSetWithPermit` and `buyNo`; burns and trades that create no sets continue until each word resolves. Pause does not block it. |
| `onReport(bytes metadata, bytes report)` | CRE forwarder | Via `ReceiverTemplate`: sender must be the forwarder; workflow ID must match when set; `tx.origin` must equal `reportOrigin` when set (section 7). `report = abi.encode(uint32 episodeId, uint256[] wordIds, uint8[] outcomes, bytes32 evidenceHash)`. |
| `redeem(uint256 wordId, uint256 amount)` | holder | Word Yes: burns the caller's YES, pays `amount`. Word No: burns NO, pays `amount`. Void: burns `amount` YES when the caller's YES balance covers it, otherwise `amount` NO, and pays `floor(amount / 2)`; a holder of both Void sides redeems each side in its own call. Reduces the word's reserve before paying, is non-reentrant and ends with the collateral check. Unresolved words cannot redeem; final words cannot `burnSet`. |
| `voidWord(uint256 wordId)` | owner | Word Open or SaidPending, episode closed, `block.timestamp >= closedAt + 24 h`. Sets Void, recomputes the reserve, increments `resolvedCount`, emits `WordVoided` and, if it was the last open word, `EpisodeSettled`. Moves no AUSD. |
| `setOperator(address)`, `setEpisodesPaused(bool)`, `setReportOrigin(address)` | owner | Forwarder and expected workflow ID setters come from `ReceiverTemplate`. |

All four trade functions are non-reentrant and end by requiring `AUSD.balanceOf(SaysoMarkets) >= totalSets` (`InsufficientCollateral`), so an existing shortfall can never be carried through a successful trade.

Report processing (`_processReport`): first requires a non-zero configured forwarder equal to `msg.sender` (independent of the template's optional check) and, while `reportOrigin` is non-zero, `tx.origin == reportOrigin`. Decodes `(uint32 episodeId, uint256[] wordIds, uint8[] outcomes, bytes32 evidenceHash)`; the episode must exist and the arrays must have equal, non-zero length. Every word must exist, belong to the episode and be Open or SaidPending. Only outcomes 2 (Yes) and 3 (No) are accepted: Yes requires `block.timestamp >= startsAt`; No requires the episode closed. Open Ã¢â€ â€™ Yes (a missed flag) and SaidPending Ã¢â€ â€™ No (a false flag) are valid. Any invalid entry, duplicates included, reverts the whole report. Each accepted word increments `resolvedCount` and emits `WordResolved`; finalizing the last word emits `EpisodeSettled` exactly once. Reports move no AUSD.

## 4. Events

| Event | Indexed |
|---|---|
| `EpisodeCreated(uint32 episodeId, bytes32 clipId, bytes32 rootA, bytes32 rootB, uint64 startsAt, uint64 endsAt)` | `episodeId` |
| `WordAdded(uint32 episodeId, uint256 wordId, bytes32 text, address yes, address no)` | `episodeId`, `wordId` |
| `WordListed(uint256 wordId, address market)` | `wordId` |
| `SetMinted(uint256 wordId, address account, uint256 amount)` / `SetBurned(...)` | `wordId`, `account` |
| `Traded(uint256 wordId, address account, uint8 side, uint256 tokenAmount, uint256 ausdAmount)`; side 0 buy YES, 1 sell YES, 2 buy NO, 3 sell NO | `wordId`, `account` |
| `WordFlagged(uint32 episodeId, uint256 wordId, uint16 chunkA, uint16 chunkB, uint32 offsetMs)` | `episodeId`, `wordId` |
| `EvidenceReady(uint32 episodeId, uint256[] wordIds)` | `episodeId` |
| `EpisodeClosed(uint32 episodeId)` | `episodeId` |
| `WordResolved(uint32 episodeId, uint256 wordId, uint8 outcome, bytes32 evidenceHash)` | `episodeId`, `wordId` |
| `EpisodeSettled(uint32 episodeId)` | `episodeId` |
| `Redeemed(uint256 wordId, address account, uint256 tokenAmount, uint256 ausdOut)` | `wordId`, `account` |
| `WordVoided(uint256 wordId)` | `wordId` |
| `OperatorUpdated(address previousOperator, address newOperator)` | both |
| `EpisodesPausedUpdated(bool paused)` | none |
| `ReportOriginUpdated(address previousOrigin, address newOrigin)` | both |

`Traded` is the leaderboard's source: it carries exact token and AUSD amounts per player action, so profit never depends on decoding Kuru internals. Side 0: YES received, AUSD spent. Side 1: YES sold, AUSD paid. Side 2: NO received, net AUSD pulled. Side 3: NO burned, AUSD paid. YES rounding dust returned by `sellNo` is not in the event; every amount is a measured fill, not ideal price arithmetic.

## 5. Invariants (Foundry invariant tests)

1. For every unresolved word: `YES.totalSupply == NO.totalSupply == word.sets`.
2. `AUSD.balanceOf(SaysoMarkets) >= Σ word.sets` over words not fully redeemed, outside any call. Every trade also enforces it as a postcondition.
3. A word leaves Open or SaidPending at most once.
4. Only the configured forwarder, with the expected workflow ID when set and from `reportOrigin` when set, moves a word to Yes or No.
5. No word resolves No before its episode is closed.
6. Redemptions for a word never pay more than `word.sets` at resolution. For Yes/No the reserve is the outstanding winning supply. For Void it is `floor(YES.totalSupply / 2) + floor(NO.totalSupply / 2)`, recomputed at void and after every redemption; each call pays `floor(amount / 2)`, so splitting odd amounts can only lower the payout. Rounding dust leaves the reserve but stays in the contract as surplus AUSD; nothing can sweep it.
7. The owner can never move collateral; `voidWord` only changes state and reserves.

`contracts/test/invariant/` checks all seven properties after every action, with eight words and three holders. Ghost state records final transitions, reserve at resolution, measured payouts, unauthorized reports, premature No outcomes and administrative AUSD movement. Default campaign: 128 runs × depth 64 = 8,192 handler invocations; expected rejections are caught, so calls are not successful-operation counts. The deterministic path asserts actual fills, refunds, token balances/supply burns and winning/Void payouts for every trade direction and both Void sides. A temporary zero-payout mutation failed `0 != 3` before restoration. Current `forge build --sizes`: runtime 19,836 bytes, initcode 20,448; runtime remains below EIP-170's 24,576 bytes and Monad's 131,072 bytes.

## 6. Kuru wiring

`listEpisode` calls `Router.deployProxy(0, yes, AUSD, 1e6, 1e4, 100, 1e6, 1e10, 0, 0, 100)` per word: sizePrecision 1e6, pricePrecision 1e4, tick 100 (1Ã‚Â¢), minimum 1 YES, maximum 10,000 YES, no fees [V: simulation with these parameters, `INTEGRATIONS.md` section 2]. YES prices are integers in 1/10,000 AUSD, so 0.50 is `5000` and the cash-out bid 0.98 is `9800`.

The contract trades with `isMargin = false` and approves each book (never `MarginAccount`) for AUSD and that word's YES. Kuru pulls from and pays to the contract's wallet; `quoteSize` is in pricePrecision units, so `KuruTrade` passes `ausd / 100` and only spends multiples of 100 AUSD base units [V: fork simulation, `INTEGRATIONS.md` section 2]. Every fill is measured by balance delta and any unspent input is returned to the player in the same call.

`KuruTrade` treats a zero input as a no-op, including AUSD below the 100-unit quote quantum; a positive minimum output still reverts `SlippageExceeded`. `buyExactBase` walks the manual asks from `getL2Book` and reserves `floor(size Ãƒâ€” price / 1e6) + 1` quote units for each level it fully consumes (Kuru's exhausted-level charge, `INTEGRATIONS.md` section 2) and `ceil` for the last, partial level; it then buys and reverts `InsufficientLiquidity` unless the measured YES delta covers the request. The overshoot is rounding dust (191 YES base units on the fork's two-level case). Vault AMM liquidity is ignored because SAYSO never funds it. The off-chain `quoteCost` in `packages/core` uses `ceil`, so a ticket that exhausts a level can under-quote by one quantum (0.0001 AUSD); minimum-out tolerances absorb it.

## 7. CRE wiring

- Constructor forwarder: simulation forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192` while `CRE_MODE=simulation`.
- **Simulation gate.** The simulation forwarder (`MockKeystoneForwarder`) checks no signatures and takes caller-supplied metadata [V: chainlink-evm `contracts/cre/src/dev/MockKeystoneForwarder.sol`], and the docs say not to set the expected workflow ID in simulation. Without a gate anyone could settle a word through it. The owner therefore sets `reportOrigin` to the REPORTER key that runs `cre workflow simulate --broadcast`; `_processReport` requires `tx.origin == reportOrigin` while it is non-zero [I: the simulator signs the forwarder call with that key; S4 confirms].
- On deploy access: owner calls `setForwarderAddress(0xF8344CFd5c43616a4366C34E3EEE75af79a74482)`, `setExpectedWorkflowId(<deployed resolver ID>)` and `setReportOrigin(address(0))` [V: `ReceiverTemplate` source in the consumer-contracts guide].
- Metadata arrives as 64 bytes from the production forwarder; nothing checks for 62.
- **Forwarder re-check.** The vendored template skips its sender check when the forwarder is set to zero; `_processReport` independently requires a non-zero forwarder equal to `msg.sender`, so zeroing the forwarder disables settlement instead of opening it. Clearing `reportOrigin` removes only the origin gate, never forwarder or workflow-ID authentication.

## 8. Gas

Monad bills the gas limit. `packages/core/src/gas.ts` exports `gasLimit(kind, count?)`, returning `ceil(measured Ã— 1.20)`. Episode word counts are 2â€“8 (default six); evidence/report batches are 1â€“8 (default one). Counts outside the measured range are refused.

[V: Monad-mode fork at block 68,394,814, real AUSD and Kuru; `forge test --isolate` with per-call gas snapshots]. Eight-word create and list were also sent as actual transactions on a local Monad-mode Anvil fork with the limits below; receipts used exactly 3,395,766 and 9,559,637 gas, both status 1. Eight books fit the **30M transaction** limit; no word-cap change is needed.

| Function / measured case | Gas used | Explicit limit (+20%, ceil) |
|---|---:|---:|
| `createEpisode (6)` | 2,588,594 | 3,106,313 |
| `createEpisode (8)` | 3,395,766 | 4,074,920 |
| `listEpisode (6)` | 7,208,654 | 8,650,385 |
| `listEpisode (8)` | 9,559,637 | 11,471,565 |
| `flagSaid` | 53,221 | 63,866 |
| `markEvidence (1)` | 49,483 | 59,380 |
| `markEvidence (8)` | 112,879 | 135,455 |
| `closeEpisode` | 42,511 | 51,014 |
| `mintSet (first balance)` | 323,680 | 388,416 |
| `mintSetWithPermit (offline mock AUSD)` | 375,872 | 451,047 |
| `burnSet` | 187,795 | 225,354 |
| `buyYes` | 395,823 | 474,988 |
| `sellYes` | 422,343 | 506,812 |
| `buyNo` | 480,513 | 576,616 |
| `sellNo` | 598,681 | 718,418 |
| `onReport (1)` | 61,186 | 73,424 |
| `onReport (8)` | 170,921 | 205,106 |
| `redeem (Void NO)` | 186,557 | 223,869 |
| `voidWord` | 106,086 | 127,304 |

The helper has measured entries for every intermediate episode/batch count. Trade observations use a manual two-level bid/ask book and partial fills; they are **not** universal bounds for arbitrarily many fills or resting orders. Remeasure against the actual house ladder before live trading, and replace the offline permit measurement with real AUSD evidence at S1. Receiver report limits exclude the forwarder's transaction overhead; S4 measures that outer call before broadcast.

## 9. Deployment

`contracts/script/Deploy.s.sol` deploys `OutcomeToken` and `SaysoMarkets(forwarder, AUSD, KURU_ROUTER, TOKEN_IMPL)`, installs settlement authentication, then sets the operator. Before broadcasting it refuses non-10143 chains, codeless dependencies, zero simulation `REPORTER_ADDRESS`, and missing/zero DON `CRE_WORKFLOW_ID`. Simulation installs `reportOrigin`; DON installs the approved resolver workflow ID and leaves the origin restriction disabled. It reads `AUSD`, `KURU_ROUTER`, `OPERATOR_ADDRESS`, `CRE_MODE`, and the mode-specific authentication value; optional `CRE_FORWARDER` overrides the directory default. Updated configured simulation fork dry run estimated 6,923,395 gas (~1.405 MON at the quoted max fee); missing authentication dry runs rejected before broadcast [V: 2026-10-05]. Testnet deployment and [explorer verification](https://docs.monad.xyz/guides/verify-smart-contract/foundry.md) remain pending, not performed by a dry run.

Deployment log (one row per deploy, added in the deploying commit with `cast code` proof):

| Date | Contract | Address | Transaction | Mode |
|---|---|---|---|---|
