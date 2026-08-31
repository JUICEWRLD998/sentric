// Measure sequential vs concurrent getLogs latency on this RPC.
import { createPublicClient, http, getAddress } from "viem";

const RPC = process.env.NEXT_PUBLIC_SOMNIA_RPC_URL || "https://api.infra.testnet.somnia.network";
const BRAIN_V2 = "0x9b0ee5aff990d09a099672a621b7ce18d7ac98ec";
const client = createPublicClient({ transport: http(RPC, { retryCount: 3, timeout: 15000 }) });
const latest = await client.getBlockNumber();

const windows = [];
for (let i = 0; i < 24; i++) {
  const end = latest - BigInt(i * 800);
  windows.push({ fromBlock: end - 799n, toBlock: end });
}

// sequential
let t0 = Date.now();
let n = 0;
for (const w of windows) {
  const logs = await client.getLogs({ address: getAddress(BRAIN_V2), ...w });
  n += logs.length;
}
console.log(`SEQUENTIAL 24 windows: ${Date.now() - t0}ms (${n} logs)`);

// concurrent batch of 8 at a time
t0 = Date.now();
let n2 = 0;
for (let i = 0; i < windows.length; i += 8) {
  const batch = windows.slice(i, i + 8).map((w) => client.getLogs({ address: getAddress(BRAIN_V2), ...w }));
  const results = await Promise.allSettled(batch);
  n2 += results.filter((r) => r.status === "fulfilled").reduce((acc, r) => acc + r.value.length, 0);
}
console.log(`CONCURRENT-8 24 windows: ${Date.now() - t0}ms (${n2} logs)`);

// concurrent batch of 16
t0 = Date.now();
let n3 = 0;
for (let i = 0; i < windows.length; i += 16) {
  const batch = windows.slice(i, i + 16).map((w) => client.getLogs({ address: getAddress(BRAIN_V2), ...w }));
  const results = await Promise.allSettled(batch);
  n3 += results.filter((r) => r.status === "fulfilled").reduce((acc, r) => acc + r.value.length, 0);
}
console.log(`CONCURRENT-16 24 windows: ${Date.now() - t0}ms (${n3} logs)`);
