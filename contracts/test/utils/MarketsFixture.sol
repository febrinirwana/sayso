// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {SaysoMarkets} from "../../src/SaysoMarkets.sol";
import {OutcomeToken} from "../../src/OutcomeToken.sol";
import {MockAUSD} from "../mocks/MockAUSD.sol";
import {MockKuruRouter} from "../mocks/MockKuruRouter.sol";

abstract contract MarketsFixture is Test {
    SaysoMarkets internal markets;
    MockAUSD internal ausd;
    MockKuruRouter internal router;
    OutcomeToken internal tokenImpl;
    address internal constant OPERATOR = address(0x0B07);
    address internal constant PLAYER = address(0xA11CE);
    address internal constant FORWARDER = address(0xF00D);
    bytes32 internal constant CLIP = keccak256("test clip");
    bytes32 internal constant ROOT_A = keccak256("engine A");
    bytes32 internal constant ROOT_B = keccak256("engine B");
    uint64 internal constant START = 1_100;
    uint64 internal constant END = 1_300;

    function setUp() public virtual {
        vm.warp(1_000);
        ausd = new MockAUSD();
        router = new MockKuruRouter();
        tokenImpl = new OutcomeToken();
        markets = new SaysoMarkets(FORWARDER, address(ausd), address(router), address(tokenImpl));
        markets.setOperator(OPERATOR);
    }

    function _texts(uint256 count) internal pure returns (bytes32[] memory texts) {
        texts = new bytes32[](count);
        for (uint256 i; i < count; ++i) texts[i] = bytes32("moon");
    }

    function _createEpisode(uint256 count) internal returns (uint32) {
        bytes32[] memory texts = _texts(count);
        vm.prank(OPERATOR);
        return markets.createEpisode(CLIP, ROOT_A, ROOT_B, START, END, texts);
    }

    function _listEpisode(uint32 episodeId) internal {
        vm.prank(OPERATOR);
        markets.listEpisode(episodeId);
    }
}
