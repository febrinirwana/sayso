// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SaysoMarkets} from "../../src/SaysoMarkets.sol";
import {MarketsInvariantHandler} from "./MarketsInvariantHandler.sol";

contract SaysoMarketsInvariantTest is Test {
    MarketsInvariantHandler private handler;
    SaysoMarkets private markets;

    struct PlayerBalances {
        uint256 yes;
        uint256 no;
        uint256 ausd;
        uint256 yesSupply;
        uint256 noSupply;
    }

    function _playerBalances(uint256 wordId) private view returns (PlayerBalances memory b) {
        SaysoMarkets.Word memory w = markets.word(wordId);
        address player = address(0xA11CE);
        b.yes = IERC20(w.yes).balanceOf(player);
        b.no = IERC20(w.no).balanceOf(player);
        b.ausd = markets.AUSD().balanceOf(player);
        b.yesSupply = IERC20(w.yes).totalSupply();
        b.noSupply = IERC20(w.no).totalSupply();
    }

    function _assertRedemption(uint256 wordId, uint256 amount, bool burnsYes, uint256 payout) private {
        PlayerBalances memory before = _playerBalances(wordId);
        uint256 successesBefore = handler.successes(11);
        handler.redeem(wordId - 1, amount); // These words all belong to the first player.
        PlayerBalances memory result = _playerBalances(wordId);
        assertEq(result.ausd - before.ausd, payout);
        assertEq(before.yes - result.yes, burnsYes ? amount : 0);
        assertEq(before.no - result.no, burnsYes ? 0 : amount);
        assertEq(before.yesSupply - result.yesSupply, burnsYes ? amount : 0);
        assertEq(before.noSupply - result.noSupply, burnsYes ? 0 : amount);
        assertEq(handler.successes(11), successesBefore + 1);
    }

    function setUp() public {
        handler = new MarketsInvariantHandler();
        markets = handler.markets();
        bytes4[] memory selectors = new bytes4[](14);
        selectors[0] = handler.mintSet.selector;
        selectors[1] = handler.burnSet.selector;
        selectors[2] = handler.buyYes.selector;
        selectors[3] = handler.sellYes.selector;
        selectors[4] = handler.buyNo.selector;
        selectors[5] = handler.sellNo.selector;
        selectors[6] = handler.flagSaid.selector;
        selectors[7] = handler.markEvidence.selector;
        selectors[8] = handler.closeEpisode.selector;
        selectors[9] = handler.report.selector;
        selectors[10] = handler.voidWord.selector;
        selectors[11] = handler.redeem.selector;
        selectors[12] = handler.forgedReport.selector;
        selectors[13] = handler.ownerAction.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector(address(handler), selectors));
    }

    function invariant_marketSafety() public view {
        uint256 reserveSum;
        uint256 finalCount;
        for (uint256 id = 1; id <= 8; ++id) {
            SaysoMarkets.Word memory w = markets.word(id);
            uint256 yesSupply = IERC20(w.yes).totalSupply();
            uint256 noSupply = IERC20(w.no).totalSupply();
            if (w.state == SaysoMarkets.WordState.Open || w.state == SaysoMarkets.WordState.SaidPending) {
                // §5.1: complete sets always have equal, backed supplies.
                assertEq(yesSupply, w.sets);
                assertEq(noSupply, w.sets);
                assertEq(handler.transitions(id), 0);
            } else {
                ++finalCount;
                // §5.3: final state is immutable and was entered only once.
                assertEq(handler.transitions(id), 1);
                assertEq(uint8(w.state), handler.finalState(id));
                // §5.6: measured payouts never exceed collateral at resolution.
                assertLe(handler.payouts(id), handler.resolutionReserve(id));
                if (w.state == SaysoMarkets.WordState.Yes) assertEq(w.sets, yesSupply);
                else if (w.state == SaysoMarkets.WordState.No) assertEq(w.sets, noSupply);
                else assertEq(w.sets, yesSupply / 2 + noSupply / 2);
            }
            reserveSum += w.sets;
        }
        // §5.2: aggregate accounting and held collateral agree through every action.
        assertEq(markets.totalSets(), reserveSum);
        assertGe(markets.AUSD().balanceOf(address(markets)), reserveSum);
        assertEq(markets.episode(1).resolvedCount, finalCount);
        // §5.4, §5.5, §5.7: provenance, explicit close, and no administrative transfers.
        assertFalse(handler.unauthorizedAccepted());
        assertFalse(handler.noBeforeClose());
        assertEq(handler.ownerMovement(), 0);
        assertEq(markets.AUSD().balanceOf(address(handler)), 0);
    }

    function afterInvariant() public {
        emit log_named_uint("last sequence reports accepted", handler.successes(9));
        emit log_named_uint("last sequence voids accepted", handler.successes(10));
        emit log_named_uint("last sequence redemptions paid/burned", handler.successes(11));
        emit log_named_uint("last sequence forgeries rejected", handler.successes(12));
    }

    function testHandlerEpisodeThroughTradesReportsVoidAndOddRedemptions() public {
        handler.mintSet(0, 3);
        handler.burnSet(0, 1);
        PlayerBalances memory before = _playerBalances(1);
        handler.buyYes(0, 1_000_037);
        PlayerBalances memory result = _playerBalances(1);
        assertEq(result.yes - before.yes, 1_960_784);
        assertEq(before.ausd - result.ausd, 1_000_000); // Includes the input refund.
        assertEq(result.no, before.no);
        assertEq(handler.successes(2), 1);
        before = result;
        handler.sellYes(0, 1_000_000);
        result = _playerBalances(1);
        assertEq(before.yes - result.yes, 1_000_000);
        assertEq(result.ausd - before.ausd, 500_000);
        assertEq(result.no, before.no);
        assertEq(handler.successes(3), 1);
        before = result;
        handler.buyNo(0, 1_000_001);
        result = _playerBalances(1);
        assertEq(result.no - before.no, 1_000_001);
        assertEq(before.ausd - result.ausd, 500_001);
        assertEq(result.yes, before.yes);
        assertEq(result.yesSupply - before.yesSupply, 1_000_001);
        assertEq(result.noSupply - before.noSupply, 1_000_001);
        assertEq(handler.successes(4), 1);
        before = result;
        handler.sellNo(0, 1_000_001);
        result = _playerBalances(1);
        assertEq(before.no - result.no, 1_000_001);
        assertEq(result.ausd - before.ausd, 489_901);
        assertEq(result.yes - before.yes, 195); // Measured YES rounding dust.
        assertEq(before.yesSupply - result.yesSupply, 1_000_001);
        assertEq(before.noSupply - result.noSupply, 1_000_001);
        assertEq(handler.successes(5), 1);
        handler.flagSaid(0);
        handler.markEvidence(0);
        handler.forgedReport(0);
        handler.forgedReport(8);
        handler.forgedReport(16);
        handler.forgedReport(24);
        handler.ownerAction(1);
        handler.report(0); // YES before close.
        _assertRedemption(1, 3, true, 3);
        handler.closeEpisode(0);
        handler.report(257); // NO after close.
        _assertRedemption(2, 5, false, 5);
        handler.voidWord(2);
        _assertRedemption(3, 5_000_003, true, 2_500_001);
        _assertRedemption(3, 5_000_003, false, 2_500_001);
        invariant_marketSafety();
        assertEq(uint8(markets.word(1).state), uint8(SaysoMarkets.WordState.Yes));
        assertEq(uint8(markets.word(2).state), uint8(SaysoMarkets.WordState.No));
        assertEq(uint8(markets.word(3).state), uint8(SaysoMarkets.WordState.Void));
        assertEq(handler.successes(9), 2);
        assertEq(handler.successes(10), 1);
        assertEq(handler.successes(11), 4);
        assertEq(handler.successes(12), 4);
        for (uint256 i; i < 14; ++i) emit log_named_uint("successful action / rejected forgery", handler.successes(i));
    }
}
