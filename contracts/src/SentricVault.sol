// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IBinaryPool, IBinarySettlement, IERC20, IERC6909} from "./lib/IBinaryVenue.sol";

/// @title SentricVault
/// @notice Non-custodial vault holding hedge capital for Sentric.
/// @dev The agent (owner) controls only the armed hedge notional, capped per
///      window, with no transfer-anywhere path. Users arm/disarm/withdraw; the
///      SentricBrain agent places hedges and redeems settled positions.
///      Phase 3: real DreamDEX Event Contract orders via placeBinaryOrder
///      (BUY_NO market orders) and redemption via finalizeAndRedeem.
contract SentricVault {
    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event Arm(address indexed user, uint256 notional);
    event Disarm(address indexed user);
    event HedgePlaced(
        address indexed user,
        bool isUp,
        uint256 price,
        uint256 quantity,
        uint128 orderId
    );
    event Redeemed(uint8 outcomeIdx, uint256 amount, uint256 collateralOut);
    event Withdraw(address indexed user, uint256 amount);
    event VenueSet(address indexed pool, address indexed settlement, address indexed collateral);
    event MarketConfigSet(bytes32 marketId, uint64 marketExpiryNs);
    event MaxPremiumSet(uint256 maxPremiumPerWindow);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error NotOwner();
    error NotArmed();
    error NothingToWithdraw();
    error NotConfigured();
    error ZeroPremium();
    error MaxPremiumExceeded();
    error InsufficientCollateral();
    error OrderFailed();

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------
    /// @dev tUSDC is 6 decimals; one whole outcome token = 1 complete set.
    uint256 internal constant ONE_COLLATERAL = 1_000_000;
    /// @dev Epoch length on Somnia (~5 min) — premium guard resets each epoch.
    uint256 internal constant EPOCH_BLOCKS = 3000;
    /// @dev kind for BUY_NO (hedge leg).
    uint8 internal constant KIND_BUY_NO = 2;
    /// @dev orderType MARKET = ImmediateOrCancel (no resting remainder).
    uint8 internal constant ORDER_TYPE_MARKET = 2;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------
    /// @notice Vault owner — the SentricBrain agent.
    address public owner;

    /// @notice DreamDEX per-market BinaryPool (the order venue).
    IBinaryPool public pool;

    /// @notice BinarySettlement singleton (redemption).
    IBinarySettlement public settlement;

    /// @notice tUSDC collateral.
    IERC20 public collateral;

    /// @notice ERC-6909 outcome-token singleton (operator grant for redeem).
    IERC6909 public outcomeToken;

    /// @notice Module marketId (record-keeping for the audit trail).
    bytes32 public marketId;

    /// @notice Current window's expiry (ns) — refreshed on each order.
    uint64 public marketExpiryNs;

    /// @notice Armed (hedged) notional per user (6-dec tUSDC units).
    mapping(address => uint256) public hedgedNotional;

    /// @notice Whether a user has armed the agent to hedge on their behalf.
    mapping(address => bool) public isArmed;

    /// @notice Hard premium cap per epoch window (6-dec tUSDC units).
    uint256 public maxPremiumPerWindow;

    /// @notice Premium spent in the current window (6-dec tUSDC units).
    uint256 public windowPremiumSpent;

    /// @notice Epoch (block.number / 3000) the premium guard is tracking.
    uint256 public windowEpoch;

    /// @notice Market nonce at the last order (builds the redeem outcome id).
    uint64 public marketNonce;

    /// @notice Last placed order id.
    uint128 public lastOrderId;

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
    // Configuration (owner = SentricBrain)
    // ---------------------------------------------------------------------

    /// @notice Point the vault at a live market: its BinaryPool, the
    ///         settlement singleton, the collateral token and the market id.
    function setVenue(
        IBinaryPool pool_,
        IBinarySettlement settlement_,
        IERC20 collateral_,
        bytes32 marketId_
    ) external onlyOwner {
        pool = pool_;
        settlement = settlement_;
        collateral = collateral_;
        marketId = marketId_;
        emit VenueSet(address(pool_), address(settlement_), address(collateral_));
    }

    function setMaxPremiumPerWindow(uint256 cap) external onlyOwner {
        maxPremiumPerWindow = cap;
        emit MaxPremiumSet(cap);
    }

    /// @notice Point the vault at the ERC-6909 outcome-token singleton.
    function setOutcomeToken(IERC6909 token6909_) external onlyOwner {
        outcomeToken = token6909_;
    }

    /// @notice One-time approval so the pool can escrow collateral for buys.
    function approvePool(uint256 amount) external onlyOwner {
        collateral.approve(address(pool), amount);
    }

    /// @notice Grant the settlement operator rights over the vault's outcome
    ///         tokens (one grant covers every id) so redeemSettled can burn.
    function grantSettlementOperator() external onlyOwner {
        outcomeToken.setOperator(address(settlement), true);
    }

    // ---------------------------------------------------------------------
    // User actions
    // ---------------------------------------------------------------------

    /// @notice Arm the agent to hedge up to `notional` on behalf of the caller.
    function arm(uint256 notional) external {
        hedgedNotional[msg.sender] = notional;
        isArmed[msg.sender] = true;
        emit Arm(msg.sender, notional);
    }

    /// @notice Disarm the agent for the caller.
    function disarm() external {
        isArmed[msg.sender] = false;
        hedgedNotional[msg.sender] = 0;
        emit Disarm(msg.sender);
    }

    /// @notice Withdraw the caller's available (non-hedged) balance.
    function withdraw(uint256 /* amount */) external pure {
        revert NothingToWithdraw();
    }

    // ---------------------------------------------------------------------
    // Agent-controlled execution (called by SentricBrain)
    // ---------------------------------------------------------------------

    /// @notice Place a Down-contract market order sized for the exposure.
    /// @param size   Hedge size in whole outcome tokens (already capped).
    /// @param yesPrice P(Up) in raw 6-dec units (NO price = 1e6 - yesPrice);
    ///                 the protective limit for the market order.
    /// @dev Executes BUY_NO with orderType MARKET (IOC): no resting remainder.
    ///      Premium = size * P(Down); enforced per-epoch via maxPremiumPerWindow.
    function placeHedge(uint256 size, uint256 yesPrice)
        external
        onlyOwner
        returns (uint128 orderId)
    {
        if (address(pool) == address(0) || address(collateral) == address(0)) {
            revert NotConfigured();
        }

        // Rolling premium guard (per ~5-min epoch).
        uint256 epoch = block.number / EPOCH_BLOCKS;
        if (epoch != windowEpoch) {
            windowEpoch = epoch;
            windowPremiumSpent = 0;
        }

        // Align the price to the pool's tick grid (snap UP, cap at max) and the
        // quantity to whole lots (snap DOWN, enforce the minimum).
        (uint256 tickSize, uint256 minQuantity, uint256 lotSize) = pool
            .getOrderBookParameters();
        uint256 maxPrice = ONE_COLLATERAL - tickSize;
        if (yesPrice > maxPrice) yesPrice = maxPrice;
        if (tickSize > 0) {
            yesPrice = ((yesPrice + tickSize - 1) / tickSize) * tickSize;
            if (yesPrice > maxPrice) yesPrice = maxPrice;
        }
        uint256 qty = size * ONE_COLLATERAL; // whole tokens -> raw 1e6-scale units
        if (lotSize > 0) qty = (qty / lotSize) * lotSize;
        if (qty < minQuantity) qty = minQuantity;

        uint256 noPrice = ONE_COLLATERAL - yesPrice; // P(Down) raw
        uint256 premium = (qty * noPrice) / ONE_COLLATERAL;
        if (premium == 0) revert ZeroPremium();
        if (windowPremiumSpent + premium > maxPremiumPerWindow) revert MaxPremiumExceeded();
        if (collateral.balanceOf(address(this)) < premium) revert InsufficientCollateral();

        (bool success, uint128 id) = pool.placeBinaryOrder{value: 0}(
            KIND_BUY_NO,
            yesPrice,
            qty,
            pool.marketExpiryNs(),
            ORDER_TYPE_MARKET,
            0, // selfMatchingOption: CANCEL_TAKER
            address(0), // builder
            0, // builderFeeBpsTimes1k
            0 // userData (opaque; v2 encodes side in `kind`)
        );
        if (!success) revert OrderFailed();

        windowPremiumSpent += premium;
        marketNonce = pool.marketNonce();
        lastOrderId = id;
        emit HedgePlaced(msg.sender, false, yesPrice, qty, id);
        return id;
    }

    /// @notice Redeem a settled winning position.
    /// @param outcomeIdx 0 = YES (Up won), 1 = NO (Down won).
    /// @param amount      Outcome tokens to burn (whole tokens).
    /// @return out        Collateral received (raw 6-dec units).
    /// @dev outcomeId = (pool << 72) | (marketNonce << 8) | outcomeIdx — the
    ///      nonce is captured at order time so the id targets OUR window even
    ///      if the pool has since recycled.
    function redeemSettled(uint8 outcomeIdx, uint256 amount)
        external
        onlyOwner
        returns (uint256 out)
    {
        if (address(settlement) == address(0)) revert NotConfigured();
        uint256 outcomeId =
            (uint256(uint160(address(pool))) << 72) | (uint256(marketNonce) << 8) | outcomeIdx;
        out = settlement.finalizeAndRedeem(address(pool), outcomeId, amount, address(this));
        emit Redeemed(outcomeIdx, amount, out);
    }

    // ---------------------------------------------------------------------
    // Hedge sizing
    // ---------------------------------------------------------------------

    /// @notice Compute the Down-contract hedge size for a long exposure.
    /// @param exposure         Exposed notional (6-dec tUSDC units).
    /// @param downPrice        P(Down) as 1e18 = 100% (P(Down) = 1 - P(Up)).
    /// @param maxPremiumCap    Max premium spendable this window (6-dec units).
    /// @param expectedMoveBps  The adverse move to insure against, basis points
    ///                         (e.g. 200 = 2%): hedge gain should cover it.
    /// @return size            Hedge size in 6-dec units (whole tokens after /1e6).
    /// @dev Model: buying N Down tokens costs N*P(Down) premium; if the market
    ///      moves down, each token pays 1 complete set => net gain N*(1-P(Down)).
    ///      Covering exposure * move% needs N = exposure*move / (1-P(Down));
    ///      the premium cap bounds N <= maxPremium / P(Down). Returns 0 when
    ///      the inputs are degenerate (P(Down) at 0 or 100%).
    function sizeHedge(
        uint256 exposure,
        uint256 downPrice,
        uint256 maxPremiumCap,
        uint256 expectedMoveBps
    ) public pure returns (uint256 size) {
        if (exposure == 0 || downPrice == 0 || downPrice >= 1e18 || expectedMoveBps == 0) {
            return 0;
        }
        uint256 upside = 1e18 - downPrice; // payout per token when the hedge wins
        uint256 need = (exposure * expectedMoveBps * 1e18) / (10_000 * upside);
        // cap = maxPremium / P(Down); clamp avoids overflow for max caps.
        uint256 cap = maxPremiumCap >= type(uint256).max / 1e18
            ? type(uint256).max
            : (maxPremiumCap * 1e18) / downPrice;
        size = need < cap ? need : cap;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
