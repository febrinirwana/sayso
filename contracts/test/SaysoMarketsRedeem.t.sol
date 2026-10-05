// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ReportFixture} from "./utils/ReportFixture.sol";
import {SaysoMarkets} from "../src/SaysoMarkets.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IRedemption {
    function redeem(uint256 wordId, uint256 amount) external;
    function voidWord(uint256 wordId) external;
}

contract SaysoMarketsRedeemTest is ReportFixture {
    IRedemption private redemption;
    OutcomeToken private yes;
    OutcomeToken private no;
    uint256 private initialPlayerAusd;
    event Redeemed(uint256 indexed wordId, address indexed account, uint256 tokenAmount, uint256 ausdOut);
    event WordVoided(uint256 indexed wordId);
    event EpisodeSettled(uint32 indexed episodeId);

    function setUp() public override {
        super.setUp();
        _listEpisode(_createEpisode(2));
        redemption = IRedemption(address(markets));
        yes = OutcomeToken(markets.word(1).yes);
        no = OutcomeToken(markets.word(1).no);
        ausd.mint(PLAYER, 20_000_000);
        vm.startPrank(PLAYER);
        ausd.approve(address(markets), type(uint256).max);
        markets.mintSet(1, 5, PLAYER);
        markets.mintSet(2, 7_000_000, PLAYER);
        vm.stopPrank();
        initialPlayerAusd = ausd.balanceOf(PLAYER);
    }

    function _redeem(uint256 amount) private {
        vm.prank(PLAYER);
        redemption.redeem(1, amount);
    }

    function _assertReserve(uint256 firstReserve, uint256 heldSurplus) private view {
        assertEq(markets.word(1).sets, firstReserve);
        assertEq(markets.word(2).sets, 7_000_000);
        assertEq(markets.totalSets(), firstReserve + 7_000_000);
        assertEq(ausd.balanceOf(address(markets)), markets.totalSets() + heldSurplus);
    }

    function testYesRedeemsOnlyWinningSupplyAndNeverMoreThanReserve() public {
        vm.warp(START);
        _resolve(1, 2);
        vm.expectEmit(true, true, false, true, address(markets));
        emit Redeemed(1, PLAYER, 3, 3);
        _redeem(3);
        assertEq(yes.balanceOf(PLAYER), 2);
        assertEq(no.balanceOf(PLAYER), 5);
        _assertReserve(2, 0);
        _redeem(2);
        assertEq(ausd.balanceOf(PLAYER), initialPlayerAusd + 5);
        _assertReserve(0, 0);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, PLAYER, 0, 1));
        _redeem(1);
        _assertReserve(0, 0);
    }

    function testNoRedeemsNoWithoutOutcomeAllowance() public {
        _close();
        _resolve(1, 3);
        _redeem(5);
        assertEq(no.totalSupply(), 0);
        assertEq(yes.totalSupply(), 5);
        assertEq(ausd.balanceOf(PLAYER), initialPlayerAusd + 5);
        _assertReserve(0, 0);
    }

    function testUnresolvedCannotRedeemAndFinalCannotBurnSetsOrVoid() public {
        vm.expectRevert(bytes4(keccak256("WordNotFinal()")));
        _redeem(1);
        vm.warp(START);
        _resolve(1, 2);
        vm.prank(PLAYER);
        vm.expectRevert(SaysoMarkets.WordIsFinal.selector);
        markets.burnSet(1, 1, PLAYER);
        vm.expectRevert(SaysoMarkets.WordIsFinal.selector);
        redemption.voidWord(1);
        _assertReserve(5, 0);
    }

    function testNonHolderCannotRedeemPlayerCollateral() public {
        vm.warp(START);
        _resolve(1, 2);
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, OPERATOR, 0, 1));
        redemption.redeem(1, 1);
        _assertReserve(5, 0);
    }

    function testVoidNeedsOwnerAndActualClosePlusTwentyFourHours() public {
        vm.prank(PLAYER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, PLAYER));
        redemption.voidWord(1);
        vm.expectRevert(bytes4(keccak256("VoidNotAvailable()")));
        redemption.voidWord(1);
        vm.warp(END + 100);
        vm.prank(OPERATOR);
        markets.closeEpisode(1);
        vm.warp(END + 100 + 24 hours - 1);
        vm.expectRevert(bytes4(keccak256("VoidNotAvailable()")));
        redemption.voidWord(1);
        vm.warp(END + 100 + 24 hours);
        vm.expectEmit(true, false, false, true, address(markets));
        emit WordVoided(1);
        redemption.voidWord(1);
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.Void));
        assertEq(markets.episode(1).resolvedCount, 1);
        _assertReserve(4, 1);
        vm.expectRevert(SaysoMarkets.WordIsFinal.selector);
        redemption.voidWord(1);
    }

    function testOddVoidRedeemsBothSidesAndKeepsDustOutsideOtherWordsReserve() public {
        _close();
        vm.warp(END + 24 hours);
        redemption.voidWord(1);
        _assertReserve(4, 1);
        _redeem(3);
        assertEq(yes.totalSupply(), 2);
        assertEq(no.totalSupply(), 5);
        _assertReserve(3, 1);
        _redeem(2);
        _assertReserve(2, 1);
        vm.expectEmit(true, true, false, true, address(markets));
        emit Redeemed(1, PLAYER, 5, 2);
        _redeem(5);
        assertEq(yes.totalSupply(), 0);
        assertEq(no.totalSupply(), 0);
        assertEq(ausd.balanceOf(PLAYER), initialPlayerAusd + 4);
        _assertReserve(0, 1);
    }

    function testSplitOddVoidBurnsNeverCreatePayoutOrStrandedLiability() public {
        _close();
        vm.warp(END + 24 hours);
        redemption.voidWord(1);
        for (uint256 i; i < 10; ++i) {
            _redeem(1);
            assertGe(ausd.balanceOf(address(markets)), markets.totalSets());
        }
        assertEq(yes.totalSupply(), 0);
        assertEq(no.totalSupply(), 0);
        assertEq(ausd.balanceOf(PLAYER), initialPlayerAusd);
        _assertReserve(0, 5);
    }

    function testLastTimeoutVoidEmitsEpisodeSettledAndCannotBeReportedAgain() public {
        _close();
        _resolve(1, 3);
        vm.warp(END + 24 hours);
        vm.expectEmit(true, false, false, true, address(markets));
        emit WordVoided(2);
        vm.expectEmit(true, false, false, true, address(markets));
        emit EpisodeSettled(1);
        redemption.voidWord(2);
        assertEq(markets.episode(1).resolvedCount, 2);
        vm.expectRevert(SaysoMarkets.WordIsFinal.selector);
        _resolve(2, 3);
    }
}
