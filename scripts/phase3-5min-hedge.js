// Phase 3 milestone driver (5-min product series): hedges the live op-2 5-min
// BTC window each cycle (BUY_NO market order through the vault), waits for
// settlement, and redeems the first NO-win. Windows where YES wins are logged
// as insurance cost (premium spent, no payout) — realistic insurance semantics.
// Usage: node scripts/phase3-5min-hedge.js <brain> <vault> [maxWindows] [maxPremiumRaw]
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
const [BRAIN, VAULT, MAX_WINDOWS = "5"] = process.argv.slice(2);
if (!BRAIN || !VAULT) {
  console.error("usage: node scripts/phase3-5min-hedge.js <brain> <vault> [maxWindows]");
  process.exit(1);
}

const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388";
const SETTLEMENT = "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23";
const TUSDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E";
const OUTCOME_TOKEN = "0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9";
const EXPOSURE = 1000000000000n; // 1M USDC (6-dec)
const MAX_PREMIUM = 10000000n; // 10 USDC/window
const MOVE_BPS = 200n;

const chain = { id: 50312, name: "Somnia Testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const BRAIN_ABI = [
  { inputs: [], name: "manualHedge", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "uint8" }, { type: "uint256" }], name: "manualRedeem", outputs: [{ type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }], name: "manualHedgeNow", outputs: [], stateMutability: "nonpayable", type: "function" },
];
const VAULT_ABI = [
  { inputs: [], name: "marketNonce", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "windowPremiumSpent", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];
const MARKETS_ABI = [{ inputs: [{ type: "bytes32" }], name: "markets", outputs: [{ type: "uint256" }, { type: "uint8" }, { type: "uint8" }, { type: "address" }, { type: "uint32" }, { type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }], stateMutability: "view", type: "function" }];
const POOL_ABI = [
  { inputs: [], name: "marketExpiryNs", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "marketNonce", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
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

async function live5min() {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const out = [];
  for (let id = 60250n; id <= 60650n; id++) {
    const key = "0x" + id.toString(16).padStart(64, "0");
    try {
      const r = await retry(() => pub.readContract({ address: MODULE, abi: MARKETS_ABI, functionName: "markets", args: [key] }));
      if (r[13] > nowSec && r[13] - r[12] === 300n && r[4] === 2) {
        out.push({ id, pool: r[9], market: r[8], expiry: r[13], start: r[12], secsLeft: Number(r[13] - nowSec) });
      }
    } catch (e) {}
  }
  return out.sort((a, b) => b.secsLeft - a.secsLeft);
}

async function main() {
  for (let w = 0; w < Number(MAX_WINDOWS); w++) {
    console.log(`\n=== window cycle ${w + 1}/${MAX_WINDOWS}`);
    let win;
    for (let s = 0; s < 10 && !win; s++) {
      const live = await live5min();
      win = live[0];
      if (!win) { console.log(`  scan ${s}: no live op-2 5-min window yet`); await sleep(15000); }
    }
    if (!win) { console.log("no live 5-min window — operator series paused? aborting"); break; }
    console.log(`window #${win.id}: pool=${win.pool} [${new Date(Number(win.start) * 1000).toISOString()} -> ${new Date(Number(win.expiry) * 1000).toISOString()}] secsLeft=${win.secsLeft}`);

    // Strike at T-90s: read the book, pick a crossing price, hedge.
    const waitMs = Math.max(0, (win.secsLeft - 90)) * 1000;
    if (waitMs > 0) { console.log(`waiting ${(waitMs / 1000).toFixed(0)}s to strike at T-90s`); await sleep(waitMs); }

    let bids = [];
    for (let t = 0; t < 5; t++) {
      try { bids = await retry(() => pub.readContract({ address: win.pool, abi: POOL_ABI, functionName: "getBookLevels", args: [true, 3n] })); } catch (e) {}
      if (bids.length) break;
      await sleep(5000);
    }
    if (!bids.length) { console.log("book empty at strike — skipping window"); continue; }
    const yesBid = bids[0][0];
    const crossYes = yesBid - 1000n;
    const downBps = Number(1000000n - crossYes) / 100;
    console.log(`book: best YES bid ${yesBid} -> NO ask ${1000000n - yesBid}; cross yesPrice ${crossYes} -> downPriceBps=${downBps}`);
    if (yesBid >= 700000n) {
      console.log("P(Up) >= 0.70 — BTC well above opening; skipping (insurance discipline, no premium wasted)");
      continue;
    }

    // One tx: re-point the vault, approve the pool, size and place the hedge.
    await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualHedgeNow", args: [win.pool, "0x" + win.id.toString(16).padStart(64, "0"), BigInt(downBps), crossYes] }) }, "brain.manualHedgeNow");

    const nonce = await retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "marketNonce" }));
    const spent = await retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "windowPremiumSpent" }));
    console.log(`hedge placed on window #${win.id}: nonce=${nonce} premiumRaw=${spent} (${Number(spent) / 1e6} USDC)`);

    // Wait for settlement (window expiry + resolution latency).
    const deadline = Date.now() + 4 * 60 * 1000;
    let numerators = [];
    while (Date.now() < deadline) {
      try {
        const res = await retry(() => pub.readContract({ address: win.market, abi: MARKET_ABI, functionName: "isResolved" }));
        if (res) { numerators = await retry(() => pub.readContract({ address: win.market, abi: MARKET_ABI, functionName: "payoutNumerators" })); break; }
      } catch (e) {}
      await sleep(10000);
    }
    if (!numerators.length) { console.log("window did not resolve in time — continuing"); continue; }
    console.log("resolved, payoutNumerators =", numerators.map(String));
    const noWon = numerators.length >= 2 && numerators[1] > 0n;
    if (!noWon) { console.log(`YES won — NO hedge expired (premium ${Number(spent) / 1e6} USDC = insurance cost). Next window.`); continue; }

    // NO won — redeem exactly what the vault holds.
    const outcomeId = (BigInt(win.pool) << 72n) | (BigInt(nonce) << 8n) | 1n;
    const holdings = await retry(() => pub.readContract({ address: OUTCOME_TOKEN, abi: ERC6909_ABI, functionName: "balanceOf", args: [VAULT, outcomeId] }));
    console.log(`NO WON. vault holds ${holdings} NO tokens (outcomeId ${outcomeId})`);
    if (holdings === 0n) { console.log("no holdings — order may not have filled; continuing"); continue; }
    await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualRedeem", args: [1, holdings] }) }, "brain.manualRedeem");
    console.log(`\nMILESTONE COMPLETE: vault placed a real order on window #${win.id} and redeemed ${holdings} NO tokens (payout ~${Number(holdings) / 1e6} USDC vs premium ${Number(spent) / 1e6} USDC).`);
    process.exit(0);
  }
  console.log(`no NO-win across ${MAX_WINDOWS} windows — rerun the script`);
  process.exit(1);
}

main().catch((e) => { console.error("FAILED:", e.shortMessage || e.message); if (e.details) console.error(e.details); process.exit(1); });
