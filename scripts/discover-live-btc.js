// Scan BinaryMarketsModule markets(bytes32) for a currently-TRADING binary
// market (expiry > now). Prints live markets with pool addresses.
// Usage: node scripts/discover-live-btc.js [fromId] [toId]
const { createPublicClient, http } = require("viem");
const RPC = process.env.SOMNIA_RPC_URL || "https://api.infra.testnet.somnia.network";
const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388";

const client = createPublicClient({
  chain: { id: 50312 },
  transport: http(RPC, { retryCount: 4, retryDelay: 1500 }),
});

const MARKETS_ABI = [
  {
    inputs: [{ type: "bytes32" }],
    name: "markets",
    outputs: [
      { type: "uint256" }, // oracleQuestionId
      { type: "uint8" }, // outcomeSlotCount
      { type: "uint8" }, // voidPolicy
      { type: "address" }, // collateral
      { type: "uint32" }, // originOperatorId
      { type: "bytes32" }, // originVenueId
      { type: "address" }, // oracleAdapter
      { type: "address" }, // creator
      { type: "address" }, // market
      { type: "address" }, // pool
      { type: "uint256" }, // yesId
      { type: "uint256" }, // noId
      { type: "uint64" }, // tradingStart
      { type: "uint64" }, // expiry
    ],
    stateMutability: "view",
    type: "function",
  },
];

const retry = async (fn, n = 4) => {
  let last;
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw last;
};

async function main() {
  const latest = await retry(() => client.getBlockNumber());
  const from = BigInt(process.argv[2] || "59500");
  const to = BigInt(process.argv[3] || String(latest < 1000n ? latest : latest % 100000n));
  const to2 = BigInt(process.argv[3] || "60800");
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  console.log("latest block:", latest.toString(), "| scanning marketIds", from.toString(), "..", to2.toString());
  let found = 0;
  for (let id = from; id <= to2; id++) {
    const key = "0x" + id.toString(16).padStart(64, "0");
    try {
      const r = await retry(() => client.readContract({ address: MODULE, abi: MARKETS_ABI, functionName: "markets", args: [key] }));
      const expiry = r[13];
      if (expiry > nowNs) {
        const expHuman = new Date(Number(expiry) / 1e6).toISOString();
        console.log(`LIVE id=${id} expiry=${expHuman} market=${r[8]} pool=${r[9]} nonceHint=start=${r[12]}`);
        found++;
      }
    } catch (e) {
      // empty record (id beyond current counter) or RPC hiccup — keep scanning
    }
  }
  console.log("found", found, "live markets");
}

main().catch((e) => {
  console.error("FATAL:", e.shortMessage || e.message);
  process.exit(1);
});
