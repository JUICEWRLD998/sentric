// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/interfaces/SomniaExtensions.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaReactivityPrecompile.sol";

/// @title SentricBrain
/// @notice The reactive "brain" of Sentric — Phase 1: prove the self-waking loop.
/// @dev Extends the official SomniaEventHandler. The reactivity precompile
///      (0x0100) calls onEvent() via a synthetic tx in the same block whenever
///      a subscribed system event fires; the base contract gates msg.sender to
///      0x0100, so nobody can trigger side effects manually. Phase 1 subscribes
///      to EpochTick and emits TickObserved — no keeper, no server.
///      Phase 2 will add the JSON-API -> LLM decision cycle, Phase 3 the venue
///      order placement.
contract SentricBrain is SomniaEventHandler {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Async agent-call state machine (advanced by Phase 2 callbacks).
    ///         Idle -> Fetching -> Deciding -> (Idle | hedge placement).
    enum State {
        Idle, // no cycle in flight
        Fetching, // JSON-API price/vol request outstanding
        Deciding // LLM inference request outstanding
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Emitted every time a subscribed system tick wakes the contract.
    event TickObserved(uint256 indexed blockNumber, uint256 timestamp);

    /// @notice Emitted when the guardian is armed (subscription created).
    event Armed(address indexed owner, uint256 subscriptionId);

    /// @notice Emitted when the guardian is disarmed (subscription cancelled).
    event Disarmed(address indexed owner, uint256 subscriptionId);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotOwner();
    error AlreadySubscribed();
    error NotSubscribed();

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @dev Contract deployer; only they can arm/disarm the reactivity loop.
    address public immutable owner;

    /// @dev Reactivity subscription id (0 until armed).
    uint256 public subscriptionId;

    /// @dev Whether the EpochTick subscription is live.
    bool public isSubscribed;

    /// @dev Async decision-cycle state (Phase 2).
    State public state = State.Idle;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() {
        owner = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ---------------------------------------------------------------------
    // Reactivity lifecycle
    // ---------------------------------------------------------------------

    /// @notice Arm the guardian: subscribe to the EpochTick system event so the
    ///         chain self-wakes this contract at every epoch boundary — no keeper.
    /// @dev Payable so one tx can both fund the >= 32 STT gas reserve required
    ///      by the precompile (checked inside SomniaExtensions._subscribe as
    ///      address(this).balance) and create the subscription.
    function arm() external payable onlyOwner {
        if (isSubscribed) revert AlreadySubscribed();

        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions
            .SubscriptionFilter({
                eventTopics: [
                    ISomniaReactivityPrecompile.EpochTick.selector,
                    bytes32(0),
                    bytes32(0),
                    bytes32(0)
                ],
                origin: address(0),
                emitter: SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
            });

        subscriptionId = SomniaExtensions.subscribe(
            address(this),
            filter,
            SomniaExtensions.defaultSubscriptionOptions()
        );
        isSubscribed = true;
        emit Armed(owner, subscriptionId);
    }

    /// @notice Disarm the guardian: cancel the reactivity subscription.
    /// @dev Safety rail — stops all future callbacks (and their gas costs).
    function disarm() external onlyOwner {
        if (!isSubscribed) revert NotSubscribed();
        SomniaExtensions.unsubscribe(subscriptionId);
        isSubscribed = false;
        emit Disarmed(owner, subscriptionId);
    }

    // ---------------------------------------------------------------------
    // Reactivity callback (precompile 0x0100 calls onEvent -> _onEvent)
    // ---------------------------------------------------------------------

    /// @inheritdoc SomniaEventHandler
    function _onEvent(
        address,
        bytes32[] calldata eventTopics,
        bytes calldata
    ) internal override {
        // Only react to the system event we subscribed to.
        if (
            eventTopics.length != 0 &&
            eventTopics[0] == ISomniaReactivityPrecompile.EpochTick.selector
        ) {
            emit TickObserved(block.number, block.timestamp);
            // TODO(Phase 2): run the decision cycle:
            //   state = State.Fetching; agentPlatform.createRequest(...) ->
            //   handleResponse -> State.Deciding -> handleResponse -> hedge.
        }
    }

    /// @notice Accept pushed agent rebates (request finalisation) + gas top-ups.
    receive() external payable {}
}
