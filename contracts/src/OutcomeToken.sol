// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract OutcomeToken is ERC20Upgradeable {
    address public markets;

    error OnlyMarkets();

    constructor() {
        _disableInitializers();
    }

    modifier onlyMarkets() {
        if (msg.sender != markets) revert OnlyMarkets();
        _;
    }

    function initialize(string memory name_, string memory symbol_) external initializer {
        __ERC20_init(name_, symbol_);
        markets = msg.sender;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyMarkets {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMarkets {
        _burn(from, amount);
    }

    // Players approve neither outcome; Kuru books still need ordinary ERC-20 allowances.
    function _spendAllowance(address owner, address spender, uint256 amount) internal override {
        if (spender != markets) super._spendAllowance(owner, spender, amount);
    }
}
