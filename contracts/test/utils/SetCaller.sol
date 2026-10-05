// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {SaysoMarkets} from "../../src/SaysoMarkets.sol";

contract SetCaller {
    SaysoMarkets private immutable markets;

    constructor(SaysoMarkets markets_) {
        markets = markets_;
        markets.AUSD().approve(address(markets_), type(uint256).max);
    }

    function mint(uint256 wordId, uint256 amount, address account) external {
        markets.mintSet(wordId, amount, account);
    }

    function burn(uint256 wordId, uint256 amount, address recipient) external {
        markets.burnSet(wordId, amount, recipient);
    }
}
