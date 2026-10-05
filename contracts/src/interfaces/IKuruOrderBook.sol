// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IKuruOrderBook {
    function placeAndExecuteMarketBuy(uint96 _quoteSize, uint256 _minAmountOut, bool _isMargin, bool _isFillOrKill)
        external payable returns (uint256);
    function placeAndExecuteMarketSell(uint96 _size, uint256 _minAmountOut, bool _isMargin, bool _isFillOrKill)
        external payable returns (uint256);
    function getL2Book() external view returns (bytes memory);
    function bestBidAsk() external view returns (uint256, uint256);
    function getMarketParams() external view returns (
        uint32, uint96, address, uint256, address, uint256, uint32, uint96, uint96, uint256, uint256
    );
}
