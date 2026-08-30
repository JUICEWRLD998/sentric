// Arm the deployed Phase-2 brain with 33 STT (reactivity reserve + gas).
// Usage: node scripts/arm-brain.js <brainAddress>
// Env: SOMNIA_RPC_URL, DEPLOYER_PRIVATE_KEY
const { createWalletClient, createPublicClient, http, encodeFunctionData } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const BRAIN = process.argv[2];
if (!BRAIN) throw new Error("usage: node scripts/arm-brain.js <brainAddress>");

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
  { inputs: [], name: "arm", outputs: [], stateMutability: "payable", type: "function" },
  { inputs: [], name: "isSubscribed", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "subscriptionId", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "cycleEnabled", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
];

async function main() {
  const bal = await pub.getBalance({ address: account.address });
  console.log("deployer balance:", bal.toString(), "wei =", Number(bal) / 1e18, "STT");
  if (bal < 33200000000000000000n) {
    throw new Error("deployer needs >= 33.2 STT to fund the reserve + gas");
  }
  console.log("arming brain", BRAIN, "with 33 STT...");
  const hash = await wallet.sendTransaction({
    to: BRAIN,
    value: 33n * 10n ** 18n,
    data: encodeFunctionData({ abi: ABI, functionName: "arm" }),
  });
  const rec = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log("arm tx:", hash, "status:", rec.status, "block:", rec.blockNumber);
  if (rec.status !== "success") throw new Error("arm REVERTED");
  const sub = await pub.readContract({ address: BRAIN, abi: ABI, functionName: "isSubscribed" });
  const sid = await pub.readContract({ address: BRAIN, abi: ABI, functionName: "subscriptionId" });
  console.log("isSubscribed:", sub, "subscriptionId:", sid.toString());
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  process.exit(1);
});
