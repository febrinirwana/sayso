// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KuruTrade} from "../src/KuruTrade.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {MockKuruRouter} from "./mocks/MockKuruRouter.sol";
import {IKuruOrderBook} from "../src/interfaces/IKuruOrderBook.sol";

interface ITradeHarness {
    function deploy(address router, address base, address quote) external returns (address);
    function buy(address market, address base, address quote, uint256 amount, uint256 minimum) external returns (uint256, uint256);
    function sell(address market, address base, address quote, uint256 amount, uint256 minimum) external returns (uint256, uint256);
    function quote(address market, uint256 wanted) external view returns (uint256);
    function buyExact(address market, address base, address quote, uint256 wanted, uint256 maximum) external returns (uint256, uint256);
}
interface IMintToken is IERC20 { function mint(address to, uint256 amount) external; }
interface ISeedBook {
    function seedAsk(uint32 price, uint96 size) external;
    function seedBid(uint32 price, uint96 size) external;
}

contract KuruTradeTest is Test {
    IMintToken base;
    IMintToken quoteToken;
    ITradeHarness trader;
    address market;

    function setUp() public {
        base = IMintToken(address(new MockAUSD()));
        quoteToken = IMintToken(address(new MockAUSD()));
        trader = ITradeHarness(address(new KuruTradeHarness()));
        market = trader.deploy(address(new MockKuruRouter()), address(base), address(quoteToken));
        base.mint(address(this), 100e6);
        quoteToken.mint(address(this), 100e6);
        base.approve(market, type(uint256).max);
        quoteToken.approve(market, type(uint256).max);
        quoteToken.mint(address(trader), 20e6);
    }

    function test_deployedBookUsesSixDecimalFeeFreeParameters() public view {
        (uint32 pricePrecision, uint96 sizePrecision, address baseAsset, uint256 baseDecimals,
            address quoteAsset, uint256 quoteDecimals, uint32 tickSize, uint96 minSize,
            uint96 maxSize, uint256 takerFee, uint256 makerFee) = IKuruOrderBook(market).getMarketParams();
        assertEq(pricePrecision, 1e4);
        assertEq(sizePrecision, 1e6);
        assertEq(baseAsset, address(base));
        assertEq(baseDecimals, 6);
        assertEq(quoteAsset, address(quoteToken));
        assertEq(quoteDecimals, 6);
        assertEq(tickSize, 100);
        assertEq(minSize, 1e6);
        assertEq(maxSize, 1e10);
        assertEq(takerFee, 0);
        assertEq(makerFee, 0);
    }

    function test_sellPartialFillLeavesUnsoldBase() public {
        ISeedBook(market).seedBid(5000, 2e6);
        base.mint(address(trader), 5e6);
        (uint256 received, uint256 sold) = trader.sell(market, address(base), address(quoteToken), 5e6, 0);
        assertEq(received, 1e6);
        assertEq(sold, 2e6);
        assertEq(base.balanceOf(address(trader)), 3e6);
    }

    function test_shortWalletRevertsBeforePartialFill() public {
        ISeedBook(market).seedAsk(5100, 2e6);
        vm.expectRevert(bytes4(keccak256("TransferFromFailed()")));
        trader.buy(market, address(base), address(quoteToken), 20e6 + 100, 0);
        assertEq(base.balanceOf(address(trader)), 0);
        assertEq(quoteToken.balanceOf(address(trader)), 20e6);
    }

    function test_buyFloorsInputAndPaysWallet() public {
        ISeedBook(market).seedAsk(5100, 10e6);
        (uint256 received, uint256 spent) = trader.buy(market, address(base), address(quoteToken), 5e6 + 99, 0);
        assertEq(received, 9_803_921);
        assertEq(spent, 5e6);
        assertEq(base.balanceOf(address(trader)), received);
        assertEq(quoteToken.balanceOf(address(trader)), 15e6);
        assertEq(base.allowance(address(trader), market), type(uint256).max);
        assertEq(quoteToken.allowance(address(trader), market), type(uint256).max);
    }

    function test_buyWalksTwoLevels() public {
        ISeedBook(market).seedAsk(5100, 10e6);
        ISeedBook(market).seedAsk(5200, 10e6);
        (uint256 received, uint256 spent) = trader.buy(market, address(base), address(quoteToken), 8e6, 0);
        assertEq(received, 15_576_923);
        assertEq(spent, 8e6);
    }

    function test_thinBookLeavesUnspentInput() public {
        ISeedBook(market).seedAsk(5100, 2e6);
        (uint256 received, uint256 spent) = trader.buy(market, address(base), address(quoteToken), 5e6, 0);
        assertEq(received, 2e6);
        assertEq(spent, 1_020_000);
        assertEq(quoteToken.balanceOf(address(trader)), 18_980_000);
    }

    function test_sellRoundsProceedsDown() public {
        ISeedBook(market).seedBid(5000, 10e6);
        base.mint(address(trader), 9_803_921);
        (uint256 received, uint256 sold) = trader.sell(market, address(base), address(quoteToken), 9_803_921, 0);
        assertEq(received, 4_901_900);
        assertEq(sold, 9_803_921);
        assertEq(base.balanceOf(address(trader)), 0);
        assertEq(quoteToken.balanceOf(address(trader)), 24_901_900);
    }

    function test_buySlippageRollsBackBalances() public {
        ISeedBook(market).seedAsk(5100, 10e6);
        vm.expectRevert(bytes4(keccak256("SlippageExceeded()")));
        trader.buy(market, address(base), address(quoteToken), 5e6, 9_803_922);
        assertEq(base.balanceOf(address(trader)), 0);
        assertEq(quoteToken.balanceOf(address(trader)), 20e6);
    }

    function test_sellSlippageRollsBackBalances() public {
        ISeedBook(market).seedBid(5000, 10e6);
        base.mint(address(trader), 9_803_921);
        vm.expectRevert(bytes4(keccak256("SlippageExceeded()")));
        trader.sell(market, address(base), address(quoteToken), 9_803_921, 4_901_901);
        assertEq(base.balanceOf(address(trader)), 9_803_921);
    }

    function test_exactBuyEnforcesMaximum() public {
        ISeedBook(market).seedAsk(5100, 10e6);
        vm.expectRevert(bytes4(keccak256("SlippageExceeded()")));
        trader.buyExact(market, address(base), address(quoteToken), 1e6, 509_999);
    }

    function test_quoteRejectsInsufficientAsks() public {
        ISeedBook(market).seedAsk(5100, 2e6);
        vm.expectRevert(bytes4(keccak256("InsufficientLiquidity()")));
        trader.quote(market, 2e6 + 1);
    }

    function test_zeroAndSubQuoteUnitAreNoOpsUnlessMinimumPositive() public {
        (uint256 received, uint256 spent) = trader.buy(market, address(base), address(quoteToken), 99, 0);
        assertEq(received, 0);
        assertEq(spent, 0);
        (received, spent) = trader.sell(market, address(base), address(quoteToken), 0, 0);
        assertEq(received, 0);
        assertEq(spent, 0);
        assertEq(trader.quote(market, 0), 0);
        (received, spent) = trader.buyExact(market, address(base), address(quoteToken), 0, 0);
        assertEq(received, 0);
        assertEq(spent, 0);
        vm.expectRevert(bytes4(keccak256("SlippageExceeded()")));
        trader.buy(market, address(base), address(quoteToken), 0, 1);
        vm.expectRevert(bytes4(keccak256("SlippageExceeded()")));
        trader.sell(market, address(base), address(quoteToken), 0, 1);
    }

    function testFuzz_exactBuyCoversWantedWithBoundedDust(uint32 tick, uint96 firstSize, uint96 wanted) public {
        uint32 price = uint32(bound(tick, 1, 98)) * 100;
        firstSize = uint96(bound(firstSize, 1e6, 10e6));
        wanted = uint96(bound(wanted, 1, uint256(firstSize) + 10e6));
        ISeedBook(market).seedAsk(price, firstSize);
        ISeedBook(market).seedAsk(price + 100, 10e6);
        ISeedBook(market).seedBid(100, 1e6);
        uint256 budget = trader.quote(market, wanted);
        assertEq(budget % 100, 0);
        (uint256 received, uint256 spent) = trader.buyExact(market, address(base), address(quoteToken), wanted, budget);
        assertGe(received, wanted);
        // At most one quote unit of overpayment per visited level, converted at the lowest price.
        assertLt(received - wanted, 2 * (1e6 / price + 1));
        assertLe(spent, budget);
        assertEq(base.balanceOf(address(trader)), received);
        assertEq(quoteToken.balanceOf(address(trader)) + spent, 20e6);
    }
}

contract KuruTradeHarness is ITradeHarness {
    function deploy(address router, address base, address quoteAsset) external returns (address) {
        return KuruTrade.deployMarket(router, base, quoteAsset);
    }
    function buy(address market, address base, address quoteAsset, uint256 amount, uint256 minimum)
        external returns (uint256, uint256)
    {
        return KuruTrade.marketBuy(market, base, quoteAsset, amount, minimum);
    }
    function sell(address market, address base, address quoteAsset, uint256 amount, uint256 minimum)
        external returns (uint256, uint256)
    {
        return KuruTrade.marketSell(market, base, quoteAsset, amount, minimum);
    }
    function quote(address market, uint256 wanted) external view returns (uint256) {
        return KuruTrade.quoteForExactBase(market, wanted);
    }
    function buyExact(address market, address base, address quoteAsset, uint256 wanted, uint256 maximum)
        external returns (uint256, uint256)
    {
        return KuruTrade.buyExactBase(market, base, quoteAsset, wanted, maximum);
    }
}
