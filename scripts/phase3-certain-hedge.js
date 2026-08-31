// Phase 3 milestone driver (certain-win mode): watches the op-4 1-min BTC
// series, waits for a window where the outcome is nearly decided (BTC below
// strike -> P(Up) < P_UP_MAX), places the vault hedge in the final seconds,
// then redeems the settled NO position. Retries across windows until a
// redemption happens or WINDOW_LIMIT is hit.
// Usage: node scripts/phase3-certain-hedge.js <brain> <vault> [windowLimit] [pUpMax]
const { createWalletClient, createPublicClient, http, encodeFunctionData } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const [BRAIN, VAULT, WINDOW_LIMIT = "6", P_UP_MAX = "0.25"] = process.argv.slice(2);
if (!BRAIN || !VAULT) {
  console.error("usage: node scripts/phase3-certain-hedge.js <brain> <vault> [windowLimit] [pUpMax]");
  process.exit(1);
}
const MAX_P_UP = Number(P_UP_MAX);

const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388";
const OUTCOME_TOKEN = "0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9";

const chain = { id: 50312, name: "Somnia Testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const BRAIN_ABI = [
  { inputs: [], name: "manualHedge", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "uint8" }, { type: "uint256" }], name: "manualRedeem", outputs: [{ type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "bytes32" }], name: "manualSetVenue", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], name: "setHedgeConfig", outputs: [], stateMutability: "nonpayable", type: "function" },
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
const retry = async (fn, n = 5) => { let last; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { last = e; await sleep(1500); } } throw last; };

async function send(tx, label) {
  const hash = await wallet.sendTransaction({ ...tx, maxFeePerGas: 20n * 10n ** 9n, maxPriorityFeePerGas: 10n ** 8n });
  console.log(`${label}: ${hash}  https://shannon-explorer.somnia.network/tx/${hash}`);
  const r = await retry(() => pub.waitForTransactionReceipt({ hash, timeout: 120_000 }));
  console.log(`  status=${r.status} gasUsed=${r.gasUsed}`);
  if (r.status !== "success") throw new Error(`${label} REVERTED`);
  return r;
}

async function scanLive1min() {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const out = [];
  for (let id = 60350n; id <= 60600n; id++) {
    const key = "0x" + id.toString(16).padStart(64, "0");
    try {
      const r = await retry(() => pub.readContract({ address: MODULE, abi: MARKETS_ABI, functionName: "markets", args: [key] }));
      const windowSec = Number(r[13] - r[12]);
      if (r[13] > nowSec && windowSec <= 70 && windowSec >= 50) {
        // fresh 1-min window (op 4)
        let bids = [];
        try { bids = await retry(() => pub.readContract({ address: r[9], abi: POOL_ABI, functionName: "getBookLevels", args: [true, 2n] })); } catch (e) {}
        out.push({ id, pool: r[9], market: r[8], expiry: r[13], secsLeft: Number(r[13] - nowSec), bestYesBid: bids.length ? bids[0][0] : 0n });
      }
    } catch (e) {}
  }
  return out;
}

async function main() {
  for (let w = 0; w < Number(WINDOW_LIMIT); w++) {
    console.log(`\n=== attempt ${w + 1}/${WINDOW_LIMIT} — scanning for a fresh 1-min op-4 window (P(Up) < ${MAX_P_UP})`);
    let win;
    for (let s = 0; s < 12; s++) {
      const live = await scanLive1min();
      // prefer the window whose book already shows a decided-down outcome
      win = live.filter((x) => x.bestYesBid > 0n && x.bestYesBid < BigInt(Math.floor(MAX_P_UP * 1e6))).sort((a, b) => b.secsLeft - a.secsLeft)[0];
      if (win) {
        console.log(`candidate: id=${win.id} pool=${win.pool} P(Up)=${Number(win.bestYesBid) / 1e6} secsLeft=${win.secsLeft}`);
        break;
      }
      const liveAny = live.length ? live.map((x) => `#${x.id} PUp=${(Number(x.bestYesBid) / 1e6).toFixed(2)} s=${x.secsLeft}`).join(" ") : "none";
      console.log(`  scan ${s}: live 1-min: ${liveAny}`);
      await sleep(15000);
    }
    if (!win) { console.log("no favorable 1-min window seen this attempt; moving to next attempt"); continue; }

    // Strike at T-25s: refresh the book, then configure + hedge.
    const waitMs = Math.max(0, Number(win.secsLeft) - 25) * 1000;
    console.log(`waiting ${(waitMs / 1000).toFixed(0)}s to strike at T-25s of window ${win.id}`);
    await sleep(waitMs);

    let bids;
    for (let t = 0; t < 6; t++) {
      bids = await retry(() => pub.readContract({ address: win.pool, abi: POOL_ABI, functionName: "getBookLevels", args: [true, 2n] }));
      if (bids.length && bids[0][0] < BigInt(Math.floor(MAX_P_UP * 1e6))) break;
      console.log(`  P(Up) not low enough yet (${bids.length ? Number(bids[0][0]) / 1e6 : "empty"}), waiting 5s`);
      await sleep(5000);
    }
    if (!bids.length) { console.log("book empty — window may have closed; retry next window"); continue; }
    const yesBid = bids[0][0];
    const pUp = Number(yesBid) / 1e6;
    if (pUp >= MAX_P_UP) { console.log(`P(Up) ${pUp} still >= ${MAX_P_UP} at T-25s — skip this window`); continue; }
    const crossYes = yesBid - 1000n;
    const downBps = Number(1000000n - crossYes) / 100;
    console.log(`STRIKE: P(Up)=${pUp} -> cross yesPrice ${crossYes} -> downPriceBps=${downBps}`);

    // Re-point the vault (via the brain's owner proxy) + configure the brain.
    await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualSetVenue", args: [win.pool, "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23", "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E", "0x" + win.id.toString(16).padStart(64, "0")] }) }, "brain.manualSetVenue");
    await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "setHedgeConfig", args: [VAULT, 1000000000000n, 10000000n, 200n, BigInt(downBps)] }) }, "brain.setHedgeConfig");
    await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualHedge" }) }, "brain.manualHedge");

    const nonce = await retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "marketNonce" }));
    const spent = await retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "windowPremiumSpent" }));
    console.log(`hedge in window ${win.id}: nonce=${nonce} premiumRaw=${spent} (${Number(spent) / 1e6} USDC)`);

    // Wait for settlement.
    const deadline = Date.now() + 4 * 60 * 1000;
    let numerators = [];
    while (Date.now() < deadline) {
      try {
        const res = await retry(() => pub.readContract({ address: win.market, abi: MARKET_ABI, functionName: "isResolved" }));
        if (res) { numerators = await retry(() => pub.readContract({ address: win.market, abi: MARKET_ABI, functionName: "payoutNumerators" })); break; }
      } catch (e) {}
      await sleep(10000);
    }
    if (!numerators.length) { console.log("window did not resolve in time — inspect explorer"); continue; }
    console.log("resolved, payoutNumerators =", numerators.map(String));
    const noWon = numerators.length >= 2 && numerators[1] > 0n;
    if (!noWon) { console.log("YES won this window — NO hedge expired worthless. Retrying next window."); continue; }

    // Redeem.
    const outcomeId = (BigInt(win.pool) << 72n) | (BigInt(nonce) << 8n) | 1n;
    const holdings = await retry(() => pub.readContract({ address: OUTCOME_TOKEN, abi: ERC6909_ABI, functionName: "balanceOf", args: [VAULT, outcomeId] }));
    console.log(`NO WON. vault holds ${holdings} NO tokens (outcomeId ${outcomeId})`);
    if (holdings === 0n) { console.log("no holdings to redeem — check fill"); continue; }
    await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualRedeem", args: [1, holdings] }) }, "brain.manualRedeem");
    console.log(`\nMILESTONE COMPLETE: vault placed a real order on window ${win.id} and redeemed ${holdings} NO tokens.`);
    console.log(`payout ~= ${Number(holdings) / 1e6} USDC minus premium ${Number(spent) / 1e6} USDC`);
    process.exit(0);
  }
  console.log(`no NO-win redemption across ${WINDOW_LIMIT} windows — rerun the script`);
  process.exit(1);
}

main().catch((e) => { console.error("FAILED:", e.shortMessage || e.message); if (e.details) console.error(e.details); process.exit(1); });
