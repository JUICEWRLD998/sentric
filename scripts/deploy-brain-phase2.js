// Phase 2 deploy: SentricBrain (reactivity + on-chain AI cycle) via viem.
// Recovers the Phase-1 brain's reserve first (disarm + sweep), then deploys,
// configures agentIds + JSON params, and arms with 33 STT.
// Usage: node scripts/deploy-brain-phase2.js [bytecodePath]
// Env: SOMNIA_RPC_URL, DEPLOYER_PRIVATE_KEY, AGENT_JSON_API_ID, AGENT_LLM_ID,
//      JSON_URL, JSON_SELECTOR, JSON_DECIMALS (see .env.example)
const { createWalletClient, createPublicClient, http, getContractAddress, encodeFunctionData } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const fs = require("fs");

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const BYTECODE_PATH = process.argv[2] || "C:/Users/fadhm/AppData/Local/Temp/brain-phase2.bytecode";
const BRAIN_BYTECODE = "0x" + fs.readFileSync(BYTECODE_PATH, "utf8").trim().replace(/^0x/, "");
const PLATFORM = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776"; // Somnia Agents, testnet
const OLD_BRAIN = "0x213714e59e6e70946d45bd6a534229d0d9165f76"; // Phase-1 brain (reserve recovery)

const chain = {
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const ABI = [
  { inputs: [], name: "isSubscribed", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "subscriptionId", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "cycleEnabled", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "state", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "uint256" }, { type: "uint256" }], name: "setAgentIds", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "string" }, { type: "string" }, { type: "uint8" }], name: "setJsonParams", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "bool" }], name: "setFetchMode", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "uint256" }, { type: "uint256" }], name: "setAgentFees", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "arm", outputs: [], stateMutability: "payable", type: "function" },
  { inputs: [], name: "disarm", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "sweep", outputs: [], stateMutability: "nonpayable", type: "function" },
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
  const url = process.env.JSON_URL || "https://api-pub.bitfinex.com/v2/candles/trade:1D:tBTCUSD/last";
  const selector = process.env.JSON_SELECTOR || "";
  const decimals = Number(process.env.JSON_DECIMALS || "8");
  const arrayMode = (process.env.FETCH_MODE || "array") === "array";
  if (jsonId === 0n || llmId === 0n) throw new Error("set AGENT_JSON_API_ID and AGENT_LLM_ID");
  console.log("jsonAgentId:", jsonId.toString(), "llmAgentId:", llmId.toString());
  console.log("json params:", url, "|", JSON.stringify(selector), "|", decimals, "| arrayMode:", arrayMode);

  // 1. Recover the Phase-1 brain reserve (disarm -> sweep) if it still holds funds.
  const oldSub = await pub.readContract({ address: OLD_BRAIN, abi: ABI, functionName: "isSubscribed" });
  if (oldSub) {
    console.log("disarming old brain", OLD_BRAIN);
    await wait(
      await wallet.sendTransaction({ to: OLD_BRAIN, data: encodeFunctionData({ abi: ABI, functionName: "disarm" }) }),
      "disarm old"
    );
  }
  const oldBal = await pub.getBalance({ address: OLD_BRAIN });
  if (oldBal > 0n) {
    console.log("sweeping old brain balance:", oldBal.toString());
    await wait(
      await wallet.sendTransaction({ to: OLD_BRAIN, data: encodeFunctionData({ abi: ABI, functionName: "sweep" }) }),
      "sweep old"
    );
  }

  // 2. Deploy the Phase-2 brain.
  const nonce = await pub.getTransactionCount({ address: account.address });
  const predicted = getContractAddress({ from: account.address, nonce });
  console.log("predicted brain:", predicted);
  const dep = await wait(await wallet.sendTransaction({ data: BRAIN_BYTECODE }), "deploy brain");
  const brain = dep.contractAddress;
  console.log("SentricBrain (phase 2) at:", brain);

  // 3. Configure (before arming so the first tick is enabled) + arm with 33 STT.
  await wait(
    await wallet.sendTransaction({ to: brain, data: encodeFunctionData({ abi: ABI, functionName: "setAgentIds", args: [jsonId, llmId] }) }),
    "setAgentIds"
  );
  await wait(
    await wallet.sendTransaction({ to: brain, data: encodeFunctionData({ abi: ABI, functionName: "setJsonParams", args: [url, selector, decimals] }) }),
    "setJsonParams"
  );
  await wait(
    await wallet.sendTransaction({ to: brain, data: encodeFunctionData({ abi: ABI, functionName: "setFetchMode", args: [arrayMode] }) }),
    "setFetchMode"
  );
  await wait(
    await wallet.sendTransaction({ to: brain, value: 33n * 10n ** 18n, data: encodeFunctionData({ abi: ABI, functionName: "arm" }) }),
    "arm"
  );

  const sub = await pub.readContract({ address: brain, abi: ABI, functionName: "isSubscribed" });
  const sid = await pub.readContract({ address: brain, abi: ABI, functionName: "subscriptionId" });
  const enabled = await pub.readContract({ address: brain, abi: ABI, functionName: "cycleEnabled" });
  console.log("isSubscribed:", sub, "subscriptionId:", sid.toString(), "cycleEnabled:", enabled);
  console.log("brain balance:", (await pub.getBalance({ address: brain })).toString());
  console.log("PHASE2_BRAIN=" + brain);
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  if (e.details) console.error(e.details);
  process.exit(1);
});
