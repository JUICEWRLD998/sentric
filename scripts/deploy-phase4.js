// Phase 4 deploy: SentricVault v2 + SentricBrain v4, wired, funded and ARMED
// (33 STT reactivity reserve — the autonomous epoch loop starts at arm()).
// Usage: node scripts/deploy-phase4.js [brainBytecodePath] [vaultBytecodePath]
// Env (see .env): SOMNIA_RPC_URL, DEPLOYER_PRIVATE_KEY, AGENT_JSON_API_ID,
//   AGENT_LLM_ID, JSON_URL (default Bitfinex 5m candle — recent-move feed),
//   POOL_ADDRESS, MARKET_ID, EXPOSURE_NOTIONAL, MAX_PREMIUM, MAX_DAILY_PREMIUM,
//   EXPECTED_MOVE_BPS, DOWN_PRICE_BPS.
const { createWalletClient, createPublicClient, http, getContractAddress, encodeFunctionData, encodeAbiParameters } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const fs = require("fs");
const path = require("path");
// Minimal .env loader.
try {
  const envPath = path.join(__dirname, "..", ".env");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch (e) {}

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const BRAIN_PATH = process.argv[2] || "C:/Users/fadhm/AppData/Local/Temp/brain-phase4.bytecode";
const VAULT_PATH = process.argv[3] || "C:/Users/fadhm/AppData/Local/Temp/vault-phase4.bytecode";
const PLATFORM = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776"; // agents platform
const SETTLEMENT = "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23"; // BinarySettlement
const TUSDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E"; // collateral
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

const BRAIN_CREATION = "0x" + fs.readFileSync(BRAIN_PATH, "utf8").trim().replace(/^0x/, "");
const VAULT_CREATION = "0x" + fs.readFileSync(VAULT_PATH, "utf8").trim().replace(/^0x/, "");
// SentricBrain(IAgentRequester platform) constructor arg
const BRAIN_BYTECODE = BRAIN_CREATION + encodeAbiParameters([{ type: "address" }], [PLATFORM]).slice(2);

const BRAIN_ABI = [
  { inputs: [], name: "arm", outputs: [], stateMutability: "payable", type: "function" },
  { inputs: [{ type: "uint256" }, { type: "uint256" }], name: "setAgentIds", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "string" }, { type: "string" }, { type: "uint8" }], name: "setJsonParams", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "bool" }], name: "setFetchMode", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], name: "setHedgeConfig", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "isSubscribed", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "cycleEnabled", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
];
const VAULT_ABI = [
  { inputs: [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "bytes32" }], name: "setVenue", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "uint256" }], name: "setMaxPremiumPerWindow", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "uint256" }], name: "setMaxDailyPremium", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "uint256" }], name: "approvePool", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }], name: "setOutcomeToken", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "grantSettlementOperator", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }], name: "transferOwnership", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "owner", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
];
const TUSDC_ABI = [
  { inputs: [{ type: "uint256" }], name: "faucet", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }, { type: "uint256" }], name: "transfer", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];

async function wait(hash, label) {
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`${label}: ${hash} status=${r.status} gasUsed=${r.gasUsed} block=${r.blockNumber}`);
  if (r.status !== "success") throw new Error(`${label} REVERTED`);
  return r;
}

async function main() {
  const jsonId = BigInt(process.env.AGENT_JSON_API_ID || "0");
  const llmId = BigInt(process.env.AGENT_LLM_ID || "0");
  const url = process.env.JSON_URL || "https://api-pub.bitfinex.com/v2/candles/trade:5m:tBTCUSD/last";
  const selector = process.env.JSON_SELECTOR || "";
  const decimals = Number(process.env.JSON_DECIMALS || "8");
  const arrayMode = (process.env.FETCH_MODE || "array") === "array";
  const pool = process.env.POOL_ADDRESS;
  const marketId = process.env.MARKET_ID; // bytes32 hex
  const exposure = BigInt(process.env.EXPOSURE_NOTIONAL || "1000000000000"); // 1M USDC
  const maxPremium = BigInt(process.env.MAX_PREMIUM || "10000000"); // 10 USDC/window
  const maxDaily = BigInt(process.env.MAX_DAILY_PREMIUM || "500000000"); // 500 USDC/day
  const moveBps = BigInt(process.env.EXPECTED_MOVE_BPS || "200");
  const downBps = BigInt(process.env.DOWN_PRICE_BPS || "4500");
  if (jsonId === 0n || llmId === 0n) throw new Error("set AGENT_JSON_API_ID and AGENT_LLM_ID");
  if (!pool || !marketId) throw new Error("set POOL_ADDRESS and MARKET_ID");
  console.log("pool:", pool, "marketId:", marketId);
  console.log("feed:", url, "| hedge: exposure", exposure.toString(), "maxPremium", maxPremium.toString(), "maxDaily", maxDaily.toString(), "moveBps", moveBps.toString(), "downBps", downBps.toString());

  // 1. Deploy vault, then brain.
  const depV = await wait(await wallet.sendTransaction({ data: VAULT_CREATION }), "deploy vault");
  const vault = depV.contractAddress;
  console.log("SentricVault v2 at:", vault);

  const nonce = await pub.getTransactionCount({ address: account.address });
  console.log("predicted brain:", getContractAddress({ from: account.address, nonce }));
  const depB = await wait(await wallet.sendTransaction({ data: BRAIN_BYTECODE }), "deploy brain");
  const brain = depB.contractAddress;
  console.log("SentricBrain v4 at:", brain);

  // 2. Vault config: venue + caps + approvals + ERC-6909 operator.
  await wait(await wallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "setVenue", args: [pool, SETTLEMENT, TUSDC, marketId] }) }), "vault.setVenue");
  await wait(await wallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "setMaxPremiumPerWindow", args: [maxPremium] }) }), "vault.setMaxPremium");
  await wait(await wallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "setMaxDailyPremium", args: [maxDaily] }) }), "vault.setMaxDailyPremium");
  await wait(await wallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "approvePool", args: [2n ** 256n - 1n] }) }), "vault.approvePool");
  await wait(await wallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "setOutcomeToken", args: [OUTCOME_TOKEN] }) }), "vault.setOutcomeToken");
  await wait(await wallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "grantSettlementOperator", args: [] }) }), "vault.grantSettlementOperator");

  // 3. Mint tUSDC + fund the vault.
  await wait(await wallet.sendTransaction({ to: TUSDC, data: encodeFunctionData({ abi: TUSDC_ABI, functionName: "faucet", args: [10000n * 10n ** 6n] }) }), "tUSDC faucet");
  const bal = await pub.readContract({ address: TUSDC, abi: TUSDC_ABI, functionName: "balanceOf", args: [account.address] });
  console.log("deployer tUSDC:", bal.toString());
  await wait(await wallet.sendTransaction({ to: TUSDC, data: encodeFunctionData({ abi: TUSDC_ABI, functionName: "transfer", args: [vault, bal] }) }), "fund vault");

  // 4. Brain config + ownership wiring.
  await wait(await wallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "transferOwnership", args: [brain] }) }), "vault.owner=brain");
  await wait(await wallet.sendTransaction({ to: brain, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "setAgentIds", args: [jsonId, llmId] }) }), "brain.setAgentIds");
  await wait(await wallet.sendTransaction({ to: brain, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "setJsonParams", args: [url, selector, decimals] }) }), "brain.setJsonParams");
  await wait(await wallet.sendTransaction({ to: brain, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "setFetchMode", args: [arrayMode] }) }), "brain.setFetchMode");
  await wait(await wallet.sendTransaction({ to: brain, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "setHedgeConfig", args: [vault, exposure, maxPremium, moveBps, downBps] }) }), "brain.setHedgeConfig");

  // 5. Arm the brain (33 STT reserve) — the autonomous epoch loop starts here.
  //    Set SKIP_ARM=1 to deploy unarmed (manualHedgeNow/manualRedeem still
  //    work; arming needs the >= 32 STT precompile reserve).
  if (process.env.SKIP_ARM !== "1") {
    await wait(await wallet.sendTransaction({ to: brain, value: 33n * 10n ** 18n, data: encodeFunctionData({ abi: BRAIN_ABI, functionName: "arm" }) }), "brain.arm");
    console.log("brain ARMED — autonomous epoch loop is live.");
  } else {
    console.log("SKIP_ARM=1 — brain deployed but NOT subscribed (needs >= 32 STT reserve).");
  }

  console.log("PHASE4_VAULT=" + vault);
  console.log("PHASE4_BRAIN=" + brain);
  console.log("next: node scripts/track-equity.js " + vault + " 3600   (watch the loop)");
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  if (e.details) console.error(e.details);
  process.exit(1);
});
