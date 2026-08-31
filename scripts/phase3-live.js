// Phase 3 live milestone driver: hedge -> wait for settlement -> redeem.
// Usage: node scripts/phase3-live.js <brain> <vault> [maxWaitSec]
// Env (see .env): SOMNIA_RPC_URL, DEPLOYER_PRIVATE_KEY (brain/vault owner).
// Flow:
//   1. brain.manualHedge()  -> vault.placeHedge (BUY_NO market order on the
//      configured BinaryPool). Prints the order tx + premium.
//   2. Poll the market until it resolves (auto via Somnia reactivity).
//   3. If NO won -> brain.manualRedeem(1, holdings) and print the payout.
//      If YES won -> the hedge expired worthless (that IS the insurance cost);
//      re-run this script on the next window to show a redemption.
// Explorer: https://shannon-explorer.somnia.network/tx/<hash>
const { createWalletClient, createPublicClient, http, encodeFunctionData } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const [BRAIN, VAULT, MAX_WAIT = "1500"] = process.argv.slice(2);
if (!BRAIN || !VAULT) {
  console.error("usage: node scripts/phase3-live.js <brain> <vault> [maxWaitSec]");
  process.exit(1);
}
const MAX_WAIT_SEC = Number(MAX_WAIT);

const OUTCOME_TOKEN = "0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9"; // ERC-6909 singleton

const chain = {
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const BRAIN_ABI = [
  { inputs: [], name: "manualHedge", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "uint8" }, { type: "uint256" }], name: "manualRedeem", outputs: [{ type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "vault", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "owner", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "exposureNotional", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "maxPremiumPerWindow", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "expectedMoveBps", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "downPriceBps", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];
const VAULT_ABI = [
  { inputs: [], name: "pool", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "owner", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "marketNonce", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastOrderId", outputs: [{ type: "uint128" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "windowPremiumSpent", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], name: "sizeHedge", outputs: [{ type: "uint256" }], stateMutability: "pure", type: "function" },
  { inputs: [], name: "collateral", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
];
const POOL_ABI = [
  { inputs: [], name: "market", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "marketExpiryNs", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "marketNonce", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
];
const MARKET_ABI = [
  { inputs: [], name: "isResolved", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "payoutNumerators", outputs: [{ type: "uint256[]" }], stateMutability: "view", type: "function" },
];
const ERC6909_ABI = [
  { inputs: [{ type: "address" }, { type: "uint256" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];

async function send(tx, label) {
  const hash = await wallet.sendTransaction({ ...tx, maxFeePerGas: 20n * 10n ** 9n, maxPriorityFeePerGas: 10n ** 8n });
  console.log(`${label}: ${hash}  https://shannon-explorer.somnia.network/tx/${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`  status=${r.status} gasUsed=${r.gasUsed} block=${r.blockNumber}`);
  if (r.status !== "success") throw new Error(`${label} REVERTED`);
  return r;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [brainOwner, vaultOwner, brainVault] = await Promise.all([
    pub.readContract({ address: BRAIN, abi: BRAIN_ABI, functionName: "owner" }),
    pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "owner" }),
    pub.readContract({ address: BRAIN, abi: BRAIN_ABI, functionName: "vault" }),
  ]);
  console.log("brain owner:", brainOwner, "| vault owner:", vaultOwner, "| brain.vault:", brainVault);
  if (vaultOwner.toLowerCase() !== BRAIN.toLowerCase()) throw new Error("vault.owner != brain — rewire first");
  if (brainVault.toLowerCase() !== VAULT.toLowerCase()) throw new Error("brain.vault != vault address");
  if (brainOwner.toLowerCase() !== account.address.toLowerCase()) throw new Error("brain.owner != deployer — cannot drive manualHedge");

  // 1. Place the hedge (BUY_NO market order via the vault).
  await send({ to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualHedge" }) }, "brain.manualHedge");

  const [pool, nonce, orderId, premium, exposure, maxPremium, moveBps, downBps] = await Promise.all([
    pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "pool" }),
    pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "marketNonce" }),
    pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "lastOrderId" }),
    pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "windowPremiumSpent" }),
    pub.readContract({ address: BRAIN, abi: BRAIN_ABI, functionName: "exposureNotional" }),
    pub.readContract({ address: BRAIN, abi: BRAIN_ABI, functionName: "maxPremiumPerWindow" }),
    pub.readContract({ address: BRAIN, abi: BRAIN_ABI, functionName: "expectedMoveBps" }),
    pub.readContract({ address: BRAIN, abi: BRAIN_ABI, functionName: "downPriceBps" }),
  ]);
  console.log(`hedge placed: pool=${pool} orderId=${orderId} nonce=${nonce} premiumRaw=${premium} (${Number(premium) / 1e6} USDC)`);
  console.log(`sizing knobs: exposure=${exposure} maxPremium=${maxPremium} moveBps=${moveBps} downBps=${downBps}`);

  const market = await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "market" });
  const expiry = await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "marketExpiryNs" });
  console.log(`market=${market} expiryNs=${expiry} (${new Date(Number(expiry) / 1e6).toISOString()})`);

  // Expected qty the brain placed (same formula as _executeHedge).
  const downPrice = (BigInt(downBps) * 10n ** 18n) / 10000n;
  const size = await pub.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "sizeHedge", args: [exposure, downPrice, maxPremium, moveBps] });
  const qtyRaw = (size / 10n ** 6n) * 10n ** 6n;
  console.log(`expected qty: size=${size} -> ${qtyRaw} raw (${Number(qtyRaw) / 1e6} tokens)`);

  // 2. Wait for settlement (auto via reactivity; no keeper needed).
  const deadline = Date.now() + MAX_WAIT_SEC * 1000;
  let resolved = false;
  let numerators = [];
  while (Date.now() < deadline) {
    try {
      const r = await pub.readContract({ address: market, abi: MARKET_ABI, functionName: "isResolved" });
      if (r) {
        numerators = await pub.readContract({ address: market, abi: MARKET_ABI, functionName: "payoutNumerators" });
        resolved = true;
        break;
      }
    } catch (e) {
      console.log("  (poll error, retrying:", (e.shortMessage || e.message).slice(0, 80) + ")");
    }
    await sleep(15000);
  }
  if (!resolved) throw new Error(`market ${market} did not resolve within ${MAX_WAIT_SEC}s — check the explorer`);
  console.log("resolved. payoutNumerators =", numerators.map(String));

  const noWon = numerators.length >= 2 && numerators[1] > 0n;
  if (!noWon) {
    console.log("OUTCOME: YES won — the NO hedge expired worthless (premium = the insurance cost).");
    console.log("Re-run on the next window to show a redemption, or the vault is still protected if BTC dumps.");
    return;
  }

  // 3. Redeem: burn exactly what we hold (handles partial IOC fills).
  const outcomeId = (BigInt(pool) << 72n) | (BigInt(nonce) << 8n) | 1n; // NO side
  const holdings = await pub.readContract({ address: OUTCOME_TOKEN, abi: ERC6909_ABI, functionName: "balanceOf", args: [VAULT, outcomeId] });
  console.log(`NO won. vault holds ${holdings} outcome tokens (outcomeId ${outcomeId})`);
  if (holdings === 0n) {
    console.log("no tokens to redeem (order was not filled?) — nothing to do");
    return;
  }
  const out = await send(
    { to: BRAIN, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "manualRedeem", args: [1, holdings] }) },
    "brain.manualRedeem"
  );
  console.log(`redeemed ${holdings} NO tokens; tx ${out.transactionHash}`);
  console.log("MILESTONE: order placed + settled position redeemed — both txs on the explorer above.");
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  if (e.details) console.error(e.details);
  process.exit(1);
});
