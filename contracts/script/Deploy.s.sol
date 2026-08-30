// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {SentricBrain} from "../src/SentricBrain.sol";

/// @notice Phase 1 deploy: SentricBrain + arm (self-scheduling EpochTick
///         subscription on Somnia reactivity).
/// @dev Funds the brain with 33 STT (>= 32 required by the precompile; the
///      extra covers callback gas) and subscribes atomically via payable arm().
///      Reads SOMNIA_RPC_URL + DEPLOYER_PRIVATE_KEY from the repo .env.
contract Deploy is Script {
    function run() external returns (SentricBrain brain) {
        vm.startBroadcast();

        brain = new SentricBrain();
        brain.arm{value: 33 ether}();

        vm.stopBroadcast();

        console2.log("SentricBrain deployed at:", address(brain));
        console2.log("Subscription id:", brain.subscriptionId());
        console2.log("Armed:", brain.isSubscribed());
    }
}
