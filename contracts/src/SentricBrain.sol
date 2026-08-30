// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAgentPlatform} from "./lib/IAgentPlatform.sol";
import {IVenue} from "./lib/IVenue.sol";

/// @title SentricBrain
/// @notice The reactive "brain" of Sentric: self-wakes via Somnia on-chain
///         reactivity, fetches price/vol (JSON-API agent), decides (on-chain
///         LLM agent), and places hedges on the DreamDEX Event Contracts venue.
/// @dev This skeleton intentionally does NOT import the Somnia
///      `reactivity-contracts` npm package yet; it exposes a plain
///      `onEvent`-style entrypoint that the real `SomniaEventHandler._onEvent`
///      override will route into during Phase 1.
contract SentricBrain {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Async agent-call state machine.
    ///         Idle -> Fetching -> Deciding -> (Idle | hedge placement).
    enum State {
        Idle, // no cycle in flight
        Fetching, // JSON-API price/vol request outstanding
        Deciding // LLM inference request outstanding
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event TickObserved(uint256 indexed blockNumber, uint256 timestamp);

    /// @notice Consensus-verified audit receipt for a completed decision cycle.
    /// @param inputsHash Keccak of the exact inputs the agent saw (price, vol,
    ///                   exposure, window) — reconstructable on-chain.
    /// @param decision   Constrained model output: HEDGE / STAND-DOWN / HOLD.
    /// @param confidence Model confidence 0..100 (0.81 -> 81).
    /// @param asset      Asset being hedged (BTC / ETH).
    event AuditEvent(
        bytes32 inputsHash,
        string decision,
        uint8 confidence,
        address indexed asset
    );

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------
    /// @dev The Somnia Agents platform (JSON-API + LLM inference).
    IAgentPlatform public agentPlatform;

    /// @dev The DreamDEX Event Contracts venue.
    IVenue public venue;

    /// @dev Current async decision-cycle state.
    State public state = State.Idle;

    /// @dev Correlation id of the in-flight agent request (0 = none).
    uint256 public pendingRequestId;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------
    constructor(IAgentPlatform agentPlatform_, IVenue venue_) {
        agentPlatform = agentPlatform_;
        venue = venue_;
    }

    // ---------------------------------------------------------------------
    // Reactivity entrypoint
    // ---------------------------------------------------------------------

    /// @notice Reactivity handler. The precompile (0x0100) calls this via a
    ///         synthetic transaction in the same block when a subscribed system
    ///         event (BlockTick / EpochTick) fires.
    /// @dev Inside the real handler, `msg.sender` is the reactivity precompile
    ///      (0x0100) and `tx.origin` is the subscription owner.
    ///      TODO(Phase 1): gate on `msg.sender == 0x0100` and subscribe via
    ///      `SomniaExtensions.subscribe(...)`; avoid emitting an event that
    ///      re-triggers this subscription (recursion guard).
    function onEvent(bytes calldata /* data */) external {
        emit TickObserved(block.number, block.timestamp);
        // TODO(Phase 2): run the decision cycle:
        //   state = Fetching; pendingRequestId = agentPlatform.requestJsonApi(...);
        //   ... async callback -> handleResponse -> requestLlm -> handleResponse.
    }

    // ---------------------------------------------------------------------
    // Async agent callback
    // ---------------------------------------------------------------------

    /// @notice Callback invoked by the Agent platform with a request result.
    /// @dev Anyone can call this — MUST validate `msg.sender == address(agentPlatform)`
    ///      (TODO Phase 2), and handle Success / Failed / TimedOut.
    function handleResponse(uint256 /* requestId */, bytes calldata /* response */) external {
        // TODO(Phase 2): advance the state machine (Fetching -> Deciding ->
        // Idle), then on HEDGE call vault.placeHedge(...) and emit
        // AuditEvent(inputsHash, decision, confidence, asset).
    }

    // ---------------------------------------------------------------------
    // Decision helpers (stubs)
    // ---------------------------------------------------------------------

    /// @notice Emit an audit receipt for a completed decision cycle.
    /// TODO(Phase 2): call this with the real inputsHash + decision + confidence.
    function emitAudit(
        bytes32 inputsHash,
        string calldata decision,
        uint8 confidence,
        address asset
    ) external {
        emit AuditEvent(inputsHash, decision, confidence, asset);
    }
}
