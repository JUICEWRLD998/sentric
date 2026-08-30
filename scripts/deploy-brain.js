// Deploy SentricBrain + arm via viem (bypasses forge script RPC quirks).
const { createWalletClient, createPublicClient, http, getContractAddress } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const fs = require("fs");

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const BRAIN_BYTECODE = "0x" + fs.readFileSync(process.argv[2] || "C:/Users/fadhm/AppData/Local/Temp/brain.bytecode", "utf8").trim().replace(/^0x/, "");

const chain = {
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const ARM_SELECTOR = "0x370419e5"; // arm()
const ABI = [
  { inputs: [], name: "isSubscribed", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "subscriptionId", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "owner", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
];

async function main() {
  const deployer = account.address;
  const nonce = await pub.getTransactionCount({ address: deployer });
  const predicted = getContractAddress({ from: deployer, nonce });
  console.log("deployer:", deployer, "nonce:", nonce);
  console.log("predicted SentricBrain address:", predicted);

  console.log("sending deploy tx...");
  const deployHash = await wallet.sendTransaction({ data: BRAIN_BYTECODE });
  console.log("deploy tx:", deployHash);
  const dep = await pub.waitForTransactionReceipt({ hash: deployHash, timeout: 120_000 });
  console.log("deploy status:", dep.status, "gasUsed:", dep.gasUsed.toString());
  if (dep.status !== "success") throw new Error("deploy reverted");
  const brain = dep.contractAddress;
  console.log("SentricBrain deployed at:", brain);
  console.log("balance:", (await pub.getBalance({ address: brain })).toString(), "wei");

  console.log("sending arm() with 33 STT...");
  const armHash = await wallet.sendTransaction({ to: brain, value: 33n * 10n ** 18n, data: ARM_SELECTOR });
  console.log("arm tx:", armHash);
  const arm = await pub.waitForTransactionReceipt({ hash: armHash, timeout: 120_000 });
  console.log("arm status:", arm.status, "gasUsed:", arm.gasUsed.toString());
  if (arm.status !== "success") throw new Error("arm reverted: " + JSON.stringify(arm));

  const isSubscribed = await pub.readContract({ address: brain, abi: ABI, functionName: "isSubscribed" });
  const subId = await pub.readContract({ address: brain, abi: ABI, functionName: "subscriptionId" });
  console.log("isSubscribed:", isSubscribed, "subscriptionId:", subId.toString());
  console.log("brain balance:", (await pub.getBalance({ address: brain })).toString(), "wei");
  console.log("BRAIN_ADDRESS=" + brain);
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  if (e.details) console.error("details:", e.details);
  process.exit(1);
});
