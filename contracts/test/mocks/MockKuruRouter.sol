// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IKuruRouter} from "../../src/interfaces/IKuruRouter.sol";
import {MockOrderBook} from "./MockOrderBook.sol";

contract MockKuruRouter is IKuruRouter {
    uint8 public marketType;
    address public lastMarket;
    MockOrderBook.Params public lastParams;
    error MarketTypeMismatch();

    function deployProxy(
        uint8 _type, address _baseAssetAddress, address _quoteAssetAddress,
        uint96 _sizePrecision, uint32 _pricePrecision, uint32 _tickSize,
        uint96 _minSize, uint96 _maxSize, uint256 _takerFeeBps,
        uint256 _makerFeeBps, uint96 _kuruAmmSpread
    ) external returns (address proxy) {
        if (_type != 0) revert MarketTypeMismatch();
        marketType = _type;
        lastParams.base = _baseAssetAddress;
        lastParams.quote = _quoteAssetAddress;
        lastParams.sizePrecision = _sizePrecision;
        lastParams.pricePrecision = _pricePrecision;
        lastParams.tickSize = _tickSize;
        lastParams.minSize = _minSize;
        lastParams.maxSize = _maxSize;
        lastParams.takerFeeBps = _takerFeeBps;
        lastParams.makerFeeBps = _makerFeeBps;
        lastParams.ammSpread = _kuruAmmSpread;
        proxy = address(new MockOrderBook(lastParams));
        lastMarket = proxy;
    }
}
