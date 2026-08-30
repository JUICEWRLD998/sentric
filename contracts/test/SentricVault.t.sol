// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SentricVault} from "../src/SentricVault.sol";
import {SentricBrain} from "../src/SentricBrain.sol";
import {IVenue} from "../src/lib/IVenue.sol";
import {IAgentPlatform} from "../src/lib/IAgentPlatform.sol";

contract SentricVaultTest is Test {
    SentricVault internal vault;
    SentricBrain internal brain;

    function setUp() public {
        vault = new SentricVault(IVenue(address(0)));
        brain = new SentricBrain(IAgentPlatform(address(0)), IVenue(address(0)));
    }

    /// @dev The trivial passing test: deploy, arm, assert state changed.
    function test_arm_sets_hedged_notional() public {
        uint256 notional = 1 ether;
        vault.arm(notional);

        assertEq(vault.hedgedNotional(address(this)), notional, "notional not recorded");
        assertTrue(vault.isArmed(address(this)), "user not armed");
    }

    function test_disarm_clears_state() public {
        vault.arm(1 ether);
        vault.disarm();

        assertEq(vault.hedgedNotional(address(this)), 0, "notional not cleared");
        assertFalse(vault.isArmed(address(this)), "user still armed");
    }

    function test_brain_initial_state_is_idle() public {
        assertEq(
            uint256(brain.state()),
            uint256(SentricBrain.State.Idle),
            "brain should start Idle"
        );
    }

    function test_arm_emits_event() public {
        uint256 notional = 2 ether;
        vm.expectEmit(true, false, false, false);
        emit SentricVault.Arm(address(this), notional);
        vault.arm(notional);
    }
}
