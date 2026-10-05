// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IKuruOrderBook} from "../../src/interfaces/IKuruOrderBook.sol";
import {KuruTradeHarness} from "../KuruTrade.t.sol";
import {MockAUSD} from "../mocks/MockAUSD.sol";
import {MockKuruRouter} from "../mocks/MockKuruRouter.sol";
import {MockOrderBook} from "../mocks/MockOrderBook.sol";

interface IKuruMakerBook {
    function addBuyOrder(uint32 price, uint96 size, bool postOnly) external;
    function addSellOrder(uint32 price, uint96 size, bool postOnly) external;
}
interface IKuruMargin {
    function deposit(address user, address token, uint256 amount) external payable;
    function getBalance(address user, address token) external view returns (uint256);
}

contract KuruTradeForkTest is Test {
    address constant ROUTER = 0x7EFbE105Ca7415dE98F96622173458ac1c054630;
    IKuruMargin constant MARGIN = IKuruMargin(0xd029C2D98ff85D8F64799017fE00a59B1159CE02);
    address constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    address constant FAUCET = 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C;

    struct Scene {
        MockAUSD base;
        IERC20 quote;
        KuruTradeHarness trader;
        address book;
    }

    function setUp() public {
        if (!vm.envOr("MONAD_FORK", false)) { vm.skip(true); return; }
        vm.createSelectFork("monad_testnet");
        console2.log("fork block", block.number);
    }

    function _scene(bool realBook, bool realQuote) private returns (Scene memory s) {
        s.base = new MockAUSD();
        s.quote = realQuote ? IERC20(AUSD) : IERC20(address(new MockAUSD()));
        s.trader = new KuruTradeHarness();
        uint256 beforeGas = gasleft();
        s.book = s.trader.deploy(realBook ? ROUTER : address(new MockKuruRouter()), address(s.base), address(s.quote));
        if (realBook) console2.log("deployMarket gas", beforeGas - gasleft());
        s.base.mint(address(this), 100e6);
        if (realQuote) {
            vm.prank(address(this), address(this));
            (bool funded,) = FAUCET.call(abi.encodeWithSignature("requestFunds(address)", address(this)));
            assertTrue(funded, "fork faucet funding failed");
            s.quote.transfer(address(s.trader), 20e6);
        } else {
            MockAUSD(address(s.quote)).mint(address(this), 100e6);
            MockAUSD(address(s.quote)).mint(address(s.trader), 20e6);
        }
        if (realBook) {
            s.base.approve(address(MARGIN), type(uint256).max);
            s.quote.approve(address(MARGIN), type(uint256).max);
            MARGIN.deposit(address(this), address(s.base), 100e6);
            MARGIN.deposit(address(this), address(s.quote), 100e6);
        } else {
            s.base.approve(s.book, type(uint256).max);
            s.quote.approve(s.book, type(uint256).max);
        }
    }

    function _ask(Scene memory s, bool realBook, uint32 price, uint96 size) private {
        if (realBook) IKuruMakerBook(s.book).addSellOrder(price, size, true);
        else MockOrderBook(s.book).seedAsk(price, size);
    }

    function _bid(Scene memory s, bool realBook, uint32 price, uint96 size) private {
        if (realBook) IKuruMakerBook(s.book).addBuyOrder(price, size, true);
        else MockOrderBook(s.book).seedBid(price, size);
    }

    function _buy(Scene memory s, uint256 amount) private returns (uint256 out, uint256 spent) {
        uint256 beforeGas = gasleft();
        (out, spent) = s.trader.buy(s.book, address(s.base), address(s.quote), amount, 0);
        console2.log("marketBuy gas", beforeGas - gasleft());
        console2.log("baseOut", out, "quoteSpent", spent);
    }

    function _wallets(Scene memory s, uint256 out, uint256 spent) private view {
        assertEq(s.base.balanceOf(address(s.trader)), out);
        assertEq(s.quote.balanceOf(address(s.trader)), 20e6 - spent);
        assertEq(MARGIN.getBalance(address(s.trader), address(s.base)), 0);
        assertEq(MARGIN.getBalance(address(s.trader), address(s.quote)), 0);
        assertEq(s.base.allowance(address(s.trader), address(MARGIN)), 0);
        assertEq(s.quote.allowance(address(s.trader), address(MARGIN)), 0);
    }

    function test_singleLevelBuyMatchesMock() public {
        Scene memory real = _scene(true, false);
        Scene memory mock = _scene(false, false);
        _ask(real, true, 5100, 10e6);
        _ask(mock, false, 5100, 10e6);
        (uint256 out, uint256 spent) = _buy(real, 5e6 + 99);
        (uint256 mockOut, uint256 mockSpent) = _buy(mock, 5e6 + 99);
        assertEq(out, 9_803_921);
        assertEq(spent, 5e6);
        assertEq(out, mockOut);
        assertEq(spent, mockSpent);
        _wallets(real, out, spent);
    }

    function test_twoLevelBuyAndL2MatchMock() public {
        Scene memory real = _scene(true, false);
        Scene memory mock = _scene(false, false);
        _bid(real, true, 4900, 10e6);
        _bid(mock, false, 4900, 10e6);
        _ask(real, true, 5100, 10e6);
        _ask(mock, false, 5100, 10e6);
        _ask(real, true, 5200, 10e6);
        _ask(mock, false, 5200, 10e6);
        bytes memory payload = IKuruOrderBook(real.book).getL2Book();
        assertEq(payload, IKuruOrderBook(mock.book).getL2Book());
        assertEq(payload, abi.encode(block.number, uint256(4900), uint256(10e6), uint256(0),
            uint256(5100), uint256(10e6), uint256(5200), uint256(10e6)));
        (uint256 bid, uint256 ask) = IKuruOrderBook(real.book).bestBidAsk();
        assertEq(bid, 0.49e18);
        assertEq(ask, 0.51e18);
        (uint256 out, uint256 spent) = _buy(real, 8e6);
        (uint256 mockOut, uint256 mockSpent) = _buy(mock, 8e6);
        assertEq(out, 15_576_730);
        assertEq(spent, 8e6);
        assertEq(out, mockOut);
        assertEq(spent, mockSpent);
        _wallets(real, out, spent);
    }

    function test_twoLevelFractionalSizeRoundingMatchesMock() public {
        Scene memory real = _scene(true, false);
        Scene memory mock = _scene(false, false);
        _ask(real, true, 5100, 10e6 + 37);
        _ask(mock, false, 5100, 10e6 + 37);
        _ask(real, true, 5200, 10e6);
        _ask(mock, false, 5200, 10e6);
        (uint256 out, uint256 spent) = _buy(real, 8e6);
        (uint256 mockOut, uint256 mockSpent) = _buy(mock, 8e6);
        assertEq(out, mockOut);
        assertEq(spent, mockSpent);
        _wallets(real, out, spent);
    }

    function test_thinBookRefundMatchesMock() public {
        Scene memory real = _scene(true, false);
        Scene memory mock = _scene(false, false);
        _ask(real, true, 5100, 2e6);
        _ask(mock, false, 5100, 2e6);
        (uint256 out, uint256 spent) = _buy(real, 5e6);
        (uint256 mockOut, uint256 mockSpent) = _buy(mock, 5e6);
        assertEq(out, 2e6);
        assertEq(spent, 1_020_100);
        assertEq(out, mockOut);
        assertEq(spent, mockSpent);
        _wallets(real, out, spent);
    }

    function test_sellRoundingMatchesMock() public {
        Scene memory real = _scene(true, false);
        Scene memory mock = _scene(false, false);
        _bid(real, true, 5000, 10e6);
        _bid(mock, false, 5000, 10e6);
        real.base.mint(address(real.trader), 9_803_921);
        mock.base.mint(address(mock.trader), 9_803_921);
        uint256 beforeGas = gasleft();
        (uint256 out, uint256 sold) = real.trader.sell(real.book, address(real.base), address(real.quote), 9_803_921, 0);
        console2.log("marketSell gas", beforeGas - gasleft());
        (uint256 mockOut, uint256 mockSold) = mock.trader.sell(mock.book, address(mock.base), address(mock.quote), 9_803_921, 0);
        assertEq(out, 4_901_900);
        assertEq(sold, 9_803_921);
        assertEq(out, mockOut);
        assertEq(sold, mockSold);
        assertEq(real.base.balanceOf(address(real.trader)), 0);
        assertEq(real.quote.balanceOf(address(real.trader)), 24_901_900);
    }

    function test_sellPartialFillMatchesMock() public {
        Scene memory real = _scene(true, false);
        Scene memory mock = _scene(false, false);
        _bid(real, true, 5000, 2e6);
        _bid(mock, false, 5000, 2e6);
        real.base.mint(address(real.trader), 5e6);
        mock.base.mint(address(mock.trader), 5e6);
        (uint256 out, uint256 sold) = real.trader.sell(real.book, address(real.base), address(real.quote), 5e6, 0);
        (uint256 mockOut, uint256 mockSold) = mock.trader.sell(mock.book, address(mock.base), address(mock.quote), 5e6, 0);
        assertEq(out, 1e6);
        assertEq(sold, 2e6);
        assertEq(out, mockOut);
        assertEq(sold, mockSold);
        assertEq(real.base.balanceOf(address(real.trader)), 3e6);
        assertEq(real.quote.balanceOf(address(real.trader)), 21e6);
    }

    function test_exactWholeLevelBuyMatchesMock() public {
        Scene memory real = _scene(true, false);
        Scene memory mock = _scene(false, false);
        _ask(real, true, 5100, 10e6);
        _ask(mock, false, 5100, 10e6);
        (uint256 out, uint256 spent) = real.trader.buyExact(real.book, address(real.base), address(real.quote), 10e6, 5_100_100);
        (uint256 mockOut, uint256 mockSpent) = mock.trader.buyExact(mock.book, address(mock.base), address(mock.quote), 10e6, 5_100_100);
        assertEq(out, 10e6);
        assertEq(spent, 5_100_100);
        assertEq(out, mockOut);
        assertEq(spent, mockSpent);
        _wallets(real, out, spent);
    }

    function test_exactBaseTwoLevelBuyMatchesMock() public {
        Scene memory real = _scene(true, false);
        Scene memory mock = _scene(false, false);
        _ask(real, true, 5100, 10e6);
        _ask(mock, false, 5100, 10e6);
        _ask(real, true, 5200, 10e6);
        _ask(mock, false, 5200, 10e6);
        uint256 wanted = 15e6 + 1;
        uint256 budget = real.trader.quote(real.book, wanted);
        assertEq(budget, mock.trader.quote(mock.book, wanted));
        uint256 beforeGas = gasleft();
        (uint256 out, uint256 spent) = real.trader.buyExact(real.book, address(real.base), address(real.quote), wanted, budget);
        console2.log("buyExactBase gas", beforeGas - gasleft());
        console2.log("baseOut", out, "quoteSpent", spent);
        (uint256 mockOut, uint256 mockSpent) = mock.trader.buyExact(mock.book, address(mock.base), address(mock.quote), wanted, budget);
        assertGe(out, wanted);
        assertEq(out, 15_000_192);
        assertEq(spent, 7_700_200);
        assertLt(out - wanted, 2 * (uint256(1e6) / 5100 + 1));
        assertEq(out, mockOut);
        assertEq(spent, mockSpent);
        _wallets(real, out, spent);
    }

    function test_realAusdQuoteMatchesMockQuote() public {
        Scene memory real = _scene(true, true);
        Scene memory mock = _scene(false, false);
        _ask(real, true, 5100, 10e6);
        _ask(mock, false, 5100, 10e6);
        (uint256 out, uint256 spent) = _buy(real, 5e6);
        (uint256 mockOut, uint256 mockSpent) = _buy(mock, 5e6);
        assertEq(out, 9_803_921);
        assertEq(spent, 5e6);
        assertEq(out, mockOut);
        assertEq(spent, mockSpent);
        _wallets(real, out, spent);
    }
}
