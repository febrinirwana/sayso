// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script, console2} from "forge-std/Script.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {SaysoMarkets} from "../src/SaysoMarkets.sol";

/// Deploys the OutcomeToken implementation and SaysoMarkets on Monad testnet, then wires roles.
/// Env: AUSD, KURU_ROUTER, OPERATOR_ADDRESS, CRE_MODE (simulation | don),
/// REPORTER_ADDRESS (simulation, nonzero), CRE_WORKFLOW_ID (don, nonzero bytes32),
/// optional CRE_FORWARDER (defaults by mode). Sign with --private-key/--account; the signer owns.
contract Deploy is Script {
    uint256 internal constant MONAD_TESTNET = 10143;
    address internal constant SIMULATION_FORWARDER = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;
    address internal constant PRODUCTION_FORWARDER = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482;

    error WrongChain(uint256 chainId);
    error UnknownCreMode();
    error MissingCode(address target);
    error MissingReportOrigin();
    error MissingWorkflowId();

    function run() external returns (SaysoMarkets markets, OutcomeToken implementation) {
        if (block.chainid != MONAD_TESTNET) revert WrongChain(block.chainid);
        address ausd = vm.envAddress("AUSD");
        address router = vm.envAddress("KURU_ROUTER");
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        bool simulation = _simulationMode();
        address forwarder =
            vm.envOr("CRE_FORWARDER", simulation ? SIMULATION_FORWARDER : PRODUCTION_FORWARDER);
        // Validate authentication before emitting any deployment transaction.
        address reporter;
        bytes32 workflowId;
        if (simulation) {
            reporter = vm.envAddress("REPORTER_ADDRESS");
            if (reporter == address(0)) revert MissingReportOrigin();
        } else {
            workflowId = vm.envOr("CRE_WORKFLOW_ID", bytes32(0));
            if (workflowId == bytes32(0)) revert MissingWorkflowId();
        }
        _requireCode(ausd);
        _requireCode(router);
        _requireCode(forwarder);

        vm.startBroadcast();
        implementation = new OutcomeToken();
        markets = new SaysoMarkets(forwarder, ausd, router, address(implementation));
        if (simulation) markets.setReportOrigin(reporter);
        else markets.setExpectedWorkflowId(workflowId);
        markets.setOperator(operator);
        vm.stopBroadcast();

        console2.log("OutcomeToken implementation", address(implementation));
        console2.log("SaysoMarkets", address(markets));
        console2.log("forwarder", forwarder);
        console2.log("reportOrigin", reporter);
        console2.logBytes32(workflowId);
    }

    function _simulationMode() private view returns (bool) {
        bytes32 mode = keccak256(bytes(vm.envOr("CRE_MODE", string("simulation"))));
        if (mode == keccak256("simulation")) return true;
        if (mode == keccak256("don")) return false;
        revert UnknownCreMode();
    }

    function _requireCode(address target) private view {
        if (target.code.length == 0) revert MissingCode(target);
    }
}
