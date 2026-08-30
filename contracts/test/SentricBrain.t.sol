// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SentricBrain} from "../src/SentricBrain.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/interfaces/SomniaExtensions.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaReactivityPrecompile.sol";
import {ISomniaEventHandler} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaEventHandler.sol";
import {IAgentRequester} from "../src/lib/IAgentRequester.sol";

/// @dev Minimal stand-in for the Somnia reactivity precompile (0x0100):
///      records subscription data and can replay an EpochTick at the handler
///      (from 0x0100's context, so the handler sees msg.sender == precompile).
contract MockPrecompile {
    ISomniaReactivityPrecompile.SubscriptionData private _lastData;
    uint256 public lastSubscriptionId;
    uint256 public lastUnsubscribedId;

    function subscribe(ISomniaReactivityPrecompile.SubscriptionData calldata data)
        external
        returns (uint256 subscriptionId)
    {
        _lastData = data;
        // NOTE: no constructor state here — this code is vm.etch'ed onto 0x0100,
        // so any constructor initializer would never run. Deterministic id = 1.
        lastSubscriptionId = 1;
        return 1;
    }

    function unsubscribe(uint256 subscriptionId) external {
        lastUnsubscribedId = subscriptionId;
    }

    /// @dev Explicit struct getter (a `public` struct field would flatten).
    function lastData()
        external
        view
        returns (ISomniaReactivityPrecompile.SubscriptionData memory)
    {
        return _lastData;
    }

    /// @dev Simulate the chain dispatching an EpochTick to the handler.
    function fireEpochTick(uint64 epochNumber, uint64 blockNumber, address handler) external {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = ISomniaReactivityPrecompile.EpochTick.selector;
        topics[1] = bytes32(uint256(epochNumber));
        topics[2] = bytes32(uint256(blockNumber));
        ISomniaEventHandler(handler).onEvent(
            SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS,
            topics,
            ""
        );
    }
}

contract SentricBrainTest is Test {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000100;

    SentricBrain internal brain;
    MockPrecompile internal precompile;

    function setUp() public {
        // Install the mock precompile's code at the real precompile address.
        vm.etch(PRECOMPILE, type(MockPrecompile).runtimeCode);
        precompile = MockPrecompile(PRECOMPILE);
        brain = new SentricBrain(IAgentRequester(address(0)));
        vm.deal(address(brain), 33 ether);
    }

    // ------------------------------------------------------------------
    // onEvent gating (the "no manual trigger" guarantee)
    // ------------------------------------------------------------------

    function test_onEvent_reverts_when_called_by_non_precompile() public {
        bytes32[] memory topics = new bytes32[](3);
        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        brain.onEvent(PRECOMPILE, topics, "");
    }

    function test_tick_emits_when_called_by_precompile() public {
        vm.expectEmit(true, false, false, true);
        emit SentricBrain.TickObserved(block.number, block.timestamp);
        precompile.fireEpochTick(1, uint64(block.number), address(brain));
    }

    function test_ignores_unrelated_topics() public {
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = bytes32("SOMETHING_ELSE");
        // No TickObserved should be emitted; a vm.expectEmit would fail if one was.
        vm.prank(PRECOMPILE);
        brain.onEvent(PRECOMPILE, topics, "");
    }

    // ------------------------------------------------------------------
    // arm / disarm
    // ------------------------------------------------------------------

    function test_arm_requires_32_stt_reserve() public {
        vm.deal(address(brain), 31 ether);
        vm.expectRevert(SomniaExtensions.InsufficientBalance.selector);
        brain.arm();
    }

    function test_arm_subscribes_to_epoch_tick() public {
        brain.arm();
        assertTrue(brain.isSubscribed(), "not subscribed");
        assertEq(brain.subscriptionId(), 1, "subscription id");

        ISomniaReactivityPrecompile.SubscriptionData memory d = precompile.lastData();
        assertEq(address(d.handlerContractAddress), address(brain), "handler contract");
        assertEq(d.emitter, PRECOMPILE, "emitter filter");
        assertEq(d.eventTopics[0], ISomniaReactivityPrecompile.EpochTick.selector, "topic0");
        assertEq(d.eventTopics[1], bytes32(0), "topic1 must be wildcard");
        assertEq(d.eventTopics[2], bytes32(0), "topic2 must be wildcard");
        assertEq(d.eventTopics[3], bytes32(0), "topic3 must be wildcard");
        assertEq(
            d.handlerFunctionSelector,
            ISomniaEventHandler.onEvent.selector,
            "handler selector"
        );
    }

    function test_arm_twice_reverts() public {
        brain.arm();
        vm.expectRevert(SentricBrain.AlreadySubscribed.selector);
        brain.arm();
    }

    function test_arm_only_owner() public {
        vm.prank(makeAddr("not-owner"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.arm();
    }

    function test_disarm_unsubscribes() public {
        brain.arm();
        brain.disarm();
        assertFalse(brain.isSubscribed(), "still subscribed");
        assertEq(precompile.lastUnsubscribedId(), 1, "unsubscribe called with subscription id");
    }

    function test_disarm_without_arm_reverts() public {
        vm.expectRevert(SentricBrain.NotSubscribed.selector);
        brain.disarm();
    }

    function test_disarm_only_owner() public {
        brain.arm();
        vm.prank(makeAddr("not-owner"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.disarm();
    }
}
