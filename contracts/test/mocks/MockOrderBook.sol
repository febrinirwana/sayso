// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IKuruOrderBook} from "../../src/interfaces/IKuruOrderBook.sol";

contract MockOrderBook is IKuruOrderBook {
    using SafeERC20 for IERC20;

    struct Params {
        uint32 pricePrecision;
        uint96 sizePrecision;
        address base;
        address quote;
        uint32 tickSize;
        uint96 minSize;
        uint96 maxSize;
        uint256 takerFeeBps;
        uint256 makerFeeBps;
        uint96 ammSpread;
    }
    struct Level { uint32 price; uint96 size; }

    Params public params;
    Level[] public asks;
    Level[] public bids;
    error TransferFromFailed();
    error InvalidOrder();
    error InsufficientLiquidity();
    error SlippageExceeded();

    constructor(Params memory config) { params = config; }

    // Append in price priority order. The maker supplies actual inventory, never synthetic balances.
    function seedAsk(uint32 price, uint96 size) external {
        _validate(price, size);
        if (asks.length != 0 && price <= asks[asks.length - 1].price) revert InvalidOrder();
        IERC20(params.base).safeTransferFrom(msg.sender, address(this), size);
        asks.push(Level(price, size));
    }

    function seedBid(uint32 price, uint96 size) external {
        _validate(price, size);
        if (bids.length != 0 && price >= bids[bids.length - 1].price) revert InvalidOrder();
        IERC20(params.quote).safeTransferFrom(msg.sender, address(this), uint256(size) * price / params.sizePrecision * 100);
        bids.push(Level(price, size));
    }

    function _validate(uint32 price, uint96 size) private view {
        if (price == 0 || price % params.tickSize != 0 || size < params.minSize || size > params.maxSize) {
            revert InvalidOrder();
        }
    }

    function placeAndExecuteMarketBuy(uint96 quoteSize, uint256 minimum, bool isMargin, bool fillOrKill)
        external payable returns (uint256 baseOut)
    {
        if (isMargin || msg.value != 0) revert InvalidOrder();
        uint256 remaining = quoteSize;
        _pull(IERC20(params.quote), remaining * 100);
        for (uint256 i; i < asks.length && remaining != 0; ++i) {
            Level storage level = asks[i];
            if (level.size == 0) continue;
            uint256 affordable = remaining * params.sizePrecision / level.price;
            uint256 filled = affordable < level.size ? affordable : level.size;
            uint256 cost = filled == affordable ? remaining : filled * level.price / params.sizePrecision + 1;
            baseOut += filled;
            level.size -= uint96(filled);
            remaining -= cost;
        }
        if (fillOrKill && remaining != 0) revert InsufficientLiquidity();
        if (baseOut < minimum) revert SlippageExceeded();
        IERC20(params.base).safeTransfer(msg.sender, baseOut);
        if (remaining != 0) IERC20(params.quote).safeTransfer(msg.sender, remaining * 100);
    }

    function placeAndExecuteMarketSell(uint96 size, uint256 minimum, bool isMargin, bool fillOrKill)
        external payable returns (uint256 quoteOut)
    {
        if (isMargin || msg.value != 0) revert InvalidOrder();
        uint256 remaining = size;
        _pull(IERC20(params.base), size);
        for (uint256 i; i < bids.length && remaining != 0; ++i) {
            Level storage level = bids[i];
            uint256 filled = remaining < level.size ? remaining : level.size;
            quoteOut += filled * level.price / params.sizePrecision * 100;
            level.size -= uint96(filled);
            remaining -= filled;
        }
        if (fillOrKill && remaining != 0) revert InsufficientLiquidity();
        if (quoteOut < minimum) revert SlippageExceeded();
        IERC20(params.quote).safeTransfer(msg.sender, quoteOut);
        if (remaining != 0) IERC20(params.base).safeTransfer(msg.sender, remaining);
    }

    function _pull(IERC20 token, uint256 amount) private {
        (bool ok, bytes memory result) = address(token).call(abi.encodeCall(IERC20.transferFrom, (msg.sender, address(this), amount)));
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFromFailed();
    }

    function bestBidAsk() external view returns (uint256 bid, uint256 ask) {
        for (uint256 i; i < bids.length; ++i) {
            if (bids[i].size != 0) { bid = uint256(bids[i].price) * 1e18 / params.pricePrecision; break; }
        }
        for (uint256 i; i < asks.length; ++i) {
            if (asks[i].size != 0) { ask = uint256(asks[i].price) * 1e18 / params.pricePrecision; break; }
        }
    }

    function getL2Book() external view returns (bytes memory data) {
        uint256 count;
        for (uint256 i; i < bids.length; ++i) if (bids[i].size != 0) ++count;
        for (uint256 i; i < asks.length; ++i) if (asks[i].size != 0) ++count;
        data = new bytes(64 + count * 64);
        _store(data, 0, block.number);
        uint256 offset = 32;
        for (uint256 i; i < bids.length; ++i) {
            if (bids[i].size == 0) continue;
            _store(data, offset, bids[i].price);
            _store(data, offset + 32, bids[i].size);
            offset += 64;
        }
        offset += 32; // Zero bid sentinel; asks end at the end of the payload.
        for (uint256 i; i < asks.length; ++i) {
            if (asks[i].size == 0) continue;
            _store(data, offset, asks[i].price);
            _store(data, offset + 32, asks[i].size);
            offset += 64;
        }
    }

    function _store(bytes memory data, uint256 offset, uint256 value) private pure {
        assembly ("memory-safe") { mstore(add(add(data, 32), offset), value) }
    }

    function getMarketParams() external view returns (
        uint32, uint96, address, uint256, address, uint256, uint32, uint96, uint96, uint256, uint256
    ) {
        return (params.pricePrecision, params.sizePrecision, params.base, 6, params.quote, 6,
            params.tickSize, params.minSize, params.maxSize, params.takerFeeBps, params.makerFeeBps);
    }
}
