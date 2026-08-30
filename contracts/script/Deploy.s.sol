// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {SentricBrain} from "../src/SentricBrain.sol";
import {IAgentRequester} from "../src/lib/IAgentRequester.sol";

/// @notice Phase 2 deploy: SentricBrain (reactivity + on-chain AI cycle) +
///         config (agentIds, JSON fetch params) + arm.
/// @dev Funds the brain with 33 STT (>= 32 precompile reserve + callback gas)
///      and subscribes atomically via payable arm(). Reads config from env
///      (AGENT_PLATFORM_ADDRESS, AGENT_JSON_API_ID, AGENT_LLM_ID, JSON_URL,
///      JSON_SELECTOR, JSON_DECIMALS) — see repo .env.example.
///      NOTE: on this testnet RPC, deploy via scripts/deploy-brain.js (viem)
///      instead; forge script --broadcast fails with -32602.
contract Deploy is Script {
    function run() external returns (SentricBrain brain) {
        address platform = vm.envOr(
            "AGENT_PLATFORM_ADDRESS",
            0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
        );
        uint256 jsonId = vm.envUint("AGENT_JSON_API_ID");
        uint256 llmId = vm.envUint("AGENT_LLM_ID");
        string memory url = vm.envString("JSON_URL");
        string memory selector = vm.envString("JSON_SELECTOR");
        uint8 decimals = uint8(vm.envUint("JSON_DECIMALS"));

        vm.startBroadcast();
        brain = new SentricBrain(IAgentRequester(platform));
        brain.setAgentIds(jsonId, llmId);
        brain.setJsonParams(url, selector, decimals);
        brain.arm{value: 33 ether}();
        vm.stopBroadcast();

        console2.log("SentricBrain deployed at:", address(brain));
        console2.log("Subscription id:", brain.subscriptionId());
        console2.log("Armed:", brain.isSubscribed());
        console2.log("cycleEnabled:", brain.cycleEnabled());
    }
}
