"use client";

import type { Abi, Address } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import brainJson from "@/lib/abi/brain.json";
import { ADDRESSES } from "@/lib/config";

const brainAbi = brainJson as Abi;

/** Brain state enum: 0 Idle, 1 Fetching, 2 Deciding, 3 Scoring. */
export const BRAIN_STATE_NAMES = ["Idle", "Fetching", "Deciding", "Scoring"] as const;

export interface BrainState {
  state?: number;
  stateName?: string;
  isSubscribed?: boolean;
  positionOpen?: boolean;
  lossStreak?: bigint;
  lastOrderNonce?: bigint;
  lastOrderQtyRaw?: bigint;
  lastOrderPool?: Address;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

const READ_QUERY = { refetchInterval: 10_000, retry: 1, staleTime: 5_000 };

export function useBrainState(brainAddress?: Address | string): BrainState {
  const address = (brainAddress ?? ADDRESSES.brain) as Address;

  const stateQ = useReadContract({ address, abi: brainAbi, functionName: "state", query: READ_QUERY });
  const subscribedQ = useReadContract({ address, abi: brainAbi, functionName: "isSubscribed", query: READ_QUERY });
  const positionQ = useReadContract({ address, abi: brainAbi, functionName: "positionOpen", query: READ_QUERY });
  const lossQ = useReadContract({ address, abi: brainAbi, functionName: "lossStreak", query: READ_QUERY });
  const nonceQ = useReadContract({ address, abi: brainAbi, functionName: "lastOrderNonce", query: READ_QUERY });
  const qtyQ = useReadContract({ address, abi: brainAbi, functionName: "lastOrderQtyRaw", query: READ_QUERY });
  const poolQ = useReadContract({ address, abi: brainAbi, functionName: "lastOrderPool", query: READ_QUERY });

  const state = stateQ.data as number | undefined;
  const stateName =
    state !== undefined ? (BRAIN_STATE_NAMES[state] ?? "Unknown") : undefined;

  return {
    state,
    stateName,
    isSubscribed: subscribedQ.data as boolean | undefined,
    positionOpen: positionQ.data as boolean | undefined,
    lossStreak: lossQ.data as bigint | undefined,
    lastOrderNonce: nonceQ.data as bigint | undefined,
    lastOrderQtyRaw: qtyQ.data as bigint | undefined,
    lastOrderPool: poolQ.data as Address | undefined,
    isLoading:
      stateQ.isLoading ||
      subscribedQ.isLoading ||
      positionQ.isLoading ||
      lossQ.isLoading ||
      nonceQ.isLoading ||
      qtyQ.isLoading ||
      poolQ.isLoading,
    isError:
      stateQ.isError ||
      subscribedQ.isError ||
      positionQ.isError ||
      lossQ.isError ||
      nonceQ.isError ||
      qtyQ.isError ||
      poolQ.isError,
    error:
      stateQ.error ??
      subscribedQ.error ??
      positionQ.error ??
      lossQ.error ??
      nonceQ.error ??
      qtyQ.error ??
      poolQ.error ??
      null,
  };
}

export interface BrainActions {
  /** Arm the guardian (33 STT msg.value — requires the connected owner wallet). */
  armBrain: () => void;
  disarmBrain: () => void;
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
}

export function useBrainActions(brainAddress?: Address | string): BrainActions {
  const address = (brainAddress ?? ADDRESSES.brain) as Address;
  const { writeContract, isPending, isSuccess, error } = useWriteContract();

  const armBrain = () =>
    writeContract({
      address,
      abi: brainAbi,
      functionName: "arm",
      value: 33n * 10n ** 18n, // 33 STT
    });
  const disarmBrain = () =>
    writeContract({ address, abi: brainAbi, functionName: "disarm" });

  return { armBrain, disarmBrain, isPending, isSuccess, error: error ?? null };
}
