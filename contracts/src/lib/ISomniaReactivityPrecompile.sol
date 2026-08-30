// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title ISomniaReactivityPrecompile
/// @notice Stub of the Somnia on-chain reactivity precompile at address 0x0100.
/// @dev A contract subscribes via `SomniaExtensions.subscribe(address(this),
///      filter, options)`. When an event/system-event matches the filter,
///      validators include a synthetic transaction in the same block that calls
///      the handler. System events (BlockTick, EpochTick, Schedule) are
///      fabricated 0x100 logs at block end — this is how Sentric self-schedules
///      with no keeper. The subscription owner pays gas (fund >= 32 SOMI).
///
///      TODO(Phase 1): confirm the exact ABI from the Somnia
///      `reactivity-contracts` npm package before coding.
interface ISomniaReactivityPrecompile {
    /// @notice Subscribe a contract (or an owner) to an event filter.
    /// TODO(Phase 1): confirm exact signature + options encoding.
    function subscribe(
        address handler,
        bytes calldata filter,
        bytes calldata options
    ) external returns (bytes32 subscriptionId);

    /// @notice Unsubscribe an existing subscription.
    /// TODO(Phase 1): confirm exact signature.
    function unsubscribe(bytes32 subscriptionId) external returns (bool);

    /// @notice Get info about an existing subscription.
    /// TODO(Phase 1): confirm exact return type.
    function getSubscriptionInfo(bytes32 subscriptionId)
        external
        view
        returns (bytes memory info);
}

/// @dev The fixed reactivity precompile address.
library ReactivityPrecompile {
    address internal constant ADDRESS = 0x0000000000000000000000000000000000000100;
}
