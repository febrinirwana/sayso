# Smart contracts

Contract surface for SAYSO on Monad testnet (10143): storage, functions, events, invariants, Kuru and CRE wiring, gas and deployment. Flows that call these functions are in `ARCHITECTURE.md` section 5.

Toolchain: Foundry 1.8.4, Solidity 0.8.37, OpenZeppelin Contracts 5.7.0 (plus the upgradeable package at the same version for clone initializers), forge-std 1.17.0. Dependencies install through Soldeer and are pinned in `contracts/soldeer.lock`; `evm_version = "prague"`, the fork Monad executes [V: [Monad Hardhat guide](https://docs.monad.xyz/tooling-and-infra/toolkits/hardhat)].

## 1. Contracts

| Contract | Role |
|---|---|
| `SaysoMarkets` | Episodes, words, collateral, trade entry points, CRE receiver. Inherits CRE `ReceiverTemplate` (which brings `Ownable`). |
| `OutcomeToken` | ERC-20 implementation (6 decimals) cloned twice per word: YES and NO. Mint and burn only by `SaysoMarkets`; `SaysoMarkets` is a trusted spender, so players never approve outcome tokens. |
| `KuruTrade` (library) | Wraps Kuru order book calls; hides the non-margin settlement details settled by spike S3. |

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
    uint256 sets;         // outstanding complete sets = AUSD collateral for this word
}
```

Immutables: `AUSD`, `KURU_ROUTER`, `TOKEN_IMPL`. Mutable: `operator`, `episodesPaused`.

## 3. Functions

Amounts are in 6-decimal units for AUSD, YES and NO.

| Function | Caller | Rules |
|---|---|---|
| `createEpisode(bytes32 clipId, bytes32 rootA, bytes32 rootB, uint64 startsAt, uint64 endsAt, bytes32[] words) returns (uint32 episodeId)` | operator | 1 to 8 words; `startsAt >= block.timestamp`; `endsAt > startsAt`; not paused. Clones YES and NO per word. |
| `listEpisode(uint32 episodeId)` | operator | Deploys one Kuru market per word (`deployProxy` type 0, parameters in section 6) and approves each book for AUSD and that word's YES. Trading requires `listed`. |
| `mintSet(uint256 wordId, uint256 amount, address to)` / `mintSetWithPermit(..., deadline, v, r, s)` | anyone | Episode listed and not closed; word Open or SaidPending. Pulls `amount` AUSD, mints `amount` YES and NO. |
| `burnSet(uint256 wordId, uint256 amount, address to)` | holder | Word not final. Burns both sides, returns AUSD. |
| `buyYes(uint256 wordId, uint256 ausdIn, uint256 minYesOut) returns (uint256 yesOut)` | anyone | Word listed and not final. IOC market buy. |
| `sellYes(uint256 wordId, uint256 yesIn, uint256 minAusdOut) returns (uint256 ausdOut)` | holder | Word listed and not final. IOC market sell. Cash-out uses this against the 0.98 bid. |
| `buyNo(uint256 wordId, uint256 noAmount, uint256 maxAusdIn) returns (uint256 ausdSpent)` | anyone | Mint `noAmount` sets, sell `noAmount` YES with minimum out `noAmount − maxAusdIn`, send NO and refund proceeds. Episode not closed. |
| `sellNo(uint256 wordId, uint256 noIn, uint256 minAusdOut) returns (uint256 ausdOut)` | holder | Buy `noIn` YES with pooled AUSD inside the call, burn `noIn` sets, send the remainder. Reverts unless collateral for every word is intact at the end. |
| `flagSaid(uint256 wordId, uint16 chunkA, uint16 chunkB, uint32 offsetMs)` | operator | Episode live; word Open. Sets SaidPending. Display and trigger only; settles nothing. |
| `markEvidence(uint32 episodeId, uint256[] wordIds)` | operator | Every word SaidPending and in the episode. Emits `EvidenceReady`. |
| `closeEpisode(uint32 episodeId)` | operator | `block.timestamp >= endsAt`; once. Stops minting. |
| `onReport(bytes metadata, bytes report)` | CRE forwarder | Via `ReceiverTemplate`: sender must be the forwarder; workflow ID must match when set. `report = abi.encode(uint32 episodeId, uint256[] wordIds, uint8[] outcomes, bytes32 evidenceHash)`. |
| `redeem(uint256 wordId, uint256 amount)` | holder | Word Yes: burns YES, pays `amount`. Word No: burns NO, pays `amount`. Void: burns either side, pays `amount / 2`. |
| `voidWord(uint256 wordId)` | owner | Episode closed for 24 h and word not final. |
| `setOperator(address)`, `setEpisodesPaused(bool)` | owner | Forwarder and expected workflow ID setters come from `ReceiverTemplate`. |

Report processing (`_processReport`): for each `(wordId, outcome)`, the word belongs to `episodeId` and is Open or SaidPending; outcome `No` requires the episode closed; outcome `Yes` requires `block.timestamp >= startsAt`. Sets the state, increments `resolvedCount`, emits `WordResolved`; when every word is final, emits `EpisodeSettled`.

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

`Traded` is the leaderboard's source: it carries exact token and AUSD amounts per player action, so profit never depends on decoding Kuru internals.

## 5. Invariants (Foundry invariant tests)

1. For every unresolved word: `YES.totalSupply == NO.totalSupply == word.sets`.
2. `AUSD.balanceOf(SaysoMarkets) >= Σ word.sets` over words not fully redeemed, outside any call.
3. A word leaves Open or SaidPending at most once.
4. Only the configured forwarder, with the expected workflow ID when set, moves a word to Yes or No.
5. No word resolves No before its episode is closed.
6. Redemptions for a word never pay more than `word.sets` at resolution.
7. The owner can never move collateral except through `voidWord` redemption math.

## 6. Kuru wiring

`listEpisode` calls `Router.deployProxy(0, yes, AUSD, 1e6, 1e4, 100, 1e6, 1e10, 0, 0, 100)` per word: sizePrecision 1e6, pricePrecision 1e4, tick 100 (1¢), minimum 1 YES, maximum 10,000 YES, no fees [V: simulation with these parameters, `INTEGRATIONS.md` section 2]. YES prices are integers in 1/10,000 AUSD, so 0.50 is `5000` and the cash-out bid 0.98 is `9800`.

The contract trades with `isMargin = false`. Whether Kuru pulls and pays the contract directly or through `MarginAccount` is spike S3; `KuruTrade` absorbs the answer so the public functions above do not change.

## 7. CRE wiring

- Constructor forwarder: simulation forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192` while `CRE_MODE=simulation`.
- On deploy access: owner calls `setForwarderAddress(0xF8344CFd5c43616a4366C34E3EEE75af79a74482)` and `setExpectedWorkflowId(<deployed resolver ID>)` [V: `ReceiverTemplate` source in the consumer-contracts guide].
- Metadata arrives as 64 bytes from the production forwarder; nothing checks for 62.

## 8. Gas

Monad charges the gas limit, so every studio and web transaction sets an explicit limit: the measured `forge test --gas-report` value for that function plus 20%, stored per function in `packages/core/src/gas.ts`. `listEpisode` deploys up to eight order books; if its measured cost exceeds the block gas limit at eight words, the word cap drops to what fits and the PRD is updated in the same commit.

## 9. Deployment

`contracts/script/Deploy.s.sol` deploys `OutcomeToken` (implementation), then `SaysoMarkets(forwarder, AUSD, KURU_ROUTER, TOKEN_IMPL)`, sets the operator, and verifies on Monadscan and MonadVision ([verify guide](https://docs.monad.xyz/guides/verify-smart-contract/foundry.md)).

Deployment log (one row per deploy, added in the deploying commit with `cast code` proof):

| Date | Contract | Address | Transaction | Mode |
|---|---|---|---|---|
