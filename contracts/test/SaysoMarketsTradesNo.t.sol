// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {MarketsFixture} from "./utils/MarketsFixture.sol";
import {SaysoMarkets} from "../src/SaysoMarkets.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {KuruTrade} from "../src/KuruTrade.sol";
import {MockOrderBook} from "./mocks/MockOrderBook.sol";

interface INoTrades {
    function buyNo(uint256 wordId, uint256 noAmount, uint256 maxAusdIn) external returns (uint256);
    function sellNo(uint256 wordId, uint256 noIn, uint256 minAusdOut) external returns (uint256);
}

contract SaysoMarketsTradesNoTest is MarketsFixture {
    INoTrades private trades;
    OutcomeToken private yes;
    OutcomeToken private no;
    MockOrderBook private book;
    address private constant MAKER = address(0xBA7);
    event Traded(uint256 indexed wordId, address indexed account, uint8 side, uint256 tokenAmount, uint256 ausdAmount);

    function setUp() public override {
        super.setUp();
        _listEpisode(_createEpisode(2));
        SaysoMarkets.Word memory w = markets.word(1);
        yes = OutcomeToken(w.yes);
        no = OutcomeToken(w.no);
        book = MockOrderBook(w.market);
        trades = INoTrades(address(markets));
        ausd.mint(MAKER, 40_000_000);
        vm.startPrank(MAKER);
        ausd.approve(address(markets), type(uint256).max);
        markets.mintSet(1, 20_000_000, MAKER);
        markets.mintSet(2, 7_000_000, MAKER);
        yes.approve(address(book), type(uint256).max);
        ausd.approve(address(book), type(uint256).max);
        vm.stopPrank();
        ausd.mint(PLAYER, 20_000_000);
        vm.startPrank(PLAYER);
        ausd.approve(address(markets), type(uint256).max);
        markets.mintSet(1, 3_000_000, PLAYER);
        vm.stopPrank();
    }

    function _ask(uint96 size) private {
        vm.prank(MAKER);
        book.seedAsk(5100, size);
    }

    function _bid(uint96 size) private {
        vm.prank(MAKER);
        book.seedBid(5000, size);
    }

    function _assertCollateral(uint256 firstSets) private view {
        assertEq(markets.word(1).sets, firstSets);
        assertEq(yes.totalSupply(), firstSets);
        assertEq(no.totalSupply(), firstSets);
        assertEq(markets.word(2).sets, 7_000_000);
        assertEq(markets.totalSets(), firstSets + 7_000_000);
        assertEq(ausd.balanceOf(address(markets)), firstSets + 7_000_000);
        assertEq(yes.balanceOf(address(markets)), 0);
        assertEq(no.balanceOf(address(markets)), 0);
    }

    function testBuyNoPullsOnlyNetCostFromPlayerWithExactlyThatBalance() public {
        _bid(2_000_000);
        uint256 quoteBefore = ausd.balanceOf(address(book));
        address buyer = address(0xCA7);
        ausd.mint(buyer, 1_000_000);
        vm.prank(buyer);
        ausd.approve(address(markets), 1_000_000);
        vm.expectEmit(true, true, false, true, address(markets));
        emit Traded(1, buyer, 2, 2_000_000, 1_000_000);
        vm.prank(buyer);
        assertEq(trades.buyNo(1, 2_000_000, 1_000_000), 1_000_000);
        assertEq(ausd.balanceOf(buyer), 0);
        assertEq(no.balanceOf(buyer), 2_000_000);
        assertEq(yes.balanceOf(buyer), 0);
        assertEq(quoteBefore - ausd.balanceOf(address(book)), 1_000_000);
        _assertCollateral(25_000_000);
    }

    function testPartialYesSaleRollsBackNewSetsAndPlayerCost() public {
        _bid(1_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(KuruTrade.InsufficientLiquidity.selector);
        trades.buyNo(1, 2_000_000, 2_000_000);
        assertEq(ausd.balanceOf(PLAYER), 17_000_000);
        assertEq(no.balanceOf(PLAYER), 3_000_000);
        assertEq(ausd.balanceOf(address(book)), 500_000);
        _assertCollateral(23_000_000);
    }

    function testBuyNoMaximumCostRollsBackFullFill() public {
        _bid(2_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(KuruTrade.SlippageExceeded.selector);
        trades.buyNo(1, 2_000_000, 999_999);
        assertEq(ausd.balanceOf(PLAYER), 17_000_000);
        assertEq(no.balanceOf(PLAYER), 3_000_000);
        _assertCollateral(23_000_000);
    }

    function testSellNoPaysMeasuredProceedsAndReturnsYesRoundingDust() public {
        _ask(10_000_000);
        uint256 quoteBefore = ausd.balanceOf(address(book));
        uint256 baseBefore = yes.balanceOf(address(book));
        vm.expectEmit(true, true, false, true, address(markets));
        emit Traded(1, PLAYER, 3, 1_000_001, 489_901);
        vm.prank(PLAYER);
        assertEq(trades.sellNo(1, 1_000_001, 489_901), 489_901);
        assertEq(ausd.balanceOf(PLAYER), 17_489_901);
        assertEq(no.balanceOf(PLAYER), 1_999_999);
        assertEq(yes.balanceOf(PLAYER), 3_000_195);
        assertEq(ausd.balanceOf(address(book)) - quoteBefore, 510_100);
        assertEq(baseBefore - yes.balanceOf(address(book)), 1_000_196);
        _assertCollateral(21_999_999);
    }

    function testExhaustedAskCostsExtraQuantumButCannotUseOtherWordsCollateral() public {
        _ask(3_000_000);
        uint256 quoteBefore = ausd.balanceOf(address(book));
        vm.expectEmit(true, true, false, true, address(markets));
        emit Traded(1, PLAYER, 3, 3_000_000, 1_469_900);
        vm.prank(PLAYER);
        assertEq(trades.sellNo(1, 3_000_000, 1_469_900), 1_469_900);
        assertEq(no.balanceOf(PLAYER), 0);
        assertEq(ausd.balanceOf(PLAYER), 18_469_900);
        assertEq(ausd.balanceOf(address(book)) - quoteBefore, 1_530_100);
        _assertCollateral(20_000_000);
        assertEq(OutcomeToken(markets.word(2).yes).totalSupply(), 7_000_000);
        assertEq(OutcomeToken(markets.word(2).no).totalSupply(), 7_000_000);
    }

    function testSellNoMinimumHonorsExhaustedLevelCost() public {
        _ask(1_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(KuruTrade.SlippageExceeded.selector);
        trades.sellNo(1, 1_000_000, 490_000);
        assertEq(no.balanceOf(PLAYER), 3_000_000);
        _assertCollateral(23_000_000);
    }

    function testThinAsksCannotBurnNoOrTakeCollateral() public {
        _ask(1_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(KuruTrade.InsufficientLiquidity.selector);
        trades.sellNo(1, 2_000_000, 0);
        assertEq(no.balanceOf(PLAYER), 3_000_000);
        _assertCollateral(23_000_000);
    }

    function testMinimumAboveTokenValueRevertsSlippageNotArithmetic() public {
        vm.prank(PLAYER);
        vm.expectRevert(KuruTrade.SlippageExceeded.selector);
        trades.sellNo(1, 1_000_000, 1_000_001);
        _assertCollateral(23_000_000);
    }

    function testClosedEpisodeBlocksNewNoButAllowsSellingExistingNo() public {
        // Stage 5 owns closeEpisode; preserve the inspected packed episode fields.
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(uint32(1), uint256(9)))) + 3);
        vm.store(address(markets), slot, vm.load(address(markets), slot) | bytes32(uint256(1) << 216));
        vm.warp(END);
        assertTrue(markets.episode(1).closed);
        _bid(2_000_000);
        _ask(10_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(SaysoMarkets.EpisodeIsClosed.selector);
        trades.buyNo(1, 2_000_000, 1_000_000);
        vm.prank(PLAYER);
        assertEq(trades.sellNo(1, 1_000_001, 489_901), 489_901);
        _assertCollateral(21_999_999);
    }

    function testResolvedWordsRejectBothNoTrades() public {
        // Stage 6 owns settlement; state occupies byte 4 of the inspected word slot.
        bytes32 slot = keccak256(abi.encode(uint256(1), uint256(10)));
        vm.store(address(markets), slot, vm.load(address(markets), slot) | bytes32(uint256(2) << 32));
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.Yes));
        vm.prank(PLAYER);
        vm.expectRevert(SaysoMarkets.WordIsFinal.selector);
        trades.buyNo(1, 1_000_000, 1_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(SaysoMarkets.WordIsFinal.selector);
        trades.sellNo(1, 1_000_000, 0);
        assertEq(markets.totalSets(), 30_000_000);
        assertEq(ausd.balanceOf(address(markets)), 30_000_000);
    }

    function testUnlistedWordRejectsBothNoTrades() public {
        _createEpisode(1);
        vm.expectRevert(SaysoMarkets.EpisodeNotListed.selector);
        trades.buyNo(3, 1_000_000, 1_000_000);
        vm.expectRevert(SaysoMarkets.EpisodeNotListed.selector);
        trades.sellNo(3, 1_000_000, 0);
        _assertCollateral(23_000_000);
    }

    function testEveryTradeRejectsAnExistingCollateralShortfall() public {
        _bid(2_000_000);
        _ask(10_000_000);
        deal(address(ausd), address(markets), 29_999_999);
        vm.startPrank(PLAYER);
        vm.expectRevert(SaysoMarkets.InsufficientCollateral.selector);
        trades.buyNo(1, 1_000_000, 500_000);
        vm.expectRevert(SaysoMarkets.InsufficientCollateral.selector);
        trades.sellNo(1, 1_000_000, 0);
        vm.expectRevert(SaysoMarkets.InsufficientCollateral.selector);
        markets.buyYes(1, 510_000, 1_000_000);
        vm.expectRevert(SaysoMarkets.InsufficientCollateral.selector);
        markets.sellYes(1, 1_000_000, 500_000);
        vm.stopPrank();
        assertEq(markets.totalSets(), 30_000_000);
        assertEq(no.balanceOf(PLAYER), 3_000_000);
        assertEq(yes.balanceOf(PLAYER), 3_000_000);
    }
}
