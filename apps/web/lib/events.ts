import {
  createPublicClient,
  decodeEventLog,
  encodeEventTopics,
  http,
  type Abi,
  type Address,
  type Log,
} from "viem";
import brainJson from "./abi/brain.json";
import { chain } from "./chain";
import { RPC_URL } from "./config";

/** Full brain ABI (79 entries) — source of truth for event signatures. */
export const brainAbi = brainJson as Abi;

const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL, { retryCount: 3, timeout: 20_000 }),
});
export { publicClient };

/* ------------------------------------------------------------------ *
 * Event ABI fragments — copied 1:1 from lib/abi/brain.json (verified
 * against the JSON, not invented). Used for typed decodeEventLog.
 * ------------------------------------------------------------------ */

export const auditEventAbi = [
  {
    type: "event",
    name: "AuditEvent",
    inputs: [
      { name: "inputsHash", type: "bytes32", indexed: false, internalType: "bytes32" },
      { name: "decision", type: "string", indexed: false, internalType: "string" },
      { name: "confidence", type: "uint8", indexed: false, internalType: "uint8" },
      { name: "asset", type: "address", indexed: true, internalType: "address" },
    ],
  },
] as const;

export const hedgeEventsAbi = [
  {
    type: "event",
    name: "HedgeExecuted",
    inputs: [
      { name: "size", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "yesPrice", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "confidence", type: "uint8", indexed: false, internalType: "uint8" },
    ],
  },
  {
    type: "event",
    name: "HedgeRedeemed",
    inputs: [
      { name: "outcomeIdx", type: "uint8", indexed: false, internalType: "uint8" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "collateralOut", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    type: "event",
    name: "PositionOpened",
    inputs: [
      { name: "nonce", type: "uint64", indexed: false, internalType: "uint64" },
      { name: "qtyRaw", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "pool", type: "address", indexed: false, internalType: "address" },
    ],
  },
  {
    type: "event",
    name: "HedgeExpired",
    inputs: [{ name: "nonce", type: "uint64", indexed: false, internalType: "uint64" }],
  },
  {
    type: "event",
    name: "StopLossEngaged",
    inputs: [{ name: "lossStreak", type: "uint256", indexed: false, internalType: "uint256" }],
  },
] as const;

export const HEDGE_EVENT_NAMES = [
  "HedgeExecuted",
  "HedgeRedeemed",
  "PositionOpened",
  "HedgeExpired",
  "StopLossEngaged",
] as const;

/* ------------------------------------------------------------------ *
 * Windowed scanner.
 * Somnia's eth_getLogs caps at 1000 blocks per call — walk BACKWARD
 * from toBlock in `windowBlocks` (default 800) steps and merge.
 * ------------------------------------------------------------------ */

export interface FetchWindowedEventsParams {
  address: Address;
  /** Event name to filter by (topic0). Omit to fetch ALL logs for the address. */
  event?: string;
  abi?: Abi;
  fromBlock?: bigint | number;
  toBlock?: bigint | number | "latest";
  maxWindows?: number;
  windowBlocks?: number;
  /** How many windows to fetch concurrently (default 1 = strict sequential). */
  concurrency?: number;
}

export interface WindowedEventsResult {
  /** Merged logs, sorted ascending (oldest first). */
  events: Log[];
  /** True when the scan walked all the way back to fromBlock (or genesis). */
  fromBlockReached: boolean;
}

/**
 * NOTE: the Somnia testnet RPC IGNORES topic filters in eth_getLogs
 * (verified 2026-08-31 — a bogus topic still returned logs), so when
 * `event` is given we additionally filter by topic0 client-side.
 */
export async function fetchWindowedEvents({
  address,
  event,
  abi = brainAbi,
  fromBlock,
  toBlock = "latest",
  maxWindows = 50,
  windowBlocks = 800,
  concurrency = 1,
}: FetchWindowedEventsParams): Promise<WindowedEventsResult> {
  const win = BigInt(windowBlocks);
  const maxW = maxWindows > 0 ? maxWindows : 1;
  const topBlock =
    toBlock === "latest" || toBlock === undefined
      ? await publicClient.getBlockNumber()
      : BigInt(toBlock);
  const bottomBlock = fromBlock !== undefined ? BigInt(fromBlock) : 0n;

  const topic0 = event ? encodeEventTopics({ abi, eventName: event })[0] : undefined;
  const conc = Math.max(1, Math.min(concurrency, maxW));

  // Build the window list (backward from toBlock), clamping to fromBlock.
  const windows: { start: bigint; end: bigint }[] = [];
  let cursor = topBlock;
  let fromBlockReached = false;
  for (let i = 0; i < maxW; i++) {
    const end = cursor;
    let start = end - win + 1n;
    if (start < bottomBlock) start = bottomBlock;
    if (start > end) break; // no blocks left to scan
    windows.push({ start, end });
    if (start <= bottomBlock) {
      fromBlockReached = true;
      break;
    }
    cursor = start - 1n;
  }

  // Fetch windows in batches; failures leave gaps (the query-level retry
  // handles flaky RPC, and a later refetch fills the gap).
  const all: Log[] = [];
  for (let i = 0; i < windows.length; i += conc) {
    const batch = windows.slice(i, i + conc);
    const settled = await Promise.allSettled(
      batch.map((w) =>
        publicClient.getLogs({
          address,
          ...(topic0 ? { topics: [topic0] as const } : {}),
          fromBlock: w.start,
          toBlock: w.end,
        })
      )
    );
    for (const r of settled) {
      if (r.status === "fulfilled") {
        const logs = topic0 ? r.value.filter((l) => l.topics[0] === topic0) : r.value;
        all.push(...logs);
      }
    }
  }

  all.sort((a, b) => {
    const ab = a.blockNumber ?? 0n;
    const bb = b.blockNumber ?? 0n;
    if (ab !== bb) return ab < bb ? -1 : 1;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });

  return { events: all, fromBlockReached };
}

/* ------------------------------------------------------------------ *
 * Typed parsers.
 * ------------------------------------------------------------------ */

export interface AuditReceipt {
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
  inputsHash: `0x${string}`;
  decision: string;
  confidence: number;
  asset: Address;
  /** No timestamp on-chain — callers may attach one (latest block ts). */
  ts?: number;
}

export function parseAuditEvent(log: Log): AuditReceipt {
  const decoded = decodeEventLog({
    abi: auditEventAbi,
    data: log.data,
    topics: log.topics,
    strict: true,
  });
  return {
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? ("0x" + "0".repeat(64)),
    logIndex: log.logIndex ?? 0,
    inputsHash: decoded.args.inputsHash,
    decision: decoded.args.decision,
    confidence: decoded.args.confidence,
    asset: decoded.args.asset,
  };
}

export type HedgeEvent =
  | {
      kind: "HedgeExecuted";
      blockNumber: bigint;
      transactionHash: string;
      logIndex: number;
      size: bigint;
      yesPrice: bigint;
      confidence: number;
    }
  | {
      kind: "HedgeRedeemed";
      blockNumber: bigint;
      transactionHash: string;
      logIndex: number;
      outcomeIdx: number;
      amount: bigint;
      collateralOut: bigint;
    }
  | {
      kind: "PositionOpened";
      blockNumber: bigint;
      transactionHash: string;
      logIndex: number;
      nonce: bigint;
      qtyRaw: bigint;
      pool: Address;
    }
  | {
      kind: "HedgeExpired";
      blockNumber: bigint;
      transactionHash: string;
      logIndex: number;
      nonce: bigint;
    }
  | {
      kind: "StopLossEngaged";
      blockNumber: bigint;
      transactionHash: string;
      logIndex: number;
      lossStreak: bigint;
    };

export function parseHedgeEvents(log: Log): HedgeEvent {
  const decoded = decodeEventLog({
    abi: hedgeEventsAbi,
    data: log.data,
    topics: log.topics,
    strict: true,
  });
  const base = {
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? ("0x" + "0".repeat(64)),
    logIndex: log.logIndex ?? 0,
  };
  switch (decoded.eventName) {
    case "HedgeExecuted":
      return { ...base, kind: "HedgeExecuted", ...decoded.args };
    case "HedgeRedeemed":
      return { ...base, kind: "HedgeRedeemed", ...decoded.args };
    case "PositionOpened":
      return { ...base, kind: "PositionOpened", ...decoded.args };
    case "HedgeExpired":
      return { ...base, kind: "HedgeExpired", ...decoded.args };
    case "StopLossEngaged":
      return { ...base, kind: "StopLossEngaged", ...decoded.args };
    default:
      throw new Error(`Unsupported hedge event: ${log.topics[0] ?? "no topics"}`);
  }
}
