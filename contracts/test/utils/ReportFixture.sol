// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {MarketsFixture} from "./MarketsFixture.sol";
import {MockForwarder} from "../mocks/MockForwarder.sol";

abstract contract ReportFixture is MarketsFixture {
    MockForwarder internal forwarder;
    bytes32 internal constant WORKFLOW_ID = keccak256("test resolver");
    bytes32 internal constant EVIDENCE = keccak256("verified leaves");

    function setUp() public virtual override {
        super.setUp();
        forwarder = new MockForwarder();
        markets.setForwarderAddress(address(forwarder));
    }

    function _metadata(bytes32 workflowId) internal view returns (bytes memory) {
        // Production-sized metadata: ID, name, owner and two padding bytes.
        return abi.encodePacked(workflowId, bytes10("resolver"), address(this), bytes2(0));
    }

    function _report(uint32 episodeId, uint256[] memory ids, uint8[] memory outcomes) internal {
        forwarder.deliver(address(markets), _metadata(WORKFLOW_ID), abi.encode(episodeId, ids, outcomes, EVIDENCE));
    }

    function _resolve(uint256 wordId, uint8 outcome) internal {
        uint256[] memory ids = new uint256[](1);
        uint8[] memory outcomes = new uint8[](1);
        ids[0] = wordId;
        outcomes[0] = outcome;
        _report(1, ids, outcomes);
    }

    function _close() internal {
        vm.warp(END);
        vm.prank(OPERATOR);
        markets.closeEpisode(1);
    }
}
