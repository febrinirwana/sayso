// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ReportFixture} from "./utils/ReportFixture.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SetCaller} from "./utils/SetCaller.sol";

interface ISetActions {
    function mintSet(uint256 wordId, uint256 amount, address to) external;
    function mintSetWithPermit(uint256 wordId, uint256 amount, address to, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
    function burnSet(uint256 wordId, uint256 amount, address to) external;
}

contract SaysoMarketsSetsTest is ReportFixture {
    ISetActions private actions;
    event SetMinted(uint256 indexed wordId, address indexed payer, address indexed account, uint256 amount);
    event SetBurned(uint256 indexed wordId, address indexed account, address indexed recipient, uint256 amount);

    function setUp() public override {
        super.setUp();
        _listEpisode(_createEpisode(2));
        actions = ISetActions(address(markets));
        ausd.mint(PLAYER, 20_000_000);
        vm.prank(PLAYER);
        ausd.approve(address(markets), type(uint256).max);
    }

    function _mint(uint256 id, uint256 amount, address to) private {
        vm.prank(PLAYER);
        actions.mintSet(id, amount, to);
    }

    function _assertSets(uint256 id, uint256 amount) private view {
        assertEq(markets.word(id).sets, amount);
        assertEq(OutcomeToken(markets.word(id).yes).totalSupply(), amount);
        assertEq(OutcomeToken(markets.word(id).no).totalSupply(), amount);
    }

    function testMintFundsRecipientAndAccountsCollateralAcrossWords() public {
        vm.expectEmit(true, true, true, true, address(markets));
        emit SetMinted(1, PLAYER, OPERATOR, 3_000_000);
        _mint(1, 3_000_000, OPERATOR);
        _mint(2, 2_000_000, PLAYER);
        _assertSets(1, 3_000_000);
        _assertSets(2, 2_000_000);
        assertEq(OutcomeToken(markets.word(1).yes).balanceOf(OPERATOR), 3_000_000);
        assertEq(OutcomeToken(markets.word(1).no).balanceOf(OPERATOR), 3_000_000);
        assertEq(ausd.balanceOf(PLAYER), 15_000_000);
        assertEq(ausd.balanceOf(address(markets)), 5_000_000);
        assertEq(markets.totalSets(), 5_000_000);
    }

    function testBurnPaysChosenRecipientWithoutOutcomeApprovals() public {
        _mint(1, 3_000_000, PLAYER);
        vm.expectEmit(true, true, true, true, address(markets));
        emit SetBurned(1, PLAYER, OPERATOR, 1_000_000);
        vm.prank(PLAYER);
        actions.burnSet(1, 1_000_000, OPERATOR);
        _assertSets(1, 2_000_000);
        assertEq(ausd.balanceOf(OPERATOR), 1_000_000);
        assertEq(ausd.balanceOf(address(markets)), 2_000_000);
        assertEq(markets.totalSets(), 2_000_000);
    }

    function testMissingNoRollsBackYesBurnAndCollateral() public {
        _mint(1, 3_000_000, PLAYER);
        OutcomeToken no = OutcomeToken(markets.word(1).no);
        vm.prank(PLAYER);
        no.transfer(OPERATOR, 2_000_000);
        vm.prank(PLAYER);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, PLAYER, 1_000_000, 2_000_000));
        actions.burnSet(1, 2_000_000, PLAYER);
        _assertSets(1, 3_000_000);
        assertEq(OutcomeToken(markets.word(1).yes).balanceOf(PLAYER), 3_000_000);
        assertEq(markets.totalSets(), 3_000_000);
        assertEq(ausd.balanceOf(address(markets)), 3_000_000);
    }

    function testNonHolderCannotBurnSomeoneElsesCollateral() public {
        _mint(1, 3_000_000, PLAYER);
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, OPERATOR, 0, 1_000_000));
        actions.burnSet(1, 1_000_000, OPERATOR);
        _assertSets(1, 3_000_000);
    }

    function testMintRequiresListing() public {
        _createEpisode(1);
        vm.prank(PLAYER);
        vm.expectRevert(bytes4(keccak256("EpisodeNotListed()")));
        actions.mintSet(3, 1_000_000, PLAYER);
        assertEq(markets.totalSets(), 0);
    }

    function testMintCannotCreateUnbackedSupply() public {
        vm.prank(PLAYER);
        ausd.approve(address(markets), 0);
        vm.prank(PLAYER);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(markets), 0, 1_000_000));
        actions.mintSet(1, 1_000_000, PLAYER);
        _assertSets(1, 0);
        assertEq(markets.totalSets(), 0);
    }

    function testZeroRecipientRollsBackCollateralPull() public {
        vm.prank(PLAYER);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        actions.mintSet(1, 1_000_000, address(0));
        assertEq(ausd.balanceOf(PLAYER), 20_000_000);
        _assertSets(1, 0);
        assertEq(markets.totalSets(), 0);
    }

    function _permit(uint256 key, uint256 amount, uint256 deadline) private view returns (uint8 v, bytes32 r, bytes32 s) {
        address signer = vm.addr(key);
        bytes32 structHash = keccak256(abi.encode(keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"), signer, address(markets), amount, ausd.nonces(signer), deadline));
        return vm.sign(key, keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash)));
    }

    function testPermitMintsWithRealSignatureAndNoPriorApproval() public {
        address signer = vm.addr(123);
        ausd.mint(signer, 2_000_000);
        (uint8 v, bytes32 r, bytes32 s) = _permit(123, 2_000_000, 2_000);
        vm.prank(signer);
        actions.mintSetWithPermit(1, 2_000_000, signer, 2_000, v, r, s);
        _assertSets(1, 2_000_000);
        assertEq(ausd.nonces(signer), 1);
        assertEq(ausd.allowance(signer, address(markets)), 0);
        assertEq(ausd.balanceOf(signer), 0);
        assertEq(markets.totalSets(), 2_000_000);
    }

    function testFrontRunPermitStillMintsUsingEstablishedAllowance() public {
        address signer = vm.addr(123);
        ausd.mint(signer, 2_000_000);
        (uint8 v, bytes32 r, bytes32 s) = _permit(123, 2_000_000, 2_000);
        vm.prank(OPERATOR);
        ausd.permit(signer, address(markets), 2_000_000, 2_000, v, r, s);
        vm.prank(signer);
        actions.mintSetWithPermit(1, 2_000_000, signer, 2_000, v, r, s);
        _assertSets(1, 2_000_000);
        assertEq(ausd.nonces(signer), 1);
        assertEq(ausd.balanceOf(address(markets)), 2_000_000);
    }

    function testInvalidPermitCannotMintWithoutAllowance() public {
        address signer = vm.addr(123);
        ausd.mint(signer, 2_000_000);
        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(markets), 0, 2_000_000));
        actions.mintSetWithPermit(1, 2_000_000, signer, 2_000, 0, bytes32(0), bytes32(0));
        _assertSets(1, 0);
        assertEq(ausd.balanceOf(signer), 2_000_000);
    }

    function testContractPayerGiftMintIdentifiesEconomicPartiesNotOrigin() public {
        SetCaller caller = new SetCaller(markets);
        ausd.mint(address(caller), 3_000_000);
        vm.expectEmit(true, true, true, true, address(markets));
        emit SetMinted(1, address(caller), OPERATOR, 3_000_000);
        vm.prank(PLAYER, PLAYER);
        caller.mint(1, 3_000_000, OPERATOR);
        assertEq(ausd.balanceOf(address(caller)), 0);
        assertEq(ausd.balanceOf(PLAYER), 20_000_000);
        assertEq(ausd.balanceOf(OPERATOR), 0);
        assertEq(ausd.balanceOf(address(markets)), 3_000_000);
        assertEq(OutcomeToken(markets.word(1).yes).balanceOf(OPERATOR), 3_000_000);
        assertEq(OutcomeToken(markets.word(1).no).balanceOf(OPERATOR), 3_000_000);
        _assertSets(1, 3_000_000);
    }

    function testContractHolderDirectedBurnIdentifiesRecipientNotOrigin() public {
        SetCaller caller = new SetCaller(markets);
        _mint(1, 3_000_000, address(caller));
        vm.expectEmit(true, true, true, true, address(markets));
        emit SetBurned(1, address(caller), OPERATOR, 1_000_000);
        vm.prank(PLAYER, PLAYER);
        caller.burn(1, 1_000_000, OPERATOR);
        assertEq(ausd.balanceOf(OPERATOR), 1_000_000);
        assertEq(ausd.balanceOf(address(caller)), 0);
        assertEq(ausd.balanceOf(PLAYER), 17_000_000);
        assertEq(ausd.balanceOf(address(markets)), 2_000_000);
        assertEq(OutcomeToken(markets.word(1).yes).balanceOf(address(caller)), 2_000_000);
        assertEq(OutcomeToken(markets.word(1).no).balanceOf(address(caller)), 2_000_000);
        _assertSets(1, 2_000_000);
    }

    function testGiftedTransferredWinnerPaysCurrentHolderNotPayerOrOrigin() public {
        SetCaller caller = new SetCaller(markets);
        ausd.mint(address(caller), 3_000_000);
        vm.prank(PLAYER, PLAYER);
        caller.mint(1, 3_000_000, OPERATOR);
        OutcomeToken yes = OutcomeToken(markets.word(1).yes);
        vm.prank(OPERATOR);
        yes.transfer(PLAYER, 1_000_000);
        vm.warp(START);
        _resolve(1, 2);
        vm.prank(PLAYER, address(0xCAFE));
        markets.redeem(1, 1_000_000);
        assertEq(ausd.balanceOf(PLAYER), 21_000_000);
        assertEq(ausd.balanceOf(address(caller)), 0);
        assertEq(ausd.balanceOf(OPERATOR), 0);
        assertEq(ausd.balanceOf(address(0xCAFE)), 0);
        assertEq(yes.balanceOf(PLAYER), 0);
        assertEq(yes.balanceOf(OPERATOR), 2_000_000);
        assertEq(yes.totalSupply(), 2_000_000);
        assertEq(ausd.balanceOf(address(markets)), 2_000_000);
        assertEq(markets.word(1).sets, 2_000_000);
    }
}
