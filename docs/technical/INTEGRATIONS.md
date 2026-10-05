# Integrations

Every external interface SAYSO depends on, what was verified, and the spike that settles each open question. Verified on 2026-10-05 unless stated.

Labels: **[V]** verified with source or command, **[I]** inference, **[U]** unverified with the settling spike.

Rule: never commit an address without `cast code <address> --rpc-url <rpc>` returning non-empty code.

## 1. Monad testnet

| Fact | Value | Label |
|---|---|---|
| Chain ID | 10143 | [V: [current facts](https://docs.monad.xyz/ai/current-facts.md)] |
| RPC | `https://testnet-rpc.monad.xyz` | [V] |
| Block time / finality | 300 ms blocks, 600 ms finality | [V: current facts] |
| Gas | Charged on the gas limit, not gas used; always pass explicit `gas` | [V: [gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing)] |
| Reserve balance | Low-balance senders can be rejected for closely spaced spending; the emptying exception needs no other transaction from that sender in the prior 3 blocks | [V: [reserve balance](https://docs.monad.xyz/developer-essentials/reserve-balance)] |
| Local network | Monad Solonet runs real Monad nodes locally | [V: [Solonet](https://docs.monad.xyz/tooling-and-infra/toolkits/monad-solonet.md)] |
| Explorers | MonadVision, Monadscan | [V: [explorers](https://docs.monad.xyz/tooling-and-infra/block-explorers.md)] |

Consequence: the web app sequences a player's transactions by block number, never by a wall-clock sleep, and the studio keeps its three keys above the reserve.

## 2. Kuru (order books)

Testnet contracts, all with code [V: `cast code`]:

| Contract | Address |
|---|---|
| Router | `0x7EFbE105Ca7415dE98F96622173458ac1c054630` |
| MarginAccount | `0xd029C2D98ff85D8F64799017fE00a59B1159CE02` |

ABIs are vendored from the published SDK package (0.0.95) into `packages/core/abi`; the SDK itself is not a dependency because it pulls in ethers v5.

**Market deployment.** `Router.deployProxy(uint8 type, address base, address quote, uint96 sizePrecision, uint32 pricePrecision, uint32 tickSize, uint96 minSize, uint96 maxSize, uint256 takerFeeBps, uint256 makerFeeBps, uint96 kuruAmmSpread)`.
- Type 0 is ERC-20 base / ERC-20 quote; type 1 is native base. Type 1 or 2 with an ERC-20 base reverts `MarketTypeMismatch()` (`0xbd6898be`) [V: simulation].
- SAYSO parameters: type 0, base = YES token, quote = AUSD, sizePrecision 1e6, pricePrecision 1e4, tickSize 100 (1¢), minSize 1e6 (1 YES), maxSize 1e10, fees 0/0, spread 100. Simulated from an unfunded address: returns `0xbE4D25e52454cc162d1657FC786f45574Ddae410` [V: simulation]. Deployment is permissionless.

**No market pause for us.** `Router.toggleMarkets(address[],uint8)` reverts `Unauthorized()` from our wallet; the Router owner is `0x07bBBf2e9911705a7b258e0A05A34620058fC1D1` [V: simulation]. Halting a word means pulling house quotes.

**Calls used.**
- House: `MarginAccount.deposit(user, token, amount)`, `OrderBook.batchProvisionLiquidity(uint32[] prices, uint32[] flipPrices, uint96[] sizes, bool[] isBuy, bool provisionOrRevert)`, `batchCancelFlipOrders(uint40[])`, `addBuyOrder(uint32 price, uint96 size, bool postOnly)` for the 0.98 bid, `MarginAccount.batchWithdrawMaxTokens(address[])`.
- Players through `SaysoMarkets`: `placeAndExecuteMarketBuy(uint96 quoteSize, uint256 minAmountOut, bool isMargin, bool isFillOrKill)` and `placeAndExecuteMarketSell(uint96 size, uint256 minAmountOut, bool isMargin, bool isFillOrKill)` with `isMargin = false`.
- Reads: `getMarketParams()`, `getL2Book()`, `bestBidAsk()`.

**Events.** Decode with the vendored ABI, not the documentation page; the published event declarations disagree with live topics.
- `Trade(uint40,address,bool,uint256,uint96,address,address,uint96)` = `0xf16924fba1c18c108912fcacaac7450c98eb3f2d8c0a3cdf3df7066c08f21581` [V: keccak of the SDK ABI signature; emitted by a fork-deployed book, S2+S3]; live testnet log still [U: S2 live]. A taker fill also emits an undecoded book event `0x49496a41b922bdba3ff7f57bb0992ab1a1a3ee95b5ae5bd7271c67861f018352` [U].
- `FlipOrdersCanceled(uint40[],address)` = `0x5f815e5292cf3b123df58ad6d4531c085d94d5717a3b02740369a04273fde96c`.

**Non-margin settlement for a contract caller** [V: fork simulation 2026-10-05, S2+S3; live run U pending MON]:
- The caller approves the book only, never `MarginAccount`. The book pulls quote (buy) or base (sell) from the caller's wallet and pays the fill to the caller's wallet; the caller's margin balances stay 0. The maker's fills land in the maker's margin account.
- `placeAndExecuteMarketBuy` `quoteSize` is in pricePrecision units (1e4 = 1 AUSD): `5e4` spent exactly 5,000,000 AUSD base units and returned 9,803,921 YES (fill at 0.51). Passing `5e6` reverted `TransferFromFailed()` (`0x7939f424`). The return value is base received.
- `placeAndExecuteMarketSell` `_size` is in sizePrecision units (1e6 = 1 YES, the same as YES base units here); selling all 9,803,921 YES returned 4,901,900 AUSD base units at the 0.50 bid.
- `bestBidAsk()` returns 1e18-scaled prices (`490000000000000000` = 0.49).
- `getL2Book()` returns one block-number word, best-first bid `(price, size)` word pairs, one zero price word with no size word, then best-first ask pairs ending at the payload end. Prices use pricePrecision (5100 = 0.51), sizes sizePrecision (10,000,000 = 10 YES). Only manual orders appear; the SDK adds vault AMM prices separately [V: fork, SDK 0.0.95 `dist/market/orderBook.js`].
- Exhausting a resting ask level debits `floor(size × price / 1e6) + 1` quoteSize units for that level, one unit more than the exact cost even when it is integral; a partially filled level costs the remaining input. 8 AUSD across 10 YES at 0.51 and 10 YES at 0.52 returns 15,576,730 YES; an exact 10 YES level at 0.51 costs 5,100,100 AUSD base units [V: fork, block 68,306,112, `contracts/test/fork/KuruTrade.fork.t.sol` 9/9].
- IOC partial fills leave the rest with the caller: 5 AUSD against a sole 2 YES ask at 0.51 spends 1,020,100 and returns 3,979,900 to the caller's wallet; selling 5 YES into a 2 YES bid sells 2 and leaves 3 [V: fork, same run].
- Gas (warm `gasleft` deltas around library calls on the fork, not transaction limits): `deployProxy` via `KuruTrade` 1.27M–1.28M; market buy 290k–336k; market sell 299k; exact-size buy over two levels 381k. The earlier probe measured buy 354,231 and sell 283,246 as whole calls.
- BOT path: approve `MarginAccount`, `deposit(bot, token, amount)` for YES and AUSD, then `batchProvisionLiquidity` with prices `[4900,4800,5100,5200]`, flips `[5000,4900,5000,5100]`, sizes 10e6, `isBuy [t,t,f,f]` emits four logs.
- Real AUSD works as the quote token.

## 3. Chainlink CRE (settlement)

| Fact | Value | Label |
|---|---|---|
| Network support | Monad Testnet needs CLI 1.30.0+, TS SDK 1.19.0+; Monad mainnet also listed | [V: [supported networks](https://docs.chain.link/cre/supported-networks-ts)] |
| Chain name | `monad-testnet` | [V: [forwarder directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts)] |
| Simulation forwarder | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` (`MockKeystoneForwarder`, used by `simulate --broadcast`) | [V: directory + `cast code`] |
| Production forwarder | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (`KeystoneForwarder`) | [V: directory + `cast code`] |
| Deploy access | Requires approval: `cre account access`; simulation works meanwhile | [V: [deploying workflows](https://docs.chain.link/cre/guides/operations/deploying-workflows)] |
| Private registry limit | 3 workflows per organization | [V: same page] |
| Triggers | Cron, HTTP, EVM log; in simulation triggers are selected manually | [V: [triggers](https://docs.chain.link/cre/capabilities/triggers)] |
| HTTP | Every DON node fetches; BFT consensus deployed, single-node in simulation | [V: [HTTP capability](https://docs.chain.link/cre/capabilities/http)] |
| Receiver | Implement `IReceiver.onReport(bytes metadata, bytes report)` with ERC-165; use `ReceiverTemplate` (forwarder required in constructor, optional workflow ID / owner / name checks, setters to switch forwarder) | [V: [consumer contracts](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)] |
| Metadata length | Production forwarder passes 64 bytes; never require exactly 62 | [V: same page] |
| Agent skill | `npx skills add smartcontractkit/chainlink-agent-skills --skill chainlink-cre-skill` | [V: [developer agent skills](https://docs.chain.link/resources/chainlink-developer-agent-skills)] |

Workflow `cre/resolver` (TypeScript): handlers for `EvidenceReady` and `EpisodeClosed` log triggers; EVM read for `rootA`/`rootB`; HTTP GET of revealed chunks; proof verification and `agreedSpokenTime` from `packages/core`; one report per trigger. Details in `.claude/skills/cre-resolver/SKILL.md`.

Non-interactive simulation from a log transaction: `cre workflow simulate <dir> --target <t> --non-interactive --trigger-index <i> --evm-tx-hash <tx> --evm-event-index <n> --broadcast` [V: vendored `chainlink-cre-skill/references/simulation.md`].

Open: tenant chain list (`cre workflow supported-chains --output json`) and whether `--broadcast` needs a linked key or Early Access for our tenant [U: S4].

## 4. Mera (accounts)

| Fact | Label |
|---|---|
| `createPasskeyWithPrfOutput`, `getPasskeyPrfOutput`, `createSecp256k1SigningSession`, `toViemAccount` from `@category-labs/mera/viem` | [V: [Mera guide](https://docs.monad.xyz/guides/mera)] |
| Key derivation `m/44'/60'/0'/0/{i}` via `@scure/bip32` and `@scure/bip39`; SAYSO uses index 0 | [V: Mera guide] |
| Error codes: `PRF_UNAVAILABLE`, `PASSKEY_OPERATION_FAILED`, `CRYPTO_UNAVAILABLE`, `SESSION_ENDED`, `INPUT_INVALID`, `DECRYPT_FAILED`, `VAULT_FORMAT_INVALID` | [V: `dist/errors.d.ts` of 0.2.0] |
| Passkeys are bound to the relying-party ID (the domain) | [V: WebAuthn] |
| Some desktop browser profiles return no PRF output (observed with local-profile passkeys in desktop Chrome) | [I: research observation; S5 confirms the supported set] |

Open: PRF on the target phones (iOS Safari, Android Chrome) at the production domain [U: S5].

## 5. AUSD (quote and collateral)

| Fact | Value | Label |
|---|---|---|
| Testnet token | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, 6 decimals, exposes `DOMAIN_SEPARATOR` (permit) | [V: `cast call`] |
| Mainnet token | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` (reference only) | [V: [Agora deployments](https://docs.agora.finance/developer/contract-deployments.md)] |
| Testnet faucet | `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`, `requestFunds(address)` | [V: `cast code`, `token()` returns AUSD] |
| Faucet behaviour | On 2026-10-04 every fresh address reverted `MaxFrequencyExceeded()`; on 2026-10-05 `eth_call` succeeds for fresh addresses. On a fork, one `requestFunds` paid 10,000 AUSD (10,000,000,000 base units); a second request in the same block reverted `MaxFrequencyExceeded()` even from other fresh addresses, so the limit looks global [I]; the faucet held about 998M AUSD. Live cadence unknown | [V: fork simulation 2026-10-05]; cadence [U: S1] |

Fallback quote token if S1 fails: Kuru testnet USDC `0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570` (6 decimals, code verified). The quote token is one config value (`AUSD`) so the switch touches no code.

## 6. Envio (read model)

- HyperIndex 3.12.1; HyperSync serves Monad testnet at `https://monad-testnet.hypersync.xyz` (chain 10143) [V: [HyperSync networks](https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks)].
- Indexes `SaysoMarkets` events (episodes, words, trades, sets, flags, resolutions, redemptions) and Kuru `Trade` logs for the house books.
- Hosting: Envio hosted service versus self-hosting on the VPS [U: S6].

## 7. Transcription (offline, free)

| Engine | Version | Licence | Use / model |
|---|---|---|---|
| whisper.cpp (`whisper-cli`, word timestamps, JSON output) | 1.9.4 | MIT | Engine A; `ggml-base.en.bin`, also benchmarked `ggml-small.en.bin` |
| Vosk (Kaldi-based, different model family) | 0.3.45 | Apache-2.0 | Engine B; `vosk-model-en-us-0.22` (large); latest published Python wheel, 0.3.50 is a source-only tag |

Both run on a laptop or the VPS ahead of time; nothing transcribes in a request path. Two architecturally different engines make the agreement rule meaningful.

Windows x64 whisper binaries come from [b5130](https://github.com/ggml-org/whisper.cpp/releases/tag/b5130), the build linked by [v1.9.4](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.4) at the same commit; `whisper-cli --version` prints 1.9.4. Vosk 0.3.50 is absent from [PyPI](https://pypi.org/project/vosk/); the [upstream tag](https://github.com/alphacep/vosk-api/releases/tag/v0.3.50) has no binaries [V: spike S7, local install + release APIs].

S7 measured both English Whisper models against large Vosk; results below. Keep the 1,500 ms rule for now [I: S7 recommendation]; noisy conversational clips and ground-truth accuracy remain unmeasured [U: expanded S7].

## 8. Free Monad developer resources used

Public testnet RPC and faucet; Monad Solonet for local runs; Envio HyperSync; monskills agent skills (`therealharpaljadeja/monskills`); MonadVision and Monadscan explorers; Monad developer channels for testnet MON top-ups. Metropolis lists product credits and three months of unlimited RPC for winning teams [V: [event page](https://monad.xyz/developers/hackathons/metropolis)].

## 9. Spikes

| ID | Question | Pass when |
|---|---|---|
| S1 | AUSD faucet amount and cadence | Two timed requests from DRIP succeed; amount and interval recorded here |
| S2 | Kuru YES/AUSD market created by `SaysoMarkets` and seeded | Contract-created market accepts a flip ladder from BOT; `getL2Book` shows both sides |
| S3 | Non-margin IOC from a contract | `SaysoMarkets` buys and sells YES with `isMargin = false`; debits, credits and `quoteSize` units recorded |
| S4 | CRE simulation writes on Monad testnet | `cre workflow simulate --broadcast` delivers a report to a `ReceiverTemplate` consumer through the simulation forwarder; access request submitted |
| S5 | Mera PRF on phones at the real domain | Create, sign, clear storage, restore the same address on iOS and Android |
| S6 | Envio hosting | Indexer serves a GraphQL query for testnet events from the chosen host |
| S7 | Engine agreement | Measured 2026-10-05; retain 1,500 ms on this sample [I]; broader conversational validation remains open |

**S7 — 2026-10-05 [V: spike S7, local run].** Three NASA ScienceCasts: [Space Gardening](https://images.nasa.gov/details/248_SpaceGardening) (268 s), [Thinking Inside the Box](https://images.nasa.gov/details/282_ThinkingInsideBox) (250 s), [The CIPHER Project](https://images.nasa.gov/details/319_CIPHER) (205 s). `base.en` / large Vosk exact normalized non-stop-token agreement: 335/356 (94.10%), 310/341 (90.91%), 245/274 (89.42%); median skew 130/205/250 ms, p99 1,040/1,010/920 ms. `small.en`: 333/354 (94.07%), 323/347 (93.08%), 260/274 (94.89%); medians 90/270/290 ms, p99 620/1,220/900 ms. Greedy one-to-one pair totals at 1,000/1,500/2,000/3,000 ms: base 881/890/895/899; small 908/916/916/917. These rates include numeral/compound rendering differences, not plural/hyphen-expanded settlement or ground-truth accuracy. CPU wall times (same clip order): base 39.45/37.23/32.63 s; small 112.90/98.60/82.69 s; Vosk 110.48/92.90/70.68 s plus one 67.80 s model load. Full per-word CSVs, skew distributions, hashes, flags and disagreements are in the external S7 report/scratch, not the repo.

Keep 1,500 ms [I]: tightening loses 9 base / 8 small pairs; widening to 3,000 ms gains only 9 / 1. Lexical disagreements dominate; three related narrated clips do not validate noisy dialogue [U: expanded S7]. NASA's [media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) supply public-domain evidence with third-party/endorsement/crypto restrictions; these are research inputs, not cleared episode assets.

**S2 + S3 — 2026-10-05, fork only [V: fork simulation at block ≈68,192,576].** A contract deployed a YES/AUSD book with the section 2 parameters, BOT seeded a flip ladder through `MarginAccount`, and the contract bought and sold YES with `isMargin = false`; findings are in section 2. Probe: `handoff\sayso\spikes\s3`, `forge test --via-ir --fork-url https://testnet-rpc.monad.xyz -vv` → `test_mockQuote` and `test_ausdQuote` pass (without `--via-ir` the probe fails with `Stack too deep`). The live run from BOT and one live `Trade` log stay [U] until the ops keys hold MON.
