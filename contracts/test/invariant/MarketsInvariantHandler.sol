// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {SaysoMarkets} from "../../src/SaysoMarkets.sol";
import {OutcomeToken} from "../../src/OutcomeToken.sol";
import {MockAUSD} from "../mocks/MockAUSD.sol";
import {MockKuruRouter} from "../mocks/MockKuruRouter.sol";
import {MockOrderBook} from "../mocks/MockOrderBook.sol";
import {MockForwarder} from "../mocks/MockForwarder.sol";

contract MarketsInvariantHandler is Test {
    SaysoMarkets public immutable markets;
    MockForwarder private immutable forwarder;
    MockAUSD private immutable ausd;
    address private constant OPERATOR = address(0xB07);
    address private constant REPORTER = address(0xC0E);
    address private constant ATTACKER = address(0xBAD);
    bytes32 private constant WORKFLOW_ID = keccak256("invariant resolver");
    address[3] private actors = [address(0xA11CE), address(0xB0B), address(0xBA7)];
    mapping(uint256 => uint256) public transitions;
    mapping(uint256 => uint8) public finalState;
    mapping(uint256 => uint256) public resolutionReserve;
    mapping(uint256 => uint256) public payouts;
    uint256[14] public successes;
    bool public unauthorizedAccepted;
    bool public noBeforeClose;
    uint256 public ownerMovement;

    constructor() {
        vm.warp(1_000);
        ausd = new MockAUSD();
        forwarder = new MockForwarder();
        markets = new SaysoMarkets(address(forwarder), address(ausd), address(new MockKuruRouter()), address(new OutcomeToken()));
        markets.setOperator(OPERATOR);
        markets.setReportOrigin(REPORTER);
        markets.setExpectedWorkflowId(WORKFLOW_ID);
        bytes32[] memory words = new bytes32[](8);
        for (uint256 i; i < 8; ++i) words[i] = "moon";
        vm.startPrank(OPERATOR);
        markets.listEpisode(markets.createEpisode("clip", "root A", "root B", 1_010, 1_210, words));
        vm.stopPrank();
        for (uint256 i; i < actors.length; ++i) {
            ausd.mint(actors[i], 1_000_000_000);
            vm.startPrank(actors[i]);
            ausd.approve(address(markets), type(uint256).max);
            for (uint256 id = 1; id <= 8; ++id) markets.mintSet(id, i == 2 ? 50_000_000 : 5_000_003, actors[i]);
            vm.stopPrank();
        }
        vm.startPrank(actors[2]);
        for (uint256 id = 1; id <= 8; ++id) {
            SaysoMarkets.Word memory w = markets.word(id);
            OutcomeToken(w.yes).approve(w.market, type(uint256).max);
            ausd.approve(w.market, type(uint256).max);
            MockOrderBook(w.market).seedAsk(5100, 20_000_000);
            MockOrderBook(w.market).seedBid(5000, 20_000_000);
        }
        vm.stopPrank();
    }

    function _id(uint256 seed) private pure returns (uint256) { return seed % 8 + 1; }
    function _actor(uint256 seed) private view returns (address) { return actors[seed / 8 % 3]; }
    function _call(address actor, bytes memory data, uint256 action) private returns (bool ok) {
        vm.prank(actor);
        (ok,) = address(markets).call(data);
        if (ok) ++successes[action];
    }

    function mintSet(uint256 seed, uint256 amount) external {
        _call(_actor(seed), abi.encodeCall(markets.mintSet, (_id(seed), bound(amount, 1, 2_000_000), _actor(seed))), 0);
    }
    function burnSet(uint256 seed, uint256 amount) external {
        SaysoMarkets.Word memory w = markets.word(_id(seed));
        address actor = _actor(seed);
        uint256 available = min(OutcomeToken(w.yes).balanceOf(actor), OutcomeToken(w.no).balanceOf(actor));
        if (available != 0) _call(actor, abi.encodeCall(markets.burnSet, (_id(seed), bound(amount, 1, available), actor)), 1);
    }
    function buyYes(uint256 seed, uint256 amount) external { _trade(seed, amount, 0); }
    function sellYes(uint256 seed, uint256 amount) external { _trade(seed, amount, 1); }
    function buyNo(uint256 seed, uint256 amount) external { _trade(seed, amount, 2); }
    function sellNo(uint256 seed, uint256 amount) external { _trade(seed, amount, 3); }

    function _trade(uint256 seed, uint256 amount, uint8 side) private {
        uint256 id = _id(seed);
        SaysoMarkets.Word memory w = markets.word(id);
        address actor = _actor(seed);
        uint256 maximum = 2_000_000;
        if (side == 1 || side == 3) maximum = min(maximum, OutcomeToken(side == 1 ? w.yes : w.no).balanceOf(actor));
        if (maximum == 0) return;
        amount = bound(amount, 1, maximum);
        bytes memory data;
        if (side == 0) data = abi.encodeCall(markets.buyYes, (id, amount, 0));
        else if (side == 1) data = abi.encodeCall(markets.sellYes, (id, amount, 0));
        else if (side == 2) data = abi.encodeCall(markets.buyNo, (id, amount, amount));
        else data = abi.encodeCall(markets.sellNo, (id, amount, 0));
        _call(actor, data, side + 2);
    }

    function flagSaid(uint256 seed) external {
        if (vm.getBlockTimestamp() < 1_010) vm.warp(1_010);
        _call(OPERATOR, abi.encodeCall(markets.flagSaid, (_id(seed), uint16(seed), uint16(seed >> 16), uint32(seed))), 6);
    }
    function markEvidence(uint256 seed) external {
        uint256[] memory ids = new uint256[](2);
        ids[0] = _id(seed);
        ids[1] = _id(seed / 8);
        _call(OPERATOR, abi.encodeCall(markets.markEvidence, (uint32(1), ids)), 7);
    }
    function closeEpisode(uint256 seed) external { _close(seed); }
    function _close(uint256 seed) private {
        if (markets.episode(1).closed) return;
        if (vm.getBlockTimestamp() < 1_210) vm.warp(1_210 + seed % 120);
        _call(OPERATOR, abi.encodeCall(markets.closeEpisode, (uint32(1))), 8);
    }

    function _payload(uint256 id, uint8 outcome) private pure returns (bytes memory) {
        uint256[] memory ids = new uint256[](1);
        uint8[] memory outcomes = new uint8[](1);
        ids[0] = id;
        outcomes[0] = outcome;
        return abi.encode(uint32(1), ids, outcomes, bytes32("verified evidence"));
    }
    function _metadata(bytes32 workflow) private view returns (bytes memory) {
        return abi.encodePacked(workflow, bytes10("resolver"), address(this), bytes2(0));
    }
    function _recordFinal(uint256 id, uint256 reserve) private {
        if (transitions[id] == 0) resolutionReserve[id] = reserve;
        ++transitions[id];
        finalState[id] = uint8(markets.word(id).state);
    }

    function report(uint256 seed) external {
        uint256 id = _id(seed);
        uint8 outcome = uint8(2 + (seed / 256 % 2));
        uint256 reserve = markets.word(id).sets;
        if (vm.getBlockTimestamp() < 1_010) vm.warp(1_010);
        bool closed = markets.episode(1).closed;
        bytes memory data = abi.encodeCall(forwarder.deliver, (address(markets), _metadata(WORKFLOW_ID), _payload(id, outcome)));
        vm.prank(REPORTER, REPORTER);
        (bool ok,) = address(forwarder).call(data);
        if (ok) {
            ++successes[9];
            if (outcome == 3 && !closed) noBeforeClose = true;
            _recordFinal(id, reserve);
        }
    }

    function voidWord(uint256 seed) external {
        _close(seed);
        uint256 earliest = uint256(markets.episode(1).closedAt) + 24 hours;
        if (vm.getBlockTimestamp() < earliest) vm.warp(earliest);
        uint256 id = _id(seed);
        uint256 reserve = markets.word(id).sets;
        uint256 heldBefore = ausd.balanceOf(address(markets));
        uint256 ownerBefore = ausd.balanceOf(address(this));
        (bool ok,) = address(markets).call(abi.encodeCall(markets.voidWord, (id)));
        _ownerDelta(ownerBefore, heldBefore);
        if (ok) { ++successes[10]; _recordFinal(id, reserve); }
    }
    function redeem(uint256 seed, uint256 amount) external {
        uint256 id = _id(seed);
        SaysoMarkets.Word memory w = markets.word(id);
        address actor = _actor(seed);
        uint256 available = OutcomeToken(w.state == SaysoMarkets.WordState.No ? w.no : w.yes).balanceOf(actor);
        if (w.state == SaysoMarkets.WordState.Void && available == 0) available = OutcomeToken(w.no).balanceOf(actor);
        if (available == 0) return;
        uint256 beforeAusd = ausd.balanceOf(actor);
        if (_call(actor, abi.encodeCall(markets.redeem, (id, bound(amount, 1, available))), 11)) payouts[id] += ausd.balanceOf(actor) - beforeAusd;
    }

    function forgedReport(uint256 seed) external {
        uint256 id = _id(seed);
        bytes memory payload = _payload(id, 2);
        uint256 mode = seed / 8 % 4;
        bool ok;
        if (mode == 0 || mode == 3) {
            if (mode == 3) markets.setForwarderAddress(address(0));
            vm.prank(ATTACKER, REPORTER);
            (ok,) = address(markets).call(abi.encodeCall(markets.onReport, (_metadata(WORKFLOW_ID), payload)));
            if (mode == 3) markets.setForwarderAddress(address(forwarder));
        } else {
            bytes memory metadata = _metadata(mode == 2 ? bytes32(0) : WORKFLOW_ID);
            vm.prank(ATTACKER, mode == 1 ? ATTACKER : REPORTER);
            (ok,) = address(forwarder).call(abi.encodeCall(forwarder.deliver, (address(markets), metadata, payload)));
        }
        if (ok) unauthorizedAccepted = true;
        else ++successes[12];
    }
    function ownerAction(uint256 seed) external {
        uint256 ownerBefore = ausd.balanceOf(address(this));
        uint256 heldBefore = ausd.balanceOf(address(markets));
        markets.setEpisodesPaused(seed % 2 == 1);
        _ownerDelta(ownerBefore, heldBefore);
        ++successes[13];
    }
    function _ownerDelta(uint256 ownerBefore, uint256 heldBefore) private {
        uint256 ownerAfter = ausd.balanceOf(address(this));
        uint256 heldAfter = ausd.balanceOf(address(markets));
        ownerMovement += ownerAfter >= ownerBefore ? ownerAfter - ownerBefore : ownerBefore - ownerAfter;
        ownerMovement += heldAfter >= heldBefore ? heldAfter - heldBefore : heldBefore - heldAfter;
    }
    function min(uint256 a, uint256 b) private pure returns (uint256) { return a < b ? a : b; }
}
