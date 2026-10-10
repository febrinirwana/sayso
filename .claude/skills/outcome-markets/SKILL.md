---
name: outcome-markets
description: Use when touching complete sets, YES/NO pricing, Kuru order-book calls, the house market maker, cash-out bids, or trade maths in SaysoMarkets, the studio or the web ticket.
---

# Outcome markets

Facts and limits behind `SMART-CONTRACTS.md` and `ARCHITECTURE.md` section 5. Load `gas` and `addresses` (monskills) before writing any chain call.

## Units

| Thing | Unit |
|---|---|
| AUSD, YES, NO amounts | 6 decimals (`1e6` = 1 token) |
| Kuru YES price | integer in 1/10,000 AUSD: `5000` = 0.50, `9800` = 0.98 |
| Tick | `100` = 1¢ |
| Kuru size | sizePrecision `1e6`; min `1e6` (1 YES), max `1e10` |

Convert only through `packages/core` (`priceToKuru`, `kuruToPrice`, `sizeToKuru`); never inline a scale factor.

## Complete sets

- `mintSet(n)`: n AUSD in, n YES + n NO out. `burnSet(n)`: the reverse, until the word is final.
- Per word: `YES.totalSupply == NO.totalSupply == sets` until settlement. This invariant is the market's solvency; every change to SaysoMarkets keeps its Foundry invariant test green.
- Buy NO for `n`: mint n sets, sell n YES at the bid, refund the proceeds. Cost per NO = `1 − bid`.
- Sell NO for `n`: buy n YES with pooled AUSD inside the call, burn n sets, pay the remainder. Value per NO = `1 − ask`. Collateral check runs at the end of the call.

## Kuru

- Market per word: `Router.deployProxy(0, yes, AUSD, 1e6, 1e4, 100, 1e6, 1e10, 0, 0, 100)`. Type 0 only; type 1 is native base and reverts `MarketTypeMismatch()` for ERC-20.
- We cannot pause Kuru markets (`toggleMarkets` is owner-only). Halting = the house pulling its own quotes.
- Players only send immediate-or-cancel orders (`placeAndExecuteMarketBuy` / `placeAndExecuteMarketSell`, `isMargin = false`) through SaysoMarkets. No player order ever rests on a book.
- Decode events from the vendored ABI in `packages/core/abi`. The Kuru docs page is wrong about event fields.

## House market maker (studio BOT key)

1. On listing: mint sets for inventory, deposit to `MarginAccount`, then one `batchProvisionLiquidity` per book: a flip ladder of bids and asks around 0.50. Stop fresh seed steps at trading close or once any pre-play pull has confirmed, including retries/restarts; recheck the deadline inside the signing round. Already-signed bytes must recover before later sender actions.
2. Never move quotes based on transcript knowledge. The ladder only reacts to fills (flip orders do that by construction).
3. Before playback: schedule one pull for every word, spoken or decoy, exactly at `tradingClosesAtMs(startsAt)` (`startsAt − 20 s`), never before trading closes. Cancel all active flip and plain house orders and confirm each empty book before playback, sequencing BOT by successor block. This schedule is uninformed; there is no flag-time pull. At the flag, once chain SAID and the pull are confirmed, post the cash-out bid at `9800`, sized from chain YES outside house/protocol custody and capped by house AUSD.
4. At close: cancel every remaining house order on that episode's books.
5. After settlement: withdraw from `MarginAccount`, redeem winners, recycle AUSD.

Every one of these is an `actions` row in SQLite with its scheduled time, tx hash and status.

New positions open only during pre-roll while the clip is hidden. Trading closes 20 s before playback, leaving approximately 40 s of the 60 s pre-roll for buying; the only playback trade is cashing out a SAID word at the 0.98 AUSD (TESTNET) house bid. Settlement/redeem remain unchanged. Live cancellation timing is an explicit gate in BLOCKERS B14, not guaranteed by scheduled offsets alone.

## Things that are wrong

- Quoting a word from the transcript or the flag plan before its flag time.
- A player-facing price that is not from the book or a receipt.
- Any path that lets the owner or operator move collateral.
- Showing a payout without the TESTNET label.
