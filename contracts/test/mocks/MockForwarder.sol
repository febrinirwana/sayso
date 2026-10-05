// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IReceiver} from "../../src/vendor/chainlink/IReceiver.sol";

contract MockForwarder {
    function deliver(address receiver, bytes calldata metadata, bytes calldata report) external {
        IReceiver(receiver).onReport(metadata, report);
    }
}
