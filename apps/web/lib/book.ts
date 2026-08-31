import { createPublicClient, http, type Address } from "viem";
import { chain } from "./chain";
import { RPC_URL } from "./config";

/**
 * IBinaryPool read ABI (the vault's venue via vault.pool()).
 * getBookLevels(isYes, levels) -> (uint256 price, uint256 qty)[],
 * best level first; NO side prices are quoted as 1e6 - yesPrice.
 */
const poolAbi = [
  {
    type: "function",
    name: "getBookLevels",
    stateMutability: "view",
    inputs: [
      { name: "isYes", type: "bool", internalType: "bool" },
      { name: "levels", type: "uint64", internalType: "uint64" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "price", type: "uint256", internalType: "uint256" },
          { name: "qty", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "marketExpiryNs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
  },
] as const;

/** 1e6 raw = 1 USDC = 100% P(Up). */
const MAX_PRICE = 1_000_000n;

const bookClient = createPublicClient({
  chain,
  transport: http(RPC_URL, { retryCount: 3, timeout: 20_000 }),
});

export interface BookData {
  /** Best YES bid price (P up). */
  pUpRaw: bigint;
  /** Implied P down = 1e6 - pUpRaw. */
  pDownRaw: bigint;
  bestYesBidRaw: bigint;
  /** Best YES ask = 1e6 - best NO bid. */
  bestYesAskRaw: bigint;
  /** NO ask implied by the best YES bid. */
  noAskRaw: bigint;
  /** Best NO bid (raw NO price). */
  noBidRaw: bigint;
  /** Depth (qty) at the top YES bid level. */
  topDepthRaw: bigint;
  /** Market expiry in nanoseconds (unix epoch); null when unreadable. */
  expiryNs: bigint | null;
}

const bestPrice = (levels: readonly { price: bigint; qty: bigint }[]) =>
  levels.reduce((best, l) => (l.price > best ? l.price : best), 0n);

export async function fetchBook(poolAddress: Address): Promise<BookData> {
  const [yesBids, noBids] = await Promise.all([
    bookClient.readContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: "getBookLevels",
      args: [true, 2n],
    }),
    bookClient.readContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: "getBookLevels",
      args: [false, 2n],
    }),
  ]);

  const bestYesBidRaw = bestPrice(yesBids);
  const bestNoBidRaw = bestPrice(noBids);
  const bestYesAskRaw = bestNoBidRaw > 0n ? MAX_PRICE - bestNoBidRaw : 0n;
  const noAskRaw = bestYesBidRaw > 0n ? MAX_PRICE - bestYesBidRaw : 0n;
  const pUpRaw = bestYesBidRaw;
  const pDownRaw = bestYesBidRaw > 0n ? MAX_PRICE - bestYesBidRaw : 0n;
  const topDepthRaw = yesBids[0]?.qty ?? 0n;

  let expiryNs: bigint | null = null;
  try {
    expiryNs = await bookClient.readContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: "marketExpiryNs",
      args: [],
    });
  } catch {
    expiryNs = null;
  }

  return {
    pUpRaw,
    pDownRaw,
    bestYesBidRaw,
    bestYesAskRaw,
    noAskRaw,
    noBidRaw: bestNoBidRaw,
    topDepthRaw,
    expiryNs,
  };
}
