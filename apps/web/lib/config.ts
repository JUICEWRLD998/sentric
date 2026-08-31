/**
 * Sentric — chain + deployed-address configuration.
 * Somnia testnet, chainId 50312.
 */

export const CHAIN_ID = 50312 as const;

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOMNIA_RPC_URL || "https://api.infra.testnet.somnia.network";

export const ADDRESSES = {
  /** SentricBrain v4 (current agent; UNARMED — emits no new events until armed, still readable). */
  brain:
    (process.env.NEXT_PUBLIC_BRAIN_ADDRESS as `0x${string}` | undefined) ||
    "0xb7ce698f31d8ad10a1714f3da701cdc32c58067e",
  /** Phase-2 brain — historical AuditEvents for the demo (disarmed 2026-08-31). */
  brainV2: "0x9b0ee5aff990d09a099672a621b7ce18d7ac98ec",
  /** SentricVault v2 (vault owned by brain). */
  vault:
    (process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined) ||
    "0xd4fa5efd13d7cb247c26d267014164031c93885f",
  /** tUSDC — 6 decimals, balanceOf(address). */
  tusdc: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E",
  /** ERC-6909 outcome token — balanceOf(address, uint256). */
  outcomeToken: "0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9",
} as const;
