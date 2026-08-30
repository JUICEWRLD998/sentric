// Fire ONE inferNumber with the improved confidence prompt (decision embedded)
// against the still-deployed TestRequester, to confirm a non-degenerate score.
// Usage: node scripts/test-confidence.js <testRequester> <decision>
const { createWalletClient, createPublicClient, http, encodeFunctionData } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const TR = process.argv[2];
const DECISION = process.argv[3] || "HOLD";
const LLM_AGENT = 12847293847561029384n;
const PRICE = "79159.00";
const CHANGE = "+1.17";
const VOL = "+1.87";

const chain = { id: 50312, name: "Somnia Testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const TR_ABI = [
  { inputs: [{ type: "uint256" }, { type: "bytes" }], name: "request", outputs: [{ type: "uint256" }], stateMutability: "payable", type: "function" },
  { inputs: [], name: "lastRequestId", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastStatus", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastResult", outputs: [{ type: "bytes" }], stateMutability: "view", type: "function" },
];
const INFER_NUMBER_ABI = [{ name: "inferNumber", type: "function", inputs: [{ type: "string" }, { type: "string" }, { type: "int256" }, { type: "int256" }, { type: "bool" }], outputs: [{ type: "int256" }] }];

async function main() {
  const prompt = `You decided: ${DECISION}. Given: BTC price $${PRICE}, 24h change ${CHANGE}%, intraday range ${VOL}%. How confident (0-100) are you in this decision? Return only the number.`;
  const payload = encodeFunctionData({ abi: INFER_NUMBER_ABI, functionName: "inferNumber", args: [prompt, "You are a deterministic risk scorer. Output only an integer between 0 and 100.", 0, 100, false] });
  const prev = await pub.readContract({ address: TR, abi: TR_ABI, functionName: "lastRequestId" });
  const tx = await wallet.sendTransaction({ to: TR, value: 240000000000000000n, data: encodeFunctionData({ abi: TR_ABI, functionName: "request", args: [LLM_AGENT, payload] }) });
  await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  const start = Date.now();
  while (Date.now() - start < 420_000) {
    const [rid, st] = await Promise.all([
      pub.readContract({ address: TR, abi: TR_ABI, functionName: "lastRequestId" }),
      pub.readContract({ address: TR, abi: TR_ABI, functionName: "lastStatus" }),
    ]);
    if (rid !== prev) {
      const result = await pub.readContract({ address: TR, abi: TR_ABI, functionName: "lastResult" });
      console.log("status:", ["None", "Pending", "Success", "Failed", "TimedOut"][Number(st)], "requestId:", rid.toString(), "elapsed:", ((Date.now() - start) / 1000).toFixed(0) + "s");
      if (Number(st) !== 2) throw new Error("request failed");
      const hex = result.slice(2);
      let v = BigInt("0x" + hex.slice(0, 64));
      if (v >= 1n << 255n) v -= 1n << 256n;
      console.log("PROMPT:", prompt);
      console.log("CONFIDENCE:", v.toString());
      if (v === 0n) { console.log("WARN: still 0 — prompt needs more work"); process.exitCode = 1; }
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("timeout");
}

main().catch((e) => { console.error("FAILED:", e.shortMessage || e.message); process.exit(1); });
