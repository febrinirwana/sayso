// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ReportFixture} from "./utils/ReportFixture.sol";
import {SaysoMarkets} from "../src/SaysoMarkets.sol";
import {ReceiverTemplate} from "../src/vendor/chainlink/ReceiverTemplate.sol";

contract SaysoMarketsReportsTest is ReportFixture {
    event WordResolved(uint32 indexed episodeId, uint256 indexed wordId, uint8 outcome, bytes32 evidenceHash);
    event EpisodeSettled(uint32 indexed episodeId);

    function setUp() public override {
        super.setUp();
        _listEpisode(_createEpisode(2));
    }

    function _pair(uint256 secondId, uint8 secondOutcome) private pure returns (uint256[] memory ids, uint8[] memory outcomes) {
        ids = new uint256[](2);
        outcomes = new uint8[](2);
        ids[0] = 1;
        ids[1] = secondId;
        outcomes[0] = 2;
        outcomes[1] = secondOutcome;
    }

    function _assertOpen() private view {
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.Open));
        assertEq(uint8(markets.word(2).state), uint8(SaysoMarkets.WordState.Open));
        assertEq(markets.episode(1).resolvedCount, 0);
    }

    function testProductionMetadataAllowsPendingYesBeforeCloseAndLateOpenYes() public {
        markets.setExpectedWorkflowId(WORKFLOW_ID);
        vm.warp(START);
        vm.prank(OPERATOR);
        markets.flagSaid(1, 2, 3, 12345);
        vm.expectEmit(true, true, false, true, address(markets));
        emit WordResolved(1, 1, 2, EVIDENCE);
        _resolve(1, 2);
        assertFalse(markets.episode(1).closed);
        assertEq(markets.episode(1).resolvedCount, 1);
        _close();
        vm.expectEmit(true, true, false, true, address(markets));
        emit WordResolved(1, 2, 2, EVIDENCE);
        vm.expectEmit(true, false, false, true, address(markets));
        emit EpisodeSettled(1);
        _resolve(2, 2);
        assertEq(markets.episode(1).resolvedCount, 2);
        assertEq(uint8(markets.word(2).state), uint8(SaysoMarkets.WordState.Yes));
        vm.expectRevert(SaysoMarkets.WordIsFinal.selector);
        _resolve(2, 2);
    }

    function testClosedReportCorrectsFalseFlagToNo() public {
        vm.warp(START);
        vm.prank(OPERATOR);
        markets.flagSaid(2, 0, 0, 1);
        _close();
        (uint256[] memory ids, uint8[] memory outcomes) = _pair(2, 3);
        _report(1, ids, outcomes);
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.Yes));
        assertEq(uint8(markets.word(2).state), uint8(SaysoMarkets.WordState.No));
        assertEq(markets.episode(1).resolvedCount, 2);
    }

    function testWrongForwarderCannotResolve() public {
        vm.warp(START);
        vm.prank(PLAYER);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, PLAYER, address(forwarder)));
        markets.onReport(_metadata(WORKFLOW_ID), "");
        _assertOpen();
    }

    function testWrongWorkflowIdCannotResolve() public {
        markets.setExpectedWorkflowId(WORKFLOW_ID);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidWorkflowId.selector, bytes32(0), WORKFLOW_ID));
        forwarder.deliver(address(markets), _metadata(bytes32(0)), "");
        _assertOpen();
    }

    function testSimulationOriginGateRejectsForgedReportsAndAllowsReporter() public {
        markets.setReportOrigin(OPERATOR);
        vm.warp(START);
        vm.prank(PLAYER, PLAYER);
        vm.expectRevert(bytes4(keccak256("InvalidReportOrigin()")));
        _resolve(1, 2);
        _assertOpen();
        vm.prank(PLAYER, OPERATOR);
        _resolve(1, 2);
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.Yes));
        markets.setReportOrigin(address(0));
        vm.prank(PLAYER, PLAYER);
        _resolve(2, 2);
        assertEq(markets.episode(1).resolvedCount, 2);
    }

    function testZeroForwarderFailsClosedEvenThroughFormerForwarder() public {
        markets.setForwarderAddress(address(0));
        vm.warp(START);
        vm.prank(PLAYER);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, PLAYER, address(0)));
        markets.onReport(_metadata(WORKFLOW_ID), "");
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(forwarder), address(0)));
        _resolve(1, 2);
        _assertOpen();
    }

    function testNoRequiresExplicitCloseAndYesRequiresStart() public {
        vm.expectRevert(bytes4(keccak256("EpisodeNotStarted()")));
        _resolve(1, 2);
        vm.warp(END);
        vm.expectRevert(bytes4(keccak256("EpisodeNotClosed()")));
        _resolve(1, 3);
        _assertOpen();
    }

    function testUnknownEpisodeAndWordRevertWholeReport() public {
        vm.warp(START);
        (uint256[] memory ids, uint8[] memory outcomes) = _pair(999, 2);
        vm.expectRevert(SaysoMarkets.UnknownEpisode.selector);
        _report(999, ids, outcomes);
        vm.expectRevert(SaysoMarkets.UnknownWord.selector);
        _report(1, ids, outcomes);
        _assertOpen();
    }

    function testForeignWordAndDuplicateWordRevertWholeReport() public {
        _createEpisode(1);
        vm.warp(START);
        (uint256[] memory ids, uint8[] memory outcomes) = _pair(3, 2);
        vm.expectRevert(SaysoMarkets.WordEpisodeMismatch.selector);
        _report(1, ids, outcomes);
        ids[1] = 1;
        vm.expectRevert(SaysoMarkets.WordIsFinal.selector);
        _report(1, ids, outcomes);
        _assertOpen();
    }

    function testInvalidOutcomeAndEarlyNoRevertEarlierValidEntry() public {
        vm.warp(START);
        (uint256[] memory ids, uint8[] memory outcomes) = _pair(2, 4);
        vm.expectRevert(bytes4(keccak256("InvalidOutcome()")));
        _report(1, ids, outcomes);
        outcomes[1] = 3;
        vm.expectRevert(bytes4(keccak256("EpisodeNotClosed()")));
        _report(1, ids, outcomes);
        _assertOpen();
    }

    function testEmptyMismatchedAndMalformedReportsRevert() public {
        uint256[] memory ids = new uint256[](0);
        uint8[] memory outcomes = new uint8[](0);
        vm.expectRevert(bytes4(keccak256("InvalidReportLength()")));
        _report(1, ids, outcomes);
        ids = new uint256[](1);
        ids[0] = 1;
        vm.expectRevert(bytes4(keccak256("InvalidReportLength()")));
        _report(1, ids, outcomes);
        vm.expectRevert();
        forwarder.deliver(address(markets), _metadata(WORKFLOW_ID), hex"1234");
        _assertOpen();
    }
}
