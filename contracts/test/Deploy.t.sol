// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {SaysoMarkets} from "../src/SaysoMarkets.sol";
import {ReceiverTemplate} from "../src/vendor/chainlink/ReceiverTemplate.sol";

contract DeployTest is Test {
    Deploy private deploy;
    address private constant FORWARDER = address(0xF0);
    address private constant OPERATOR = address(0xB07);
    address private constant REPORTER = address(0xC0E);
    bytes32 private constant WORKFLOW = keccak256("approved SAYSO resolver");

    function setUp() public {
        vm.chainId(10143);
        deploy = new Deploy();
        vm.etch(address(0xA0), hex"00");
        vm.etch(address(0xA1), hex"00");
        vm.etch(FORWARDER, hex"00");
        vm.setEnv("AUSD", vm.toString(address(0xA0)));
        vm.setEnv("KURU_ROUTER", vm.toString(address(0xA1)));
        vm.setEnv("OPERATOR_ADDRESS", vm.toString(OPERATOR));
        vm.setEnv("CRE_FORWARDER", vm.toString(FORWARDER));
        vm.setEnv("REPORTER_ADDRESS", vm.toString(REPORTER));
        vm.setEnv("CRE_WORKFLOW_ID", vm.toString(bytes32(0)));
    }

    // Environment cheatcodes mutate process-global values: keep this flow in one test
    // rather than racing parallel tests that use different CRE modes.
    function testDeploymentRequiresAndInstallsModeAuthentication() public {
        vm.setEnv("CRE_MODE", "simulation");
        vm.setEnv("REPORTER_ADDRESS", vm.toString(address(0)));
        vm.expectRevert(bytes4(keccak256("MissingReportOrigin()")));
        deploy.run();

        vm.setEnv("REPORTER_ADDRESS", vm.toString(REPORTER));
        (SaysoMarkets simulation,) = deploy.run();
        assertEq(simulation.reportOrigin(), REPORTER);
        assertEq(simulation.getForwarderAddress(), FORWARDER);

        vm.setEnv("CRE_MODE", "don");
        vm.expectRevert(bytes4(keccak256("MissingWorkflowId()")));
        deploy.run();
        vm.setEnv("CRE_WORKFLOW_ID", vm.toString(WORKFLOW));
        (SaysoMarkets don,) = deploy.run();
        assertEq(don.getExpectedWorkflowId(), WORKFLOW);
        assertEq(don.reportOrigin(), address(0));
        assertEq(don.getForwarderAddress(), FORWARDER);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidWorkflowId.selector, bytes32(0), WORKFLOW));
        vm.prank(FORWARDER);
        don.onReport(abi.encodePacked(bytes32(0), bytes10("resolver"), address(this), bytes2(0)), "");
    }
}
