// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IVenue} from "./lib/IVenue.sol";

/// @title SentricVault
/// @notice Non-custodial vault holding hedge capital for Sentric.
/// @dev The agent controls only the armed hedge notional, capped per window,
///      with no transfer-anywhere path. Users arm/disarm/withdraw; the
///      SentricBrain agent places hedges and redeems settled positions.
contract SentricVault {
    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event Arm(address indexed user, uint256 notional);
    event Disarm(address indexed user);
    event HedgePlaced(
        address indexed user,
        string asset,
        bool isUp,
        uint256 price,
        uint256 quantity
    );
    event Withdraw(address indexed user, uint256 amount);
    event VenueSet(address indexed venue);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error NotOwner();
    error NotArmed();
    error NothingToWithdraw();

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------
    /// @notice Vault owner — the SentricBrain agent (or deployer during scaffold).
    address public owner;

    /// @notice DreamDEX Event Contracts venue.
    IVenue public venue;

    /// @notice Armed (hedged) notional per user, in the vault's accounting unit
    ///         (e.g. USDso). Caps the agent's per-window hedge for that user.
    mapping(address => uint256) public hedgedNotional;

    /// @notice Whether a user has armed the agent to hedge on their behalf.
    mapping(address => bool) public isArmed;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------
    constructor(IVenue venue_) {
        owner = msg.sender;
        venue = venue_;
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ---------------------------------------------------------------------
    // User actions
    // ---------------------------------------------------------------------

    /// @notice Arm the agent to hedge up to `notional` on behalf of the caller.
    /// TODO(Phase 4): require a deposit / escrow of premium, enforce the
    /// per-window premium cap, and gate on live on-chain market status
    /// (`onchain.status === 1` means Trading).
    function arm(uint256 notional) external {
        hedgedNotional[msg.sender] = notional;
        isArmed[msg.sender] = true;
        emit Arm(msg.sender, notional);
    }

    /// @notice Disarm the agent for the caller.
    /// TODO(Phase 1): also unsubscribe the caller's reactivity subscription and
    /// cancel any outstanding agent requests.
    function disarm() external {
        isArmed[msg.sender] = false;
        hedgedNotional[msg.sender] = 0;
        emit Disarm(msg.sender);
    }

    /// @notice Withdraw the caller's available (non-hedged) balance.
    /// TODO(Phase 4): implement real custody accounting and a non-custodial
    /// withdrawal against a deposited balance; skeleton currently reverts.
    function withdraw(uint256 /* amount */) external pure {
        revert NothingToWithdraw();
    }

    // ---------------------------------------------------------------------
    // Agent-controlled execution (called by SentricBrain)
    // ---------------------------------------------------------------------

    /// @notice Place a hedge order on the DreamDEX Event Contracts venue.
    ///         Only the owner (the SentricBrain agent) may call this.
    /// TODO(Phase 3): confirm the exact venue placeOrder signature against the
    /// deployed ABI, add nonReentrant, and enforce max-premium-per-window.
    function placeHedge(
        address user,
        string calldata asset,
        bool isUp,
        uint256 price,
        uint256 quantity
    ) external onlyOwner returns (bytes32 orderId) {
        if (!isArmed[user]) revert NotArmed();
        // TODO(Phase 3): build real userData, expireTimestampNs, orderType,
        // selfMatchingOption, builder, extra from the venue's confirmed ABI.
        orderId = venue.placeOrder(
            true, // isBid — buying the hedge leg
            0, // userData (TODO)
            price, // price = P(Up) in (0,1) ticks
            quantity, // quantity = hedge size
            0, // expireTimestampNs (TODO: IOC-like short expiry)
            0, // orderType (TODO)
            0, // selfMatchingOption (TODO)
            address(this), // builder
            0 // extra (TODO)
        );
        emit HedgePlaced(user, asset, isUp, price, quantity);
    }

    /// @notice Redeem a settled winning position.
    /// TODO(Phase 3): implement redeem-on-settle using the venue's redeem ABI.
    function redeem(bytes32 /* orderId */) external pure returns (bool) {
        return false; // TODO(Phase 3): real redeem
    }

    // ---------------------------------------------------------------------
    // Hedge sizing helper (stub)
    // ---------------------------------------------------------------------

    /// @notice Compute hedge size from exposure and current Up/Down probability.
    /// TODO(Phase 3): implement the real sizing function — size = f(exposure,
    /// P(Up/Down)) with capped loss per window (max loss = premium).
    /// @param exposure       The user's exposed notional.
    /// @param downPrice      Probability of the Down leg, P(Down) = 1 - P(Up).
    /// @param maxPremiumCap  The maximum premium spendable this window.
    /// @return size          The hedge quantity (placeholder formula).
    function sizeHedge(
        uint256 exposure,
        uint256 downPrice,
        uint256 maxPremiumCap
    ) public pure returns (uint256 size) {
        // TODO(Phase 3): real sizing formula — size = f(exposure, P(Up/Down))
        // with capped loss per window (max loss = premium). This placeholder
        // scales exposure by the Down probability and caps at maxPremiumCap.
        size = (exposure * downPrice) / 1e18; // TODO: correct tick scaling
        if (size > maxPremiumCap) size = maxPremiumCap;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------
    function setVenue(IVenue venue_) external onlyOwner {
        venue = venue_;
        emit VenueSet(address(venue_));
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
