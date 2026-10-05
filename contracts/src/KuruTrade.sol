// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IKuruRouter} from "./interfaces/IKuruRouter.sol";
import {IKuruOrderBook} from "./interfaces/IKuruOrderBook.sol";

library KuruTrade {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    uint96 internal constant SIZE_PRECISION = 1e6;
    uint32 internal constant PRICE_PRECISION = 1e4;
    uint32 internal constant TICK_SIZE = 100;
    uint96 internal constant MIN_SIZE = 1e6;
    uint96 internal constant MAX_SIZE = 1e10;
    uint96 internal constant AMM_SPREAD = 100;
    uint256 internal constant QUOTE_UNIT = 100;

    error InsufficientLiquidity();
    error SlippageExceeded();

    function deployMarket(address router, address base, address quote) internal returns (address market) {
        market = IKuruRouter(router).deployProxy(
            0, base, quote, SIZE_PRECISION, PRICE_PRECISION, TICK_SIZE, MIN_SIZE, MAX_SIZE, 0, 0, AMM_SPREAD
        );
        IERC20(base).forceApprove(market, type(uint256).max);
        IERC20(quote).forceApprove(market, type(uint256).max);
    }

    function marketBuy(address market, address base, address quote, uint256 quoteIn, uint256 minBaseOut)
        internal returns (uint256 baseOut, uint256 quoteSpent)
    {
        uint96 quoteSize = (quoteIn / QUOTE_UNIT).toUint96();
        if (quoteSize != 0) {
            uint256 baseBefore = IERC20(base).balanceOf(address(this));
            uint256 quoteBefore = IERC20(quote).balanceOf(address(this));
            IKuruOrderBook(market).placeAndExecuteMarketBuy(quoteSize, 0, false, false);
            baseOut = IERC20(base).balanceOf(address(this)) - baseBefore;
            quoteSpent = quoteBefore - IERC20(quote).balanceOf(address(this));
        }
        if (baseOut < minBaseOut) revert SlippageExceeded();
    }

    function marketSell(address market, address base, address quote, uint256 baseIn, uint256 minQuoteOut)
        internal returns (uint256 quoteOut, uint256 baseSold)
    {
        uint96 size = baseIn.toUint96();
        if (size != 0) {
            uint256 baseBefore = IERC20(base).balanceOf(address(this));
            uint256 quoteBefore = IERC20(quote).balanceOf(address(this));
            IKuruOrderBook(market).placeAndExecuteMarketSell(size, 0, false, false);
            quoteOut = IERC20(quote).balanceOf(address(this)) - quoteBefore;
            baseSold = baseBefore - IERC20(base).balanceOf(address(this));
        }
        if (quoteOut < minQuoteOut) revert SlippageExceeded();
    }

    /// Only manual asks are encoded in L2; SAYSO does not fund the AMM vault.
    function quoteForExactBase(address market, uint256 baseWanted) internal view returns (uint256 quoteIn) {
        if (baseWanted == 0) return 0;
        bytes memory book = IKuruOrderBook(market).getL2Book();
        uint256 offset = 32;
        // One zero price word separates bids from asks; there is no size word after the sentinel.
        while (offset + 32 <= book.length) {
            uint256 price = _word(book, offset);
            offset += 32;
            if (price == 0) break;
            if (offset + 32 > book.length) revert InsufficientLiquidity();
            offset += 32;
        }
        while (offset + 64 <= book.length) {
            uint256 price = _word(book, offset);
            if (price == 0) break;
            uint256 size = _word(book, offset + 32);
            uint256 fill = Math.min(size, baseWanted);
            quoteIn += Math.mulDiv(fill, price, SIZE_PRECISION, Math.Rounding.Ceil) * QUOTE_UNIT;
            baseWanted -= fill;
            if (baseWanted == 0) return quoteIn;
            offset += 64;
        }
        revert InsufficientLiquidity();
    }

    function buyExactBase(address market, address base, address quote, uint256 baseWanted, uint256 maxQuoteIn)
        internal returns (uint256 baseOut, uint256 quoteSpent)
    {
        uint256 quoteIn = quoteForExactBase(market, baseWanted);
        if (quoteIn > maxQuoteIn) revert SlippageExceeded();
        (baseOut, quoteSpent) = marketBuy(market, base, quote, quoteIn, 0);
        if (baseOut < baseWanted) revert InsufficientLiquidity();
    }

    function _word(bytes memory data, uint256 offset) private pure returns (uint256 value) {
        assembly ("memory-safe") { value := mload(add(add(data, 32), offset)) }
    }
}
