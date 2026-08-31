// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice DreamDEX Event Contracts venue interfaces (verified Aug 2026 from
///         the markets-sdk v0.28.1 source — see docs/network-facts.md §6).
/// @dev Binary orders go to the per-market BinaryPool (NOT the module — the
///      generic OrderBook placeOrder reverts UseBinaryPlacement). Prices are
///      ALWAYS the YES-side price in raw collateral units (tUSDC 6-dec:
///      1_000_000 = 1 USDC = P(Up)=100%). kind: 0=BUY_YES 1=SELL_YES
///      2=BUY_NO 3=SELL_NO. orderType: 0=LIMIT 1=FOK 2=MARKET(IOC)
///      3=POST_ONLY. selfMatchingOption: 0=CANCEL_TAKER 1=CANCEL_MAKER.

interface IBinaryPool {
    function placeBinaryOrder(
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k,
        uint64 userData
    ) external payable returns (bool success, uint128 id);

    function cancelOrder(uint128 orderId) external;

    /// @dev (tickSize, minQuantity, lotSize) — raw units; prices must be tick
    ///      multiples, quantities whole lots >= minQuantity.
    function getOrderBookParameters()
        external
        view
        returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize);

    /// @dev Current window's absolute expiry (nanoseconds).
    function marketExpiryNs() external view returns (uint64);

    /// @dev Market generation counter (1 fresh, ++ on recycle) — needed to
    ///      build the outcome id for redemption.
    function marketNonce() external view returns (uint64);

    function market() external view returns (address);
}

/// @notice BinaryMarket lifecycle reads — used by the brain to auto-redeem
///         settled positions (isResolved / payoutNumerators verified live).
interface IBinaryMarket {
    function isResolved() external view returns (bool);

    function payoutNumerators() external view returns (uint256[] memory);
}

/// @notice BinarySettlement singleton — direct redemption route (no operator
///         grants needed). outcomeId = (uint160(pool) << 72) | (nonce << 8) | idx
///         (idx 0 = YES, 1 = NO).
interface IBinarySettlement {
    function finalizeAndRedeem(address pool, uint256 outcomeId, uint256 amount, address to)
        external
        returns (uint256 collateralOut);

    function redeem(uint256 outcomeId, uint256 amount, address to)
        external
        returns (uint256 collateralOut);

    function finalize(address pool) external returns (uint256 marketKey);
}

/// @notice Minimal ERC-20 (tUSDC).
interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice ERC-6909 singleton operator grant (needed so the settlement can
///         burn the vault's outcome tokens on redeem).
interface IERC6909 {
    function setOperator(address operator, bool approved) external;
}
