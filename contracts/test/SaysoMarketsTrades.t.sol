// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {MarketsFixture} from "./utils/MarketsFixture.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {SaysoMarkets} from "../src/SaysoMarkets.sol";
import {KuruTrade} from "../src/KuruTrade.sol";
import {MockOrderBook} from "./mocks/MockOrderBook.sol";

interface IYesTrades {
    function buyYes(uint256 wordId, uint256 ausdIn, uint256 minYesOut) external returns (uint256);
    function sellYes(uint256 wordId, uint256 yesIn, uint256 minAusdOut) external returns (uint256);
}

contract SaysoMarketsTradesTest is MarketsFixture {
    IYesTrades private trades;
    OutcomeToken private yes;
    MockOrderBook private book;
    address private constant MAKER = address(0xBA7);
    event Traded(uint256 indexed wordId, address indexed account, uint8 side, uint256 tokenAmount, uint256 ausdAmount);

    function setUp() public override {
        super.setUp();
        _listEpisode(_createEpisode(1));
        SaysoMarkets.Word memory w = markets.word(1);
        yes = OutcomeToken(w.yes);
        book = MockOrderBook(w.market);
        trades = IYesTrades(address(markets));
        ausd.mint(MAKER, 40_000_000);
        vm.startPrank(MAKER);
        ausd.approve(address(markets), type(uint256).max);
        markets.mintSet(1, 20_000_000, MAKER);
        yes.approve(address(book), type(uint256).max);
        ausd.approve(address(book), type(uint256).max);
        vm.stopPrank();
        ausd.mint(PLAYER, 20_000_000);
        vm.startPrank(PLAYER);
        ausd.approve(address(markets), type(uint256).max);
        markets.mintSet(1, 4_000_000, PLAYER);
        vm.stopPrank();
    }

    function _ask(uint96 size) private {
        vm.prank(MAKER);
        book.seedAsk(5100, size);
    }

    function _bid(uint32 price, uint96 size) private {
        vm.prank(MAKER);
        book.seedBid(price, size);
    }

    function _assertNoStranding() private view {
        assertEq(ausd.balanceOf(address(markets)), markets.totalSets());
        assertEq(markets.totalSets(), 24_000_000);
        assertEq(yes.balanceOf(address(markets)), 0);
        assertEq(yes.totalSupply(), 24_000_000);
    }

    function testBuyRefundsQuoteDustAndEmitsActualPlayerAmounts() public {
        _ask(10_000_000);
        vm.expectEmit(true, true, false, true, address(markets));
        emit Traded(1, PLAYER, 0, 9_803_921, 5_000_000);
        vm.prank(PLAYER);
        assertEq(trades.buyYes(1, 5_000_037, 9_803_921), 9_803_921);
        assertEq(ausd.balanceOf(PLAYER), 11_000_000);
        assertEq(yes.balanceOf(PLAYER), 13_803_921);
        _assertNoStranding();
    }

    function testThinAskRefundsUnfilledQuoteIncludingExhaustedLevelCharge() public {
        _ask(1_000_000);
        vm.expectEmit(true, true, false, true, address(markets));
        emit Traded(1, PLAYER, 0, 1_000_000, 510_100);
        vm.prank(PLAYER);
        assertEq(trades.buyYes(1, 2_000_000, 1_000_000), 1_000_000);
        assertEq(ausd.balanceOf(PLAYER), 15_489_900);
        assertEq(yes.balanceOf(PLAYER), 5_000_000);
        _assertNoStranding();
    }

    function testCashOutAtNinetyEightCentsNeedsNoOutcomeAllowance() public {
        _bid(9800, 2_000_000);
        vm.expectEmit(true, true, false, true, address(markets));
        emit Traded(1, PLAYER, 1, 1_000_000, 980_000);
        vm.prank(PLAYER);
        assertEq(trades.sellYes(1, 1_000_000, 980_000), 980_000);
        assertEq(ausd.balanceOf(PLAYER), 16_980_000);
        assertEq(yes.balanceOf(PLAYER), 3_000_000);
        assertEq(yes.allowance(PLAYER, address(markets)), 0);
        _assertNoStranding();
    }

    function testThinBidRefundsUnsoldYesAndEmitsOnlySoldAmount() public {
        _bid(5000, 1_000_000);
        vm.expectEmit(true, true, false, true, address(markets));
        emit Traded(1, PLAYER, 1, 1_000_000, 500_000);
        vm.prank(PLAYER);
        assertEq(trades.sellYes(1, 3_000_000, 500_000), 500_000);
        assertEq(ausd.balanceOf(PLAYER), 16_500_000);
        assertEq(yes.balanceOf(PLAYER), 3_000_000);
        _assertNoStranding();
    }

    function testBuySlippageRollsBackPlayerInputAndBookFill() public {
        _ask(1_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(KuruTrade.SlippageExceeded.selector);
        trades.buyYes(1, 2_000_000, 1_000_001);
        assertEq(ausd.balanceOf(PLAYER), 16_000_000);
        assertEq(yes.balanceOf(PLAYER), 4_000_000);
        assertEq(yes.balanceOf(address(book)), 1_000_000);
        _assertNoStranding();
    }

    function testSellSlippageRollsBackPlayerInputAndBookFill() public {
        _bid(5000, 1_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(KuruTrade.SlippageExceeded.selector);
        trades.sellYes(1, 2_000_000, 500_001);
        assertEq(ausd.balanceOf(PLAYER), 16_000_000);
        assertEq(yes.balanceOf(PLAYER), 4_000_000);
        assertEq(ausd.balanceOf(address(book)), 500_000);
        _assertNoStranding();
    }

    function testEmptyBookReturnsAllBuyAndSellInput() public {
        vm.prank(PLAYER);
        assertEq(trades.buyYes(1, 1_000_000, 0), 0);
        vm.prank(PLAYER);
        assertEq(trades.sellYes(1, 1_000_000, 0), 0);
        assertEq(ausd.balanceOf(PLAYER), 16_000_000);
        assertEq(yes.balanceOf(PLAYER), 4_000_000);
        _assertNoStranding();
    }

    function testUnlistedWordRejectsBothTradeDirections() public {
        _createEpisode(1);
        vm.prank(PLAYER);
        vm.expectRevert(SaysoMarkets.EpisodeNotListed.selector);
        trades.buyYes(2, 1_000_000, 0);
        vm.prank(PLAYER);
        vm.expectRevert(SaysoMarkets.EpisodeNotListed.selector);
        trades.sellYes(2, 1_000_000, 0);
        _assertNoStranding();
    }

    function testYesTradingAfterClipEndIsAllowedUntilResolution() public {
        _ask(10_000_000);
        _bid(9800, 2_000_000);
        vm.warp(END + 1);
        vm.prank(PLAYER);
        assertEq(trades.buyYes(1, 510_000, 1_000_000), 1_000_000);
        vm.prank(PLAYER);
        assertEq(trades.sellYes(1, 1_000_000, 980_000), 980_000);
        _assertNoStranding();
    }

    function testBurnAfterPartialSaleKeepsSupplyAndCollateralExact() public {
        _bid(5000, 1_000_000);
        vm.prank(PLAYER);
        trades.sellYes(1, 3_000_000, 0);
        vm.prank(PLAYER);
        markets.burnSet(1, 3_000_000, PLAYER);
        assertEq(markets.totalSets(), 21_000_000);
        assertEq(markets.word(1).sets, 21_000_000);
        assertEq(ausd.balanceOf(address(markets)), 21_000_000);
        assertEq(yes.totalSupply(), 21_000_000);
        assertEq(OutcomeToken(markets.word(1).no).totalSupply(), 21_000_000);
        assertEq(yes.balanceOf(PLAYER), 0);
        assertEq(ausd.balanceOf(PLAYER), 19_500_000);
    }
}
