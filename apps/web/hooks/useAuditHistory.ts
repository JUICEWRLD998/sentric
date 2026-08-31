"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { encodeEventTopics } from "viem";
import { ADDRESSES } from "@/lib/config";
import {
  auditEventAbi,
  fetchWindowedEvents,
  hedgeEventsAbi,
  parseAuditEvent,
  parseHedgeEvents,
  type AuditReceipt,
  type HedgeEvent,
} from "@/lib/events";
import { shortHash } from "@/lib/format";

/**
 * AuditEvent history, newest first, refreshed every 30s.
 * Scans backward in 800-block windows (150 windows ≈ 120k blocks ≈ 3h+).
 * Returns the newest-first AuditReceipt[] (undefined while loading / on failure).
 */
export function useAuditHistory(
  brainAddress?: Address | string,
  limit = 20
): AuditReceipt[] | undefined {
  const address = (brainAddress ?? ADDRESSES.brain) as Address;

  const { data } = useQuery<AuditReceipt[]>({
    queryKey: ["auditHistory", address, limit],
    queryFn: async () => {
      const { events } = await fetchWindowedEvents({
        address,
        event: "AuditEvent",
        maxWindows: 600, // 600 × 800 blocks ≈ 480k blocks (~13h at 10 blk/s) — reaches the demo audits (~418k back)
        windowBlocks: 800,
        concurrency: 12,
      });
      return events
        .flatMap((log) => {
          try {
            return [parseAuditEvent(log)];
          } catch {
            return [];
          }
        })
        .slice(-limit)
        .reverse();
    },
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 5_000,
  });

  return data;
}

/* ------------------------------------------------------------------ *
 * Merged timeline (AuditEvent + the 5 hedge events), newest first.
 * Every entry exposes the pinned shape the dashboard table renders:
 *   { kind, blockNumber, transactionHash, logIndex, summary }
 * ------------------------------------------------------------------ */

export type TimelineEntry =
  | (AuditReceipt & { kind: string; summary: string })
  | (HedgeEvent & { summary: string });

function auditSummary(r: AuditReceipt): string {
  return `${r.decision.toUpperCase()} conf ${r.confidence} inputsHash ${shortHash(r.inputsHash)}`;
}

function hedgeSummary(e: HedgeEvent): string {
  switch (e.kind) {
    case "HedgeExecuted":
      return `size ${e.size} yesPrice ${e.yesPrice} conf ${e.confidence}`;
    case "HedgeRedeemed":
      return `idx ${e.outcomeIdx} amount ${e.amount} out ${e.collateralOut}`;
    case "PositionOpened":
      return `nonce ${e.nonce} qty ${e.qtyRaw} pool ${shortHash(e.pool)}`;
    case "HedgeExpired":
      return `nonce ${e.nonce} (insurance cost)`;
    case "StopLossEngaged":
      return `streak ${e.lossStreak}`;
  }
}

// Topic0s computed from the same ABI fragments the parsers use (no drift possible).
const AUDIT_TOPIC0 = encodeEventTopics({ abi: auditEventAbi, eventName: "AuditEvent" })[0];
const HEDGE_TOPIC0S: Set<unknown> = new Set([
  encodeEventTopics({ abi: hedgeEventsAbi, eventName: "HedgeExecuted" })[0],
  encodeEventTopics({ abi: hedgeEventsAbi, eventName: "HedgeRedeemed" })[0],
  encodeEventTopics({ abi: hedgeEventsAbi, eventName: "PositionOpened" })[0],
  encodeEventTopics({ abi: hedgeEventsAbi, eventName: "HedgeExpired" })[0],
  encodeEventTopics({ abi: hedgeEventsAbi, eventName: "StopLossEngaged" })[0],
]);

export function useHedgeTimeline(brainAddress?: Address | string): TimelineEntry[] | undefined {
  const address = (brainAddress ?? ADDRESSES.brain) as Address;

  const { data } = useQuery<TimelineEntry[]>({
    queryKey: ["hedgeTimeline", address],
    queryFn: async () => {
      const { events } = await fetchWindowedEvents({
        address,
        maxWindows: 600, // 600 × 800 blocks ≈ 480k blocks (~13h at 10 blk/s) — reaches the demo audits (~418k back)
        windowBlocks: 800,
        concurrency: 12,
      });

      const entries: TimelineEntry[] = [];
      for (const log of events) {
        try {
          if (log.topics[0] === AUDIT_TOPIC0) {
            const r = parseAuditEvent(log);
            entries.push({ ...r, kind: "Audit", summary: auditSummary(r) });
          } else if (log.topics[0] && HEDGE_TOPIC0S.has(log.topics[0])) {
            const h = parseHedgeEvents(log);
            entries.push({ ...h, summary: hedgeSummary(h) });
          }
        } catch {
          // Skip logs we can't decode (unknown events / malformed data).
        }
      }

      entries.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? 1 : -1;
        return b.logIndex - a.logIndex;
      });

      return entries;
    },
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 5_000,
  });

  return data;
}
