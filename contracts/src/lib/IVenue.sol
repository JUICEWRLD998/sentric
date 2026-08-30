// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IVenue
/// @notice DreamDEX Event Contracts venue interface (stub).
/// @dev The real, known `placeOrder` signature from the June 2026 bot-kit notes:
///
///      ```
///      placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity,
///                 uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption,
///                 address builder, uint96 extra) external returns (bytes32)
///      ```
///
///      TODO(Phase 3): confirm the exact signature against the deployed venue ABI
///      before coding — the final `uint96` argument is truncated in the notes
///      ("uint96 bu..."), and old `placeTakerOrderWithoutVault` was removed.
interface IVenue {
    /// @notice Place an order on the Somnia Markets on-chain order book.
    /// @param isBid             true = buy (take/bid), false = sell.
    /// @param userData          client order id / user-defined tag.
    /// @param price             Up probability in (0, 1) tick units.
    /// @param quantity          Order size (number of contracts).
    /// @param expireTimestampNs Expiry (ns) — use IOC-like short expiry.
    /// @param orderType         venue order type (TODO confirm enum).
    /// @param selfMatchingOption self-match policy (TODO confirm enum).
    /// @param builder           fee/builder address (can be address(this)).
    /// @param extra             extra data / flags (TODO confirm encoding).
    /// @return orderId          order identifier or receipt hash.
    function placeOrder(
        bool isBid,
        uint64 userData,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 extra
    ) external returns (bytes32);

    /// @notice Redeem a settled winning position.
    /// TODO(Phase 3): confirm the exact redeem signature against the deployed ABI.
    function redeem(bytes32 orderId) external returns (bool);
}
