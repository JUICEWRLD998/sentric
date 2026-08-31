// Phase-4 equity tracker: polls the SentricVault every 20s, appends one CSV
// line per poll to docs/phase4-equity.csv, prints a SUMMARY on completion.
// Usage: node scripts/track-equity.js [vaultAddress] [seconds]
//   defaults: vault 0x5985d3a5321704f352c0753562a09b05762eb4a6, 3600s.
// Read-only: no transactions, no private keys. Env: SOMNIA_RPC_URL (.env).
const fs = require("fs");
const path = require("path");
try {
  const envPath = path.join(__dirname, "..", ".env");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch (e) {}

const { createPublicClient, http } = require("viem");

const RPC = process.env.SOMNIA_RPC_URL;
if (!RPC) {
  console.error("SOMNIA_RPC_URL missing from .env");
  process.exit(1);
}
const [VAULT_ARG, SECONDS_ARG] = process.argv.slice(2);
const VAULT = (VAULT_ARG || "0x5985d3a5321704f352c0753562a09b05762eb4a6").toLowerCase();
const DURATION_SEC = Number(SECONDS_ARG || "3600");
const POLL_MS = 20000;

const tUSDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E"; // 6 decimals
const OUTCOME_TOKEN = "0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9"; // ERC-6909 singleton
const CSV_PATH = path.join(__dirname, "..", "docs", "phase4-equity.csv");
const ONE_USDC = 1000000n; // raw 1e6 = 1 USDC (no 1e18 anywhere)

const chain = {
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const VAULT_ABI = [
  { inputs: [], name: "pool", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "collateral", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "marketNonce", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastOrderId", outputs: [{ type: "uint128" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "windowPremiumSpent", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];
const ERC20_ABI = [
  { inputs: [{ type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];
const ERC6909_ABI = [
  { inputs: [{ type: "address" }, { type: "uint256" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];
const POOL_ABI = [
  { inputs: [{ type: "bool" }, { type: "uint64" }], name: "getBookLevels", outputs: [{ type: "tuple[]", components: [{ type: "uint256" }, { type: "uint256" }] }], stateMutability: "view", type: "function" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every RPC call: try/catch with retry (up to 3, 1.5s apart). Caller decides
// whether a failure is fatal (skip poll) or tolerable (empty book).
const retry = async (fn, n = 3) => {
  let last;
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(1500);
    }
  }
  throw last;
};

const records = [];

function ensureHeader() {
  if (fs.existsSync(CSV_PATH) && fs.statSync(CSV_PATH).size > 0) return;
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, "ts,block,tusdcBalance,noHoldingsRaw,noMidPriceRaw,equityRaw,windowPremiumSpent,marketNonce,lastOrderId\n");
}

async function pollOnce() {
  const ts = Date.now();
  // 1. Block + vault identity (pool, nonce) — everything else derives from these.
  const [block, pool, marketNonce] = await Promise.all([
    retry(() => pub.getBlockNumber()),
    retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "pool" })),
    retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "marketNonce" })),
  ]);

  // 2. NO outcome id for the CURRENT pool+nonce: (uint160(pool)<<72)|(nonce<<8)|1.
  const noOutcomeId = (BigInt(pool) << 72n) | (marketNonce << 8n) | 1n;

  // 3. Balances + vault state.
  const [tusdcBalance, noHoldingsRaw, windowPremiumSpent, lastOrderId] = await Promise.all([
    retry(() => pub.readContract({ address: tUSDC, abi: ERC20_ABI, functionName: "balanceOf", args: [VAULT] })),
    retry(() => pub.readContract({ address: OUTCOME_TOKEN, abi: ERC6909_ABI, functionName: "balanceOf", args: [VAULT, noOutcomeId] })),
    retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "windowPremiumSpent" })),
    retry(() => pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "lastOrderId" })),
  ]);

  // 4. Book: best NO = 1e6 - bestYesAsk; else 1e6 - bestYesBid. Empty book is
  //    tolerable (mid = 0) and a failure here never kills the poll.
  let yesAsks = [];
  let yesBids = [];
  try {
    yesAsks = await retry(() => pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getBookLevels", args: [false, 1n] }));
  } catch (e) {
    console.log("  (book YES-asks read failed, treating as empty)");
  }
  try {
    yesBids = await retry(() => pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getBookLevels", args: [true, 1n] }));
  } catch (e) {
    console.log("  (book YES-bids read failed, treating as empty)");
  }
  let noMidPriceRaw = 0n;
  if (yesAsks.length && yesAsks[0][0] > 0n) noMidPriceRaw = ONE_USDC - yesAsks[0][0];
  else if (yesBids.length && yesBids[0][0] > 0n) noMidPriceRaw = ONE_USDC - yesBids[0][0];

  const equityRaw = tusdcBalance + (noHoldingsRaw * noMidPriceRaw) / ONE_USDC;

  const rec = {
    ts,
    block: block.toString(),
    tusdcBalance: tusdcBalance.toString(),
    noHoldingsRaw: noHoldingsRaw.toString(),
    noMidPriceRaw: noMidPriceRaw.toString(),
    equityRaw: equityRaw.toString(),
    windowPremiumSpent: windowPremiumSpent.toString(),
    marketNonce: marketNonce.toString(),
    lastOrderId: lastOrderId.toString(),
  };
  records.push(rec);

  const line = `${rec.ts},${rec.block},${rec.tusdcBalance},${rec.noHoldingsRaw},${rec.noMidPriceRaw},${rec.equityRaw},${rec.windowPremiumSpent},${rec.marketNonce},${rec.lastOrderId}`;
  fs.appendFileSync(CSV_PATH, line + "\n");
  console.log(
    `poll #${records.length} @${new Date(ts).toISOString()} block=${rec.block} ` +
    `equity=${(Number(equityRaw) / 1e6).toFixed(4)} USDC (tUSDC=${(Number(tusdcBalance) / 1e6).toFixed(4)} ` +
    `+ ${rec.noHoldingsRaw} NO @ ${(Number(noMidPriceRaw) / 1e6).toFixed(4)}) ` +
    `premium=${rec.windowPremiumSpent} nonce=${rec.marketNonce} order=${rec.lastOrderId}`
  );
}

function printSummary() {
  console.log("\n========== SUMMARY ==========");
  if (records.length < 2) {
    console.log(`only ${records.length} poll(s) captured — need >= 2 for a trend.`);
    return;
  }
  const eq = (r) => Number(r.equityRaw) / 1e6;
  const tusdc = (r) => Number(r.tusdcBalance) / 1e6;
  const start = records[0];
  const end = records[records.length - 1];
  const startEq = eq(start);
  const endEq = eq(end);
  const delta = endEq - startEq;

  // Peak + max drawdown % (from peak, over equityRaw).
  let peak = startEq;
  let maxDdPct = 0;
  for (const r of records) {
    const v = eq(r);
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = ((peak - v) / peak) * 100;
      if (dd > maxDdPct) maxDdPct = dd;
    }
  }

  const pollsHedged = records.filter((r) => Number(r.noHoldingsRaw) > 0).length;

  // Payout landed? equity jump > 0.5 USDC within one poll while noHoldings -> 0.
  let payout = null;
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1];
    const cur = records[i];
    if (Number(prev.noHoldingsRaw) > 0 && Number(cur.noHoldingsRaw) === 0) {
      const jumpEq = (Number(cur.equityRaw) - Number(prev.equityRaw)) / 1e6;
      const jumpTusdc = (Number(cur.tusdcBalance) - Number(prev.tusdcBalance)) / 1e6;
      if (jumpEq > 0.5 || jumpTusdc > 0.5) {
        payout = { poll: i, jumpEq, jumpTusdc, prevHoldings: prev.noHoldingsRaw };
      }
    }
  }

  console.log(`polls: ${records.length} over ${DURATION_SEC}s (every ${POLL_MS / 1000}s)`);
  console.log(`start equity : ${startEq.toFixed(4)} USDC  (tUSDC ${tusdc(start).toFixed(4)})`);
  console.log(`end equity   : ${endEq.toFixed(4)} USDC  (tUSDC ${tusdc(end).toFixed(4)})`);
  console.log(`equity delta : ${delta >= 0 ? "+" : ""}${delta.toFixed(4)} USDC`);
  console.log(`peak equity  : ${peak.toFixed(4)} USDC`);
  console.log(`max drawdown : ${maxDdPct.toFixed(2)}% from peak`);
  console.log(`polls with noHoldings > 0: ${pollsHedged}/${records.length}`);
  console.log(
    payout
      ? `payout landed: YES — poll #${payout.poll}: noHoldings ${payout.prevHoldings} -> 0, equity +${payout.jumpEq.toFixed(4)} USDC (tUSDC +${payout.jumpTusdc.toFixed(4)}) in one poll`
      : "payout landed: no (no NO->0 transition with an equity jump > 0.5 USDC within one poll)"
  );
  // Hedged vs unhedged: unhedged baseline = tUSDC alone; hedged = equityRaw.
  const unhedgedDelta = tusdc(end) - tusdc(start);
  console.log(
    `hedged vs unhedged: unhedged (tUSDC only) delta = ${unhedgedDelta >= 0 ? "+" : ""}${unhedgedDelta.toFixed(4)} USDC ` +
    `| hedged (equity incl. NO position) delta = ${delta >= 0 ? "+" : ""}${delta.toFixed(4)} USDC ` +
    `| NO position contributed ${((delta - unhedgedDelta) >= 0 ? "+" : "")}${(delta - unhedgedDelta).toFixed(4)} USDC`
  );
  console.log(`CSV: ${CSV_PATH} (${records.length} line(s) appended)`);
  console.log("==============================");
}

async function main() {
  ensureHeader();
  console.log(`track-equity: vault=${VAULT} duration=${DURATION_SEC}s poll=${POLL_MS / 1000}s rpc=${RPC}`);
  const endAt = Date.now() + DURATION_SEC * 1000;
  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
    console.log("\nSIGINT — stopping, printing summary.");
    printSummary();
    process.exit(0);
  });
  while (!interrupted && Date.now() < endAt) {
    try {
      await pollOnce();
    } catch (e) {
      console.log(`[skip] poll failed: ${(e.shortMessage || e.message).slice(0, 120)} — skipping this poll`);
    }
    if (!interrupted && Date.now() < endAt) await sleep(POLL_MS);
  }
  printSummary();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  if (e.details) console.error(e.details);
  process.exit(1);
});
