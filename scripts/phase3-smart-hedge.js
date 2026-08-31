// Phase 3 milestone driver (smart): hedges liquid BTC windows — the op-4 1-min
// series and the op-2 5-min product series — when P(Up) sits in the liquid zone
// (book depth at the crossing level is a hard requirement; near-certain windows
// have dead books and the pool reverts 0xd48c4403). Redeems the first NO-win.
// Usage: node scripts/phase3-smart-hedge.js <brain> <vault> [maxCycles]
const fs = require("fs");
const path = require("path");
try {
  const envPath = path.join(__dirname, "..", ".env");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch (e) {}

const { createWalletClient, createPublicClient, http, encodeFunctionData } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const [BRAIN, VAULT, MAX_CYCLES = "14"] = process.argv.slice(2);
if (!BRAIN || !VAULT) {
  console.error("usage: node scripts/phase3-smart-hedge.js <brain> <vault> [maxCycles]");
  process.exit(1);
}

const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388";
const OUTCOME_TOKEN = "0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9";
// Liquid zone: P(Up) where the book is deep enough for a ~20-token order.
const PUP_MIN = 0.25;
const PUP_MAX = 0.75;
// Minimum raw qty at the top YES-bid level for a safe fill (my order is
// ~10-20 tokens = 10-20e6 raw).
const MIN_TOP_DEPTH = 25_000_000n;

const chain = { id: 50312, name: "Somnia Testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const BRAIN_ABI = [
  { inputs: [{ type: "address" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }], name: "manualHedgeNow", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "uint8" }, { type: "uint256" }], name: "manualRedeem", outputs: [{ type: "uint256" }], stateMutability: "nonpayable", type: "function" },
];
const VAULT_ABI = [
  { inputs: [], name: "marketNonce", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "windowPremiumSpent", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];
const MARKETS_ABI = [{ inputs: [{ type: "bytes32" }], name: "markets", outputs: [{ type: "uint256" }, { type: "uint8" }, { type: "uint8" }, { type: "address" }, { type: "uint32" }, { type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }], stateMutability: "view", type: "function" }];
const POOL_ABI = [
  { inputs: [], name: "marketExpiryNs", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "bool" }, { type: "uint64" }], name: "getBookLevels", outputs: [{ type: "tuple[]", components: [{ type: "uint256" }, { type: "uint256" }] }], stateMutability: "view", type: "function" },
];
const MARKET_ABI = [
  { inputs: [], name: "isResolved", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "payoutNumerators", outputs: [{ type: "uint256[]" }], stateMutability: "view", type: "function" },
];
const ERC6909_ABI = [{ inputs: [{ type: "address" }, { type: "uint256" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" }];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn, n = 6) => { let last; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { last = e; await sleep(1500); } } throw last; };

async function send(tx, label) {
  const hash = await wallet.sendTransaction({ ...tx, maxFeePerGas: 20n * 10n ** 9n, maxPriorityFeePerGas: 10n ** 8n });
  console.log(`${label}: ${hash}  https://shannon-explorer.somnia.network/tx/${hash}`);
  const r = await retry(() => pub.waitForTransactionReceipt({ hash, timeout: 120_000 }));
  console.log(`  status=${r.status} gasUsed=${r.gasUsed}`);
  if (r.status !== "success") throw new Error(`${label} REVERTED`);
  return r;
}

async function scanWindows() {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const oneMin = [], fiveMin = [];
  for (let id = 60300n; id <= 60750n; id++) {
    const key = "0x" + id.toString(16).padStart(64, "0");
    try {
      const r = await retry(() => pub.readContract({ address: MODULE, abi: MARKETS_ABI, functionName: "markets", args: [key] }));
      if (r[13] <= nowSec) continue;
      const winSec = Number(r[13] - r[12]);
      let bids = [];
      try { bids = await retry(() => pub.readContract({ address: r[9], abi: POOL_ABI, functionName: "getBookLevels", args: [true, 2n] })); } catch (e) {}
      const w = { id, pool: r[9], market: r[8], expiry: r[13], secsLeft: Number(r[13] - nowSec), bestYesBid: bids.length ? bids[0][0] : 0n, topDepth: bids.length ? bids[0][1] : 0n };
      if (winSec <= 70 && winSec >= 50) oneMin.push(w);
      else if (winSec === 300 && r[4] === 2) fiveMin.push(w);
    } catch (e) {}
  }
  return { oneMin: oneMin.sort((a, b) => b.secsLeft - a.secsLeft), fiveMin: fiveMin.sort((a, b) => b.secsLeft - a.secsLeft) };
}

// Liquid strike: P(Up) inside the liquid zone AND enough depth at the top level.
function isStrikeable(w, pUpMin, pUpMax) {
  return w.bestYesBid > 0n && w.topDepth >= MIN_TOP_DEPTH
    && w.bestYesBid >= BigInt(Math.floor(pUpMin * 1e6)) && w.bestYesBid <= BigInt(Math.floor(pUpMax * 1e6));
}

async function hedgeAndSettle(win, label) {
  const yesBid = win.bestYesBid;
  const crossYes = yesBid - 1000n;
  const downBps = Number(1000000n - crossYes) / 100;
  console.log(`STRIKE ${label} #${win.id}: P(Up)=${Number(yesBid) / 1e6} secsLeft=${win.secsLeft} -> yesPrice ${crossYes} downPriceBps=${downBps}`);
  await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualHedgeNow", args: [win.pool, "0x" + win.id.toString(16).padStart(64, "0"), BigInt(downBps), crossYes] }) }, "manualHedgeNow");
  const nonce = await retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "marketNonce" }));
  const spent = await retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "windowPremiumSpent" }));
  console.log(`hedged window #${win.id}: nonce=${nonce} premiumRaw=${spent} (${Number(spent) / 1e6} USDC)`);

  const deadline = Date.now() + 4 * 60 * 1000;
  let numerators = [];
  while (Date.now() < deadline) {
    try {
      const res = await retry(() => pub.readContract({ address: win.market, abi: MARKET_ABI, functionName: "isResolved" }));
      if (res) { numerators = await retry(() => pub.readContract({ address: win.market, abi: MARKET_ABI, functionName: "payoutNumerators" })); break; }
    } catch (e) {}
    await sleep(8000);
  }
  if (!numerators.length) { console.log("no resolution — continuing"); return false; }
  console.log("resolved, payoutNumerators =", numerators.map(String));
  const noWon = numerators.length >= 2 && numerators[1] > 0n;
  if (!noWon) { console.log(`YES won — hedge expired (premium ${Number(spent) / 1e6} USDC = insurance cost).`); return false; }
  const outcomeId = (BigInt(win.pool) << 72n) | (BigInt(nonce) << 8n) | 1n;
  const holdings = await retry(() => pub.readContract({ address: OUTCOME_TOKEN, abi: ERC6909_ABI, functionName: "balanceOf", args: [VAULT, outcomeId] }));
  console.log(`NO WON. vault holds ${holdings} NO tokens (outcomeId ${outcomeId})`);
  if (holdings === 0n) { console.log("no holdings — check fill"); return false; }
  await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualRedeem", args: [1, holdings] }) }, "manualRedeem");
  console.log(`\nMILESTONE COMPLETE: vault placed a real order on window #${win.id} and redeemed ${holdings} NO tokens (payout ~${Number(holdings) / 1e6} USDC vs premium ${Number(spent) / 1e6} USDC).`);
  return true;
}

async function main() {
  for (let c = 0; c < Number(MAX_CYCLES); c++) {
    console.log(`\n=== cycle ${c + 1}/${MAX_CYCLES}`);
    const { oneMin, fiveMin } = await scanWindows();
    const fmt = (arr) => arr.map((w) => `#${w.id} PUp=${(Number(w.bestYesBid) / 1e6).toFixed(2)} d=${(Number(w.topDepth) / 1e6).toFixed(0)} s=${w.secsLeft}`).join(" ") || "none";
    console.log(`  1-min: ${fmt(oneMin)}`);
    console.log(`  5-min: ${fmt(fiveMin)}`);

    // Pick a candidate: 1-min closing soon, else the 5-min product window.
    let target = oneMin.find((w) => w.secsLeft <= 45 && isStrikeable(w, 0.15, 0.85))
      || fiveMin.find((w) => w.secsLeft <= 150 && w.secsLeft >= 45 && isStrikeable(w, PUP_MIN, PUP_MAX));
    let label = target && target.secsLeft <= 45 ? "1-min" : "5-min";
    if (!target) { await sleep(20000); continue; }

    // Refresh the book right before striking (state can move in seconds).
    const refreshBids = async (pool) => {
      for (let t = 0; t < 4; t++) {
        try {
          const b = await retry(() => pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getBookLevels", args: [true, 2n] }));
          if (b.length) return b;
        } catch (e) {}
        await sleep(3000);
      }
      return [];
    };
    let bids = await refreshBids(target.pool);
    if (bids.length && isStrikeable({ ...target, bestYesBid: bids[0][0], topDepth: bids[0][1] }, 0.15, 0.85)) {
      target.bestYesBid = bids[0][0];
      target.topDepth = bids[0][1];
      if (await hedgeAndSettle(target, label)) process.exit(0);
    } else {
      console.log("  primary book drained — trying the other series");
      const alt = label === "1-min"
        ? fiveMin.find((w) => w.secsLeft <= 150 && w.secsLeft >= 45 && isStrikeable(w, PUP_MIN, PUP_MAX))
        : oneMin.find((w) => w.secsLeft <= 45 && isStrikeable(w, 0.15, 0.85));
      if (alt) {
        target = alt;
        label = label === "1-min" ? "5-min" : "1-min";
        bids = await refreshBids(target.pool);
        if (bids.length && isStrikeable({ ...target, bestYesBid: bids[0][0], topDepth: bids[0][1] }, 0.15, 0.85)) {
          target.bestYesBid = bids[0][0];
          target.topDepth = bids[0][1];
          if (await hedgeAndSettle(target, label)) process.exit(0);
        }
      }
      console.log("  no strikeable book this cycle — retry");
      await sleep(15000);
    }
  }
  console.log(`no NO-win across ${MAX_CYCLES} cycles — rerun the script`);
  process.exit(1);
}

main().catch((e) => { console.error("FAILED:", e.shortMessage || e.message); if (e.details) console.error(e.details); process.exit(1); });
