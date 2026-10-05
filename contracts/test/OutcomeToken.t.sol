// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract OutcomeTokenTest is Test {
    OutcomeToken private implementation;
    OutcomeToken private token;
    address private constant PLAYER = address(0xA11CE);
    address private constant BOOK = address(0xB00C);
    bytes4 private constant ONLY_MARKETS = bytes4(keccak256("OnlyMarkets()"));

    function setUp() public {
        implementation = new OutcomeToken();
        token = OutcomeToken(Clones.clone(address(implementation)));
        token.initialize("YES moon", "YES");
        token.mint(PLAYER, 10_000_000);
    }

    function testImplementationCannotInitialize() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        implementation.initialize("attacker", "BAD");
    }

    function testCloneCannotReinitializeOrReplaceMarkets() public {
        vm.prank(BOOK);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        token.initialize("attacker", "BAD");
        assertEq(token.markets(), address(this));
        assertEq(token.name(), "YES moon");
        assertEq(token.symbol(), "YES");
    }

    function testCloneHasSixDecimals() public view {
        assertEq(token.decimals(), 6);
        assertEq(token.balanceOf(PLAYER), 10_000_000);
    }

    function testUnauthorizedMintCannotIncreaseSupply() public {
        vm.prank(PLAYER);
        vm.expectRevert(ONLY_MARKETS);
        token.mint(PLAYER, 1_000_000);
        assertEq(token.totalSupply(), 10_000_000);
    }

    function testUnauthorizedBurnCannotDestroyPlayerBalance() public {
        vm.prank(BOOK);
        vm.expectRevert(ONLY_MARKETS);
        token.burn(PLAYER, 1_000_000);
        assertEq(token.balanceOf(PLAYER), 10_000_000);
        assertEq(token.totalSupply(), 10_000_000);
    }

    function testMarketsBurnUpdatesSupplyAndPlayerBalance() public {
        token.burn(PLAYER, 3_000_000);
        assertEq(token.balanceOf(PLAYER), 7_000_000);
        assertEq(token.totalSupply(), 7_000_000);
    }

    function testMarketsTransfersWithoutPlayerApproval() public {
        assertTrue(token.transferFrom(PLAYER, BOOK, 3_000_000));
        assertEq(token.balanceOf(PLAYER), 7_000_000);
        assertEq(token.balanceOf(BOOK), 3_000_000);
        assertEq(token.allowance(PLAYER, address(this)), 0);
        assertEq(token.totalSupply(), 10_000_000);
    }

    function testTrustedSpenderCannotTransferMoreThanPlayerBalance() public {
        vm.expectRevert(abi.encodeWithSelector(
            IERC20Errors.ERC20InsufficientBalance.selector, PLAYER, 10_000_000, 10_000_001
        ));
        token.transferFrom(PLAYER, BOOK, 10_000_001);
        assertEq(token.balanceOf(PLAYER), 10_000_000);
    }

    function testBookCannotTransferPlayerTokensWithoutAllowance() public {
        vm.prank(BOOK);
        vm.expectRevert(abi.encodeWithSelector(
            IERC20Errors.ERC20InsufficientAllowance.selector, BOOK, 0, 1_000_000
        ));
        token.transferFrom(PLAYER, BOOK, 1_000_000);
        assertEq(token.balanceOf(PLAYER), 10_000_000);
    }

    function testBookSpendsNormalAllowanceAndCannotExceedIt() public {
        vm.prank(PLAYER);
        token.approve(BOOK, 3_000_000);
        vm.prank(BOOK);
        token.transferFrom(PLAYER, BOOK, 2_000_000);
        assertEq(token.allowance(PLAYER, BOOK), 1_000_000);
        assertEq(token.balanceOf(PLAYER), 8_000_000);
        assertEq(token.balanceOf(BOOK), 2_000_000);
        vm.prank(BOOK);
        vm.expectRevert(abi.encodeWithSelector(
            IERC20Errors.ERC20InsufficientAllowance.selector, BOOK, 1_000_000, 1_000_001
        ));
        token.transferFrom(PLAYER, BOOK, 1_000_001);
    }

    function testBookNeedsAllowanceEvenWhenSpendingMarketsInventory() public {
        token.mint(address(this), 2_000_000);
        vm.prank(BOOK);
        vm.expectRevert(abi.encodeWithSelector(
            IERC20Errors.ERC20InsufficientAllowance.selector, BOOK, 0, 1_000_000
        ));
        token.transferFrom(address(this), BOOK, 1_000_000);
        token.approve(BOOK, type(uint256).max);
        vm.prank(BOOK);
        token.transferFrom(address(this), BOOK, 1_000_000);
        assertEq(token.balanceOf(address(this)), 1_000_000);
        assertEq(token.balanceOf(BOOK), 1_000_000);
        assertEq(token.allowance(address(this), BOOK), type(uint256).max);
    }

    function testClonesKeepBalancesAndMarketsIsolated() public {
        OutcomeToken other = OutcomeToken(Clones.clone(address(implementation)));
        vm.prank(BOOK);
        other.initialize("NO moon", "NO");
        vm.prank(BOOK);
        other.mint(PLAYER, 2_000_000);
        vm.expectRevert(ONLY_MARKETS);
        other.burn(PLAYER, 1_000_000);
        assertEq(other.markets(), BOOK);
        assertEq(other.balanceOf(PLAYER), 2_000_000);
        assertEq(other.totalSupply(), 2_000_000);
        assertEq(token.markets(), address(this));
        assertEq(token.balanceOf(PLAYER), 10_000_000);
        assertEq(token.totalSupply(), 10_000_000);
    }
}
