// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {MarketsFixture} from "./utils/MarketsFixture.sol";
import {SaysoMarkets} from "../src/SaysoMarkets.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";

interface ILifecycle {
    function flagSaid(uint256 wordId, uint16 chunkA, uint16 chunkB, uint32 offsetMs) external;
    function markEvidence(uint32 episodeId, uint256[] calldata wordIds) external;
    function closeEpisode(uint32 episodeId) external;
}

contract SaysoMarketsLifecycleTest is MarketsFixture {
    ILifecycle private lifecycle;
    event WordFlagged(uint32 indexed episodeId, uint256 indexed wordId, uint16 chunkA, uint16 chunkB, uint32 offsetMs);
    event EvidenceReady(uint32 indexed episodeId, uint256[] wordIds);
    event EpisodeClosed(uint32 indexed episodeId);

    function setUp() public override {
        super.setUp();
        _listEpisode(_createEpisode(2));
        lifecycle = ILifecycle(address(markets));
        ausd.mint(PLAYER, 3_000_000);
        vm.startPrank(PLAYER);
        ausd.approve(address(markets), type(uint256).max);
        markets.mintSet(1, 3_000_000, PLAYER);
        vm.stopPrank();
    }

    function _flag(uint256 id) private {
        vm.prank(OPERATOR);
        lifecycle.flagSaid(id, 2, 3, 12_345);
    }

    function _batch(uint256 first, uint256 second) private pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = first;
        ids[1] = second;
    }

    function testFlagAtStartStoresEvidenceButDoesNotSettleOrMoveCollateral() public {
        vm.warp(START);
        vm.expectEmit(true, true, false, true, address(markets));
        emit WordFlagged(1, 1, 2, 3, 12_345);
        _flag(1);
        SaysoMarkets.Word memory w = markets.word(1);
        assertEq(uint8(w.state), uint8(SaysoMarkets.WordState.SaidPending));
        assertEq(w.chunkA, 2);
        assertEq(w.chunkB, 3);
        assertEq(w.offsetMs, 12_345);
        assertEq(markets.episode(1).resolvedCount, 0);
        assertEq(w.sets, 3_000_000);
        assertEq(markets.totalSets(), 3_000_000);
        assertEq(ausd.balanceOf(address(markets)), 3_000_000);
    }

    function testFlagRejectsBeforeStartAndAtOrAfterEnd() public {
        uint256[3] memory times = [uint256(START - 1), uint256(END), uint256(END + 1)];
        for (uint256 i; i < times.length; ++i) {
            vm.warp(times[i]);
            vm.expectRevert(bytes4(keccak256("EpisodeNotLive()")));
            _flag(1);
        }
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.Open));
    }

    function testPauseStillAllowsFlaggingAtLastLiveSecond() public {
        markets.setEpisodesPaused(true);
        vm.warp(END - 1);
        _flag(1);
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.SaidPending));
    }

    function testFlagRequiresListingAndCannotRewriteAnExistingFlag() public {
        _createEpisode(1);
        vm.warp(START);
        vm.expectRevert(SaysoMarkets.EpisodeNotListed.selector);
        _flag(3);
        _flag(1);
        vm.prank(OPERATOR);
        vm.expectRevert(bytes4(keccak256("WordNotOpen()")));
        lifecycle.flagSaid(1, 9, 9, 99);
        assertEq(markets.word(1).offsetMs, 12_345);
    }

    function testOwnerAndPlayerCannotPerformOperatorLifecycleActions() public {
        uint256[] memory ids = _batch(1, 2);
        address[2] memory callers = [address(this), PLAYER];
        for (uint256 i; i < callers.length; ++i) {
            vm.startPrank(callers[i]);
            vm.expectRevert(SaysoMarkets.OnlyOperator.selector);
            lifecycle.flagSaid(1, 0, 0, 0);
            vm.expectRevert(SaysoMarkets.OnlyOperator.selector);
            lifecycle.markEvidence(1, ids);
            vm.expectRevert(SaysoMarkets.OnlyOperator.selector);
            lifecycle.closeEpisode(1);
            vm.stopPrank();
        }
    }

    function testEvidenceBatchEmitsBothPendingWordsWithoutResolvingThem() public {
        vm.warp(START);
        _flag(1);
        _flag(2);
        uint256[] memory ids = _batch(1, 2);
        vm.warp(END);
        vm.expectEmit(true, false, false, true, address(markets));
        emit EvidenceReady(1, ids);
        vm.prank(OPERATOR);
        lifecycle.markEvidence(1, ids);
        assertEq(markets.episode(1).resolvedCount, 0);
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.SaidPending));
        assertEq(uint8(markets.word(2).state), uint8(SaysoMarkets.WordState.SaidPending));
    }

    function testEvidenceRejectsOpenAndForeignWords() public {
        _listEpisode(_createEpisode(1));
        vm.warp(START);
        _flag(1);
        _flag(3);
        vm.prank(OPERATOR);
        vm.expectRevert(bytes4(keccak256("WordNotPending()")));
        lifecycle.markEvidence(1, _batch(1, 2));
        vm.prank(OPERATOR);
        vm.expectRevert(bytes4(keccak256("WordEpisodeMismatch()")));
        lifecycle.markEvidence(1, _batch(1, 3));
    }

    function testUnknownLifecycleIdsRevert() public {
        vm.startPrank(OPERATOR);
        vm.expectRevert(SaysoMarkets.UnknownWord.selector);
        lifecycle.flagSaid(999, 0, 0, 0);
        vm.expectRevert(SaysoMarkets.UnknownEpisode.selector);
        lifecycle.markEvidence(999, _batch(1, 2));
        vm.expectRevert(SaysoMarkets.UnknownWord.selector);
        lifecycle.markEvidence(1, _batch(999, 1));
        vm.expectRevert(SaysoMarkets.UnknownEpisode.selector);
        lifecycle.closeEpisode(999);
        vm.stopPrank();
    }

    function testCloseAtEndRecordsClockOnceStopsMintingButKeepsBurning() public {
        vm.warp(END - 1);
        vm.prank(OPERATOR);
        vm.expectRevert(bytes4(keccak256("EpisodeNotEnded()")));
        lifecycle.closeEpisode(1);
        vm.warp(END);
        vm.expectEmit(true, false, false, true, address(markets));
        emit EpisodeClosed(1);
        vm.prank(OPERATOR);
        lifecycle.closeEpisode(1);
        assertTrue(markets.episode(1).closed);
        assertEq(markets.episode(1).closedAt, END);
        vm.warp(END + 10);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.EpisodeIsClosed.selector);
        lifecycle.closeEpisode(1);
        assertEq(markets.episode(1).closedAt, END);
        vm.startPrank(PLAYER);
        vm.expectRevert(SaysoMarkets.EpisodeIsClosed.selector);
        markets.mintSet(1, 1, PLAYER);
        vm.expectRevert(SaysoMarkets.EpisodeIsClosed.selector);
        markets.mintSetWithPermit(1, 1, PLAYER, 0, 0, bytes32(0), bytes32(0));
        markets.burnSet(1, 1_000_000, PLAYER);
        vm.stopPrank();
        assertEq(markets.totalSets(), 2_000_000);
        assertEq(ausd.balanceOf(address(markets)), 2_000_000);
        assertEq(ausd.balanceOf(PLAYER), 1_000_000);
        assertEq(OutcomeToken(markets.word(1).yes).totalSupply(), 2_000_000);
        assertEq(OutcomeToken(markets.word(1).no).totalSupply(), 2_000_000);
    }
}
