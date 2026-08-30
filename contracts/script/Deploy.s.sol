// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {SentricVault} from "../src/SentricVault.sol";
import {SentricBrain} from "../src/SentricBrain.sol";
import {IVenue} from "../src/lib/IVenue.sol";
import {IAgentPlatform} from "../src/lib/IAgentPlatform.sol";

/// @notice Deploy SentricVault and SentricBrain.
/// TODO(Phase 0/1): read deployer key + platform/venue addresses from env
/// (`vm.envAddress`), then transfer vault ownership to the brain and subscribe
/// the brain via reactivity (fund with >= 32 SOMI for gas).
contract Deploy is Script {
    function run() external returns (SentricVault vault, SentricBrain brain) {
        vm.startBroadcast();

        // TODO(Phase 0): real addresses from env; zero-address stubs for now.
        vault = new SentricVault(IVenue(address(0)));
        brain = new SentricBrain(IAgentPlatform(address(0)), IVenue(address(0)));

        vm.stopBroadcast();
    }
}
