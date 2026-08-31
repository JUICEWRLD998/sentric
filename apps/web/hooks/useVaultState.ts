"use client";

import type { Abi, Address } from "viem";
import { useReadContract } from "wagmi";
import vaultJson from "@/lib/abi/vault.json";
import { ADDRESSES } from "@/lib/config";

const vaultAbi = vaultJson as Abi;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },
] as const;

export interface VaultState {
  poolAddress: Address;
  /** Vault's tUSDC balance (6 decimals). */
  tusdcBalanceRaw: bigint;
  windowPremiumSpentRaw: bigint;
  dailyPremiumSpentRaw: bigint;
  paused: boolean;
  marketNonce: bigint;
  lastOrderId: bigint;
  maxPremiumPerWindowRaw: bigint;
}

const READ_QUERY = { refetchInterval: 10_000, retry: 1, staleTime: 5_000 };

/**
 * Vault read state, polled every 10s.
 * Returns undefined until every read has resolved (or on RPC failure).
 */
export function useVaultState(vaultAddress?: Address | string): VaultState | undefined {
  const address = (vaultAddress ?? ADDRESSES.vault) as Address;

  const poolQ = useReadContract({ address, abi: vaultAbi, functionName: "pool", query: READ_QUERY });
  const windowQ = useReadContract({ address, abi: vaultAbi, functionName: "windowPremiumSpent", query: READ_QUERY });
  const dailyQ = useReadContract({ address, abi: vaultAbi, functionName: "dailyPremiumSpent", query: READ_QUERY });
  const pausedQ = useReadContract({ address, abi: vaultAbi, functionName: "paused", query: READ_QUERY });
  const nonceQ = useReadContract({ address, abi: vaultAbi, functionName: "marketNonce", query: READ_QUERY });
  const orderQ = useReadContract({ address, abi: vaultAbi, functionName: "lastOrderId", query: READ_QUERY });
  const capQ = useReadContract({ address, abi: vaultAbi, functionName: "maxPremiumPerWindow", query: READ_QUERY });
  const tusdcQ = useReadContract({
    address: ADDRESSES.tusdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
    query: READ_QUERY,
  });

  const values = [
    poolQ.data,
    windowQ.data,
    dailyQ.data,
    pausedQ.data,
    nonceQ.data,
    orderQ.data,
    capQ.data,
    tusdcQ.data,
  ];

  if (values.some((v) => v === undefined)) return undefined;

  return {
    poolAddress: poolQ.data as Address,
    tusdcBalanceRaw: tusdcQ.data as bigint,
    windowPremiumSpentRaw: windowQ.data as bigint,
    dailyPremiumSpentRaw: dailyQ.data as bigint,
    paused: pausedQ.data as boolean,
    marketNonce: nonceQ.data as bigint,
    lastOrderId: orderQ.data as bigint,
    maxPremiumPerWindowRaw: capQ.data as bigint,
  };
}
