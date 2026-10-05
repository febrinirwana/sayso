// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IKuruRouter {
    function deployProxy(
        uint8 _type, address _baseAssetAddress, address _quoteAssetAddress,
        uint96 _sizePrecision, uint32 _pricePrecision, uint32 _tickSize,
        uint96 _minSize, uint96 _maxSize, uint256 _takerFeeBps,
        uint256 _makerFeeBps, uint96 _kuruAmmSpread
    ) external returns (address proxy);
}
