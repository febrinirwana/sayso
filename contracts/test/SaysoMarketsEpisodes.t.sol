// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MarketsFixture} from "./utils/MarketsFixture.sol";
import {SaysoMarkets} from "../src/SaysoMarkets.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {MockOrderBook} from "./mocks/MockOrderBook.sol";

contract SaysoMarketsEpisodesTest is MarketsFixture {
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event EpisodesPausedUpdated(bool paused);
    event ReportOriginUpdated(address indexed previousOrigin, address indexed newOrigin);
    event EpisodeCreated(uint32 indexed episodeId, bytes32 clipId, bytes32 rootA, bytes32 rootB, uint64 startsAt, uint64 endsAt);

    function testOwnerRotatesOperatorAndOldOperatorLosesAccess() public {
        vm.expectEmit(true, true, false, true, address(markets));
        emit OperatorUpdated(OPERATOR, PLAYER);
        markets.setOperator(PLAYER);
        bytes32[] memory texts = _texts(1);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.OnlyOperator.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts);
        vm.prank(PLAYER);
        assertEq(markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts), 1);
    }

    function testNonOwnerCannotSetOperator() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OPERATOR));
        markets.setOperator(PLAYER);
        assertEq(markets.operator(), OPERATOR);
    }

    function testNonOwnerCannotPauseEpisodes() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OPERATOR));
        markets.setEpisodesPaused(true);
        assertFalse(markets.episodesPaused());
    }

    function testNonOwnerCannotSetReportOrigin() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OPERATOR));
        markets.setReportOrigin(PLAYER);
        assertEq(markets.reportOrigin(), address(0));
    }

    function testOwnerSetsAndClearsReportOriginWithEvents() public {
        vm.expectEmit(true, true, false, true, address(markets));
        emit ReportOriginUpdated(address(0), PLAYER);
        markets.setReportOrigin(PLAYER);
        assertEq(markets.reportOrigin(), PLAYER);
        vm.expectEmit(true, true, false, true, address(markets));
        emit ReportOriginUpdated(PLAYER, address(0));
        markets.setReportOrigin(address(0));
        assertEq(markets.reportOrigin(), address(0));
    }

    function testPauseStopsNewEpisodesAndUnpauseRestoresCreation() public {
        vm.expectEmit(false, false, false, true, address(markets));
        emit EpisodesPausedUpdated(true);
        markets.setEpisodesPaused(true);
        bytes32[] memory texts = _texts(1);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.EpisodesPaused.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts);
        assertEq(markets.nextEpisodeId(), 1);
        assertEq(markets.nextWordId(), 1);
        markets.setEpisodesPaused(false);
        assertEq(_createEpisode(1), 1);
    }

    function testOnlyOperatorCanCreateEpisode() public {
        bytes32[] memory texts = _texts(1);
        vm.expectRevert(SaysoMarkets.OnlyOperator.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts);
    }

    function testRejectsZeroWords() public {
        bytes32[] memory texts = _texts(0);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.InvalidWordCount.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts);
    }

    function testRejectsNineWords() public {
        bytes32[] memory texts = _texts(9);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.InvalidWordCount.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts);
    }

    function testLateEmptyWordRollsBackEpisodeAndWordIds() public {
        bytes32[] memory texts = _texts(2);
        texts[1] = bytes32(0);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.InvalidWordText.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts);
        assertEq(markets.nextEpisodeId(), 1);
        assertEq(markets.nextWordId(), 1);
        assertEq(_createEpisode(1), 1);
        assertEq(markets.episodeWords(1)[0], 1);
    }

    function testRejectsStartBeforeNow() public {
        bytes32[] memory texts = _texts(1);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.InvalidEpisodeTime.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, 999, END, texts);
    }

    function testAcceptsStartExactlyNow() public {
        bytes32[] memory texts = _texts(1);
        vm.prank(OPERATOR);
        assertEq(markets.createEpisode(CLIP, ROOT_A, ROOT_B, 1_000, END, texts), 1);
        assertEq(markets.episode(1).startsAt, 1_000);
    }

    function testRejectsEndEqualToStart() public {
        bytes32[] memory texts = _texts(1);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.InvalidEpisodeTime.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, START, texts);
    }

    function testRejectsEndBeforeStart() public {
        bytes32[] memory texts = _texts(1);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.InvalidEpisodeTime.selector);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, START - 1, texts);
    }

    function testCreationCommitsRootsAndEmitsWordTokenAddresses() public {
        vm.recordLogs();
        uint32 episodeId = _createEpisode(2);
        SaysoMarkets.Episode memory ep = markets.episode(episodeId);
        assertEq(ep.clipId, CLIP);
        assertEq(ep.rootA, ROOT_A);
        assertEq(ep.rootB, ROOT_B);
        assertEq(ep.startsAt, START);
        assertEq(ep.endsAt, END);
        assertEq(ep.closedAt, 0);
        assertEq(ep.wordCount, 2);
        assertEq(ep.resolvedCount, 0);
        assertFalse(ep.listed);
        assertFalse(ep.closed);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 observed;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(markets)) continue;
            if (observed == 0) {
                assertEq(logs[i].topics[0], keccak256("EpisodeCreated(uint32,bytes32,bytes32,bytes32,uint64,uint64)"));
                assertEq(uint256(logs[i].topics[1]), 1);
                assertEq(logs[i].data, abi.encode(CLIP, ROOT_A, ROOT_B, START, END));
            } else {
                uint256 id = observed;
                SaysoMarkets.Word memory w = markets.word(id);
                assertEq(logs[i].topics[0], keccak256("WordAdded(uint32,uint256,bytes32,address,address)"));
                assertEq(uint256(logs[i].topics[1]), 1);
                assertEq(uint256(logs[i].topics[2]), id);
                assertEq(logs[i].data, abi.encode(bytes32("moon"), w.yes, w.no));
            }
            ++observed;
        }
        assertEq(observed, 3);
    }

    function testWordsHaveGlobalIdsAcrossEpisodes() public {
        assertEq(_createEpisode(2), 1);
        assertEq(_createEpisode(1), 2);
        uint256[] memory first = markets.episodeWords(1);
        uint256[] memory second = markets.episodeWords(2);
        assertEq(first.length, 2);
        assertEq(first[0], 1);
        assertEq(first[1], 2);
        assertEq(second[0], 3);
        assertEq(markets.word(3).episodeId, 2);
        assertEq(markets.nextEpisodeId(), 3);
        assertEq(markets.nextWordId(), 4);
    }

    function testClonesAreDistinctAndControlledByMarkets() public {
        _createEpisode(2);
        SaysoMarkets.Word memory first = markets.word(1);
        SaysoMarkets.Word memory second = markets.word(2);
        assertEq(first.text, bytes32("moon"));
        assertEq(uint8(first.state), uint8(SaysoMarkets.WordState.Open));
        assertEq(first.sets, 0);
        assertEq(first.market, address(0));
        assertTrue(first.yes != first.no && first.yes != second.yes && first.no != second.no);
        assertTrue(first.yes != address(tokenImpl));
        assertEq(OutcomeToken(first.yes).markets(), address(markets));
        assertEq(OutcomeToken(first.no).markets(), address(markets));
        assertEq(OutcomeToken(first.yes).name(), "YES moon");
        assertEq(OutcomeToken(first.no).name(), "NO moon");
        assertEq(OutcomeToken(first.yes).symbol(), "YES");
        assertEq(OutcomeToken(first.no).symbol(), "NO");
        vm.prank(OPERATOR);
        vm.expectRevert(OutcomeToken.OnlyMarkets.selector);
        OutcomeToken(first.yes).mint(PLAYER, 1_000_000);
    }

    function testFullLengthWordKeepsAllThirtyTwoBytesInTokenNames() public {
        bytes32[] memory texts = new bytes32[](1);
        texts[0] = bytes32("abcdefghijklmnopqrstuvwxyz123456");
        vm.prank(OPERATOR);
        markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts);
        SaysoMarkets.Word memory w = markets.word(1);
        assertEq(OutcomeToken(w.yes).name(), "YES abcdefghijklmnopqrstuvwxyz123456");
        assertEq(OutcomeToken(w.no).name(), "NO abcdefghijklmnopqrstuvwxyz123456");
    }

    function testEightWordListingDeploysIndependentBooksAndApprovals() public {
        uint32 id = _createEpisode(8);
        vm.recordLogs();
        _listEpisode(id);
        assertTrue(markets.episode(id).listed);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 observed;
        for (uint256 i = 1; i <= 8; ++i) {
            SaysoMarkets.Word memory w = markets.word(i);
            assertTrue(w.market.code.length != 0);
            if (i > 1) assertTrue(w.market != markets.word(i - 1).market);
            assertEq(ausd.allowance(address(markets), w.market), type(uint256).max);
            assertEq(OutcomeToken(w.yes).allowance(address(markets), w.market), type(uint256).max);
            assertEq(OutcomeToken(w.no).allowance(address(markets), w.market), 0);
            _assertBookParams(w);
        }
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(markets)) continue;
            ++observed;
            assertEq(logs[i].topics[0], keccak256("WordListed(uint256,address)"));
            assertEq(uint256(logs[i].topics[1]), observed);
            assertEq(logs[i].data, abi.encode(markets.word(observed).market));
        }
        assertEq(observed, 8);
        assertEq(ausd.allowance(address(markets), address(router)), 0);
        assertEq(ausd.balanceOf(address(markets)), 0);
        assertEq(markets.totalSets(), 0);
    }

    function _assertBookParams(SaysoMarkets.Word memory w) private view {
        (uint32 pricePrecision, uint96 sizePrecision, address base, address quote, uint32 tickSize,
            uint96 minSize, uint96 maxSize, uint256 takerFee, uint256 makerFee, uint96 spread)
            = MockOrderBook(w.market).params();
        assertEq(pricePrecision, 1e4);
        assertEq(sizePrecision, 1e6);
        assertEq(base, w.yes);
        assertEq(quote, address(ausd));
        assertEq(tickSize, 100);
        assertEq(minSize, 1e6);
        assertEq(maxSize, 1e10);
        assertEq(takerFee, 0);
        assertEq(makerFee, 0);
        assertEq(spread, 100);
    }

    function testOnlyOperatorCanList() public {
        uint32 id = _createEpisode(1);
        vm.expectRevert(SaysoMarkets.OnlyOperator.selector);
        markets.listEpisode(id);
        assertFalse(markets.episode(id).listed);
    }

    function testListingCannotReplaceAnExistingMarket() public {
        uint32 id = _createEpisode(1);
        _listEpisode(id);
        address initial = markets.word(1).market;
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.EpisodeAlreadyListed.selector);
        markets.listEpisode(id);
        assertEq(markets.word(1).market, initial);
    }

    function testListingAtEndIsRejected() public {
        uint32 id = _createEpisode(1);
        vm.warp(END);
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.EpisodeEnded.selector);
        markets.listEpisode(id);
        assertFalse(markets.episode(id).listed);
        assertEq(markets.word(1).market, address(0));
    }

    function testListingOneSecondBeforeEndIsAllowedWhilePaused() public {
        uint32 id = _createEpisode(1);
        markets.setEpisodesPaused(true);
        vm.warp(END - 1);
        _listEpisode(id);
        assertTrue(markets.episode(id).listed);
    }

    function testUnknownEpisodeCannotBeListed() public {
        vm.prank(OPERATOR);
        vm.expectRevert(SaysoMarkets.UnknownEpisode.selector);
        markets.listEpisode(1);
        assertEq(router.lastMarket(), address(0));
    }

    function testReadersRejectUnknownIds() public {
        vm.expectRevert(SaysoMarkets.UnknownEpisode.selector);
        markets.episode(0);
        vm.expectRevert(SaysoMarkets.UnknownEpisode.selector);
        markets.episodeWords(1);
        vm.expectRevert(SaysoMarkets.UnknownWord.selector);
        markets.word(0);
    }

    function testReportsFailClosedBeforeReceiverStage() public {
        uint32 id = _createEpisode(1);
        uint256[] memory ids = markets.episodeWords(id);
        uint8[] memory outcomes = new uint8[](1);
        outcomes[0] = 2;
        vm.prank(FORWARDER);
        vm.expectRevert(SaysoMarkets.ReportsDisabled.selector);
        markets.onReport("", abi.encode(id, ids, outcomes, bytes32(0)));
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.Open));
    }
}
