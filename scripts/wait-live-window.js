// Wait for the next live op-2 (product) 5-min BTC window, read its book, and
// print the POOL_ADDRESS / MARKET_ID / DOWN_PRICE_BPS to configure the deploy.
// Usage: node scripts/wait-live-window.js [waitMs]
const { createPublicClient, http } = require("viem");
const RPC = process.env.SOMNIA_RPC_URL || "https://api.infra.testnet.somnia.network";
const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388";

const client = createPublicClient({ chain: { id: 50312 }, transport: http(RPC, { retryCount: 4, retryDelay: 1500 }) });

const MARKETS_ABI = [
  { inputs: [{ type: "bytes32" }], name: "markets", outputs: [{ type: "uint256" }, { type: "uint8" }, { type: "uint8" }, { type: "address" }, { type: "uint32" }, { type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }], stateMutability: "view", type: "function" },
];
const POOL_ABI = [
  { inputs: [], name: "marketExpiryNs", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "marketNonce", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "bool" }, { type: "uint64" }], name: "getBookLevels", outputs: [{ type: "tuple[]", components: [{ type: "uint256" }, { type: "uint256" }] }], stateMutability: "view", type: "function" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn, n = 4) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await sleep(1200); }
  }
  throw last;
};

async function scanLive() {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const out = [];
  for (let id = 60250n; id <= 60550n; id++) {
    const key = "0x" + id.toString(16).padStart(64, "0");
    try {
      const r = await retry(() => client.readContract({ address: MODULE, abi: MARKETS_ABI, functionName: "markets", args: [key] }));
      if (r[13] > nowSec && r[13] - nowSec < 900n) out.push({ id, op: r[4], start: r[12], expiry: r[13], market: r[8], pool: r[9] });
    } catch (e) {}
  }
  return out;
}

async function main() {
  const wait = Number(process.argv[2] || "0");
  if (wait) { console.log(`waiting ${wait / 1000}s for the fresh window...`); await sleep(wait); }

  const live = await scanLive();
  const candidates = live.filter((m) => m.op === 2 && m.expiry - m.start === 300n); // product 5-min series
  console.log("live op-2 5-min windows:", candidates.map((c) => `#${c.id} ${c.pool} [${new Date(Number(c.start) * 1000).toISOString()} -> ${new Date(Number(c.expiry) * 1000).toISOString()}]`).join("\n  ") || "none");

  for (const c of candidates) {
    let bids = [], asks = [];
    try {
      bids = await retry(() => client.readContract({ address: c.pool, abi: POOL_ABI, functionName: "getBookLevels", args: [true, 5n] }));
      asks = await retry(() => client.readContract({ address: c.pool, abi: POOL_ABI, functionName: "getBookLevels", args: [false, 5n] }));
    } catch (e) {}
    if (bids.length) {
      const bb = bids[0][0];
      const crossYes = bb - 1000n;
      const downBps = Number(1000000n - crossYes) / 100;
      const nonce = await retry(() => client.readContract({ address: c.pool, abi: POOL_ABI, functionName: "marketNonce" }));
      console.log("\nLIVE WINDOW CONFIG for #" + c.id.toString() + ":");
      console.log("  POOL_ADDRESS=" + c.pool);
      console.log("  MARKET_ID=0x" + c.id.toString(16).padStart(64, "0"));
      console.log("  MARKET=" + c.market);
      console.log("  pool nonce=" + nonce.toString() + " expiry=" + new Date(Number(c.expiry) * 1000).toISOString());
      console.log("  best YES bid=" + bb.toString() + " NO ask=" + (1000000n - bb).toString());
      console.log("  DOWN_PRICE_BPS=" + downBps + "  (cross yesPrice " + crossYes.toString() + ")");
      console.log("  bids:", bids.map((x) => x[0].toString() + "@" + x[1].toString()).join(" "));
      console.log("  asks:", asks.map((x) => x[0].toString() + "@" + x[1].toString()).join(" "));
      process.exit(0);
    } else {
      console.log("  pool " + c.pool + ": book empty, trying next");
    }
  }
  console.log("no usable window yet — rerun with a waitMs, or scan again");
  process.exit(1);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
