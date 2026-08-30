// Live validation of the Phase-2 agent pipeline against the REAL Somnia
// platform (testnet): json-fetch (Bitfinex candle array) -> llm-inference
// (constrained action) -> llm-inference (confidence 0-100).
// Deploys a TestRequester, fires each request with the exact payloads the
// SentricBrain builds, and prints the consensus-verified results.
// Usage: node scripts/test-agent-cycle.js
// Env: SOMNIA_RPC_URL, DEPLOYER_PRIVATE_KEY
const { createWalletClient, createPublicClient, http, encodeFunctionData, encodeAbiParameters } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const fs = require("fs");

const RPC = process.env.SOMNIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const PLATFORM = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776";
const JSON_AGENT = 13174292974160097713n; // json-fetch
const LLM_AGENT = 12847293847561029384n; // llm-inference
const BITFINEX = "https://api-pub.bitfinex.com/v2/candles/trade:1D:tBTCUSD/last";
const BYTECODE_PATH = process.argv[2] || "C:/Users/fadhm/AppData/Local/Temp/test-requester.bytecode";
const TEST_REQ = "0x" + fs.readFileSync(BYTECODE_PATH, "utf8").trim().replace(/^0x/, "") +
  encodeAbiParameters([{ type: "address" }], [PLATFORM]).slice(2);

const chain = {
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const TR_ABI = [
  { inputs: [{ type: "uint256" }, { type: "bytes" }], name: "request", outputs: [{ type: "uint256" }], stateMutability: "payable", type: "function" },
  { inputs: [], name: "lastRequestId", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastStatus", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastResult", outputs: [{ type: "bytes" }], stateMutability: "view", type: "function" },
];
const FETCH_ARRAY_ABI = [{ name: "fetchUintArray", type: "function", inputs: [{ type: "string" }, { type: "string" }, { type: "uint8" }], outputs: [{ type: "uint256[]" }] }];
const INFER_STRING_ABI = [{ name: "inferString", type: "function", inputs: [{ type: "string" }, { type: "string" }, { type: "bool" }, { type: "string[]" }], outputs: [{ type: "string" }] }];
const INFER_NUMBER_ABI = [{ name: "inferNumber", type: "function", inputs: [{ type: "string" }, { type: "string" }, { type: "int256" }, { type: "int256" }, { type: "bool" }], outputs: [{ type: "int256" }] }];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATUS = ["None", "Pending", "Success", "Failed", "TimedOut"];

async function waitForCallback(tr, prevId, label, timeoutMs = 420_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const [rid, st] = await Promise.all([
      pub.readContract({ address: tr, abi: TR_ABI, functionName: "lastRequestId" }),
      pub.readContract({ address: tr, abi: TR_ABI, functionName: "lastStatus" }),
    ]);
    if (rid !== prevId) {
      const result = await pub.readContract({ address: tr, abi: TR_ABI, functionName: "lastResult" });
      console.log(`${label}: status=${STATUS[Number(st)]} requestId=${rid} elapsed=${((Date.now() - start) / 1000).toFixed(0)}s`);
      return { status: Number(st), result, requestId: rid };
    }
    await sleep(10_000);
  }
  throw new Error(`${label}: TIMEOUT after ${timeoutMs / 1000}s`);
}

function decodeUintArray(bytes) {
  // viem returns the bytes; manual decode: dynamic array [offset, len, ...words]
  const hex = bytes.slice(2);
  const len = parseInt(hex.slice(64, 128), 16);
  const words = [];
  for (let i = 0; i < len; i++) {
    words.push(BigInt("0x" + hex.slice(128 + i * 64, 128 + (i + 1) * 64)));
  }
  return words;
}

function decodeString(bytes) {
  const hex = bytes.slice(2);
  const off = parseInt(hex.slice(0, 64), 16) * 2;
  const len = parseInt(hex.slice(off, off + 64), 16) * 2;
  return Buffer.from(hex.slice(off + 64, off + 64 + len), "hex").toString("utf8");
}

function decodeInt(bytes) {
  const hex = bytes.slice(2);
  const v = BigInt("0x" + hex.slice(0, 64));
  return v >= 1n << 255n ? v - (1n << 256n) : v;
}

function fmtBps(bps) {
  const neg = bps < 0n;
  const abs = neg ? -bps : bps;
  return `${neg ? "-" : "+"}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

async function main() {
  console.log("deploying TestRequester...");
  const dep = await wallet.sendTransaction({ data: TEST_REQ });
  const rec = await pub.waitForTransactionReceipt({ hash: dep, timeout: 120_000 });
  if (rec.status !== "success") throw new Error("TestRequester deploy REVERTED");
  const tr = rec.contractAddress;
  console.log("TestRequester at:", tr);

  // ---- Step 1: json-fetch (Bitfinex candle array) ----
  console.log("\n[1/3] json-fetch: fetchUintArray(Bitfinex, '', 8) ...");
  const prev1 = await pub.readContract({ address: tr, abi: TR_ABI, functionName: "lastRequestId" });
  const payload1 = encodeFunctionData({ abi: FETCH_ARRAY_ABI, functionName: "fetchUintArray", args: [BITFINEX, "", 8] });
  const req1 = await wallet.sendTransaction({ to: tr, value: 120000000000000000n, data: encodeFunctionData({ abi: TR_ABI, functionName: "request", args: [JSON_AGENT, payload1] }) });
  await pub.waitForTransactionReceipt({ hash: req1, timeout: 120_000 });
  const res1 = await waitForCallback(tr, prev1, "fetch", 420_000);
  if (res1.status !== 2) throw new Error("fetch failed: " + JSON.stringify(res1));
  const candle = decodeUintArray(res1.result);
  console.log("candle:", candle.map((v) => v.toString()).join(", "));
  const [mts, open, close, high, low, volume] = candle.map((v) => v);
  const priceUsd = Number(close) / 1e8;
  const changeBps = ((close - open) * 10000n) / open;
  const volBps = ((high - low) * 10000n) / close;
  console.log(`price: $${priceUsd.toFixed(2)}  change: ${fmtBps(changeBps)}%  vol: ${fmtBps(volBps)}%  mts: ${mts}  volRaw: ${volume}`);

  // ---- Step 2: llm-inference (constrained action) ----
  const prompt = [
    "You are SENTRIC, a portfolio insurance risk controller for a long BTC position. ",
    `Current BTC/USD price: $${priceUsd.toFixed(2)}. 24h change: ${fmtBps(changeBps)}%. Intraday range: ${fmtBps(volBps)}%. `,
    "Decide whether to buy a Down Event Contract to hedge the position for the next 5 minutes. ",
    "HEDGE if downside risk is elevated (sharp drop or high volatility). STAND_DOWN if the market is calm or rising. HOLD if uncertain. Respond with exactly one allowed value.",
  ].join("");
  const system = "You are a deterministic risk controller. Output exactly one token from the allowed set. No commentary.";
  console.log("\n[2/3] llm-inference: inferString(action)...");
  const prev2 = await pub.readContract({ address: tr, abi: TR_ABI, functionName: "lastRequestId" });
  const payload2 = encodeFunctionData({ abi: INFER_STRING_ABI, functionName: "inferString", args: [prompt, system, false, ["HEDGE", "STAND_DOWN", "HOLD"]] });
  const req2 = await wallet.sendTransaction({ to: tr, value: 240000000000000000n, data: encodeFunctionData({ abi: TR_ABI, functionName: "request", args: [LLM_AGENT, payload2] }) });
  await pub.waitForTransactionReceipt({ hash: req2, timeout: 120_000 });
  const res2 = await waitForCallback(tr, prev2, "action", 420_000);
  if (res2.status !== 2) throw new Error("action failed: " + JSON.stringify(res2));
  const decision = decodeString(res2.result);
  console.log("LLM decision:", decision);

  // ---- Step 3: llm-inference (confidence 0-100) ----
  console.log("\n[3/3] llm-inference: inferNumber(confidence)...");
  const prev3 = await pub.readContract({ address: tr, abi: TR_ABI, functionName: "lastRequestId" });
  const payload3 = encodeFunctionData({
    abi: INFER_NUMBER_ABI, functionName: "inferNumber",
    args: [`Given: BTC price $${priceUsd.toFixed(2)}, 24h change ${fmtBps(changeBps)}%, intraday range ${fmtBps(volBps)}%. How confident (0-100) are you in the previous action decision? Return only the number.`,
      "You are a deterministic risk scorer. Output only an integer between 0 and 100.", 0, 100, false],
  });
  const req3 = await wallet.sendTransaction({ to: tr, value: 240000000000000000n, data: encodeFunctionData({ abi: TR_ABI, functionName: "request", args: [LLM_AGENT, payload3] }) });
  await pub.waitForTransactionReceipt({ hash: req3, timeout: 120_000 });
  const res3 = await waitForCallback(tr, prev3, "confidence", 420_000);
  if (res3.status !== 2) throw new Error("confidence failed: " + JSON.stringify(res3));
  const confidence = decodeInt(res3.result);
  console.log("LLM confidence:", confidence.toString());

  console.log("\n=== LIVE CYCLE VALIDATED ===");
  console.log(`decision=${decision} confidence=${confidence} price=$${priceUsd.toFixed(2)} change=${fmtBps(changeBps)}% vol=${fmtBps(volBps)}%`);
  console.log("TestRequester:", tr);
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  process.exit(1);
});
