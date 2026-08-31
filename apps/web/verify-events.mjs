// Re-check known cluster + count failures with visible errors.
import { createPublicClient, http, getAddress, decodeEventLog } from "viem";
import { readFileSync } from "node:fs";

const RPC = process.env.NEXT_PUBLIC_SOMNIA_RPC_URL || "https://api.infra.testnet.somnia.network";
const BRAIN_V2 = "0x9b0ee5aff990d09a099672a621b7ce18d7ac98ec";
const client = createPublicClient({ transport: http(RPC, { retryCount: 4, timeout: 15000 }) });
const brain = JSON.parse(readFileSync("./lib/abi/brain.json", "utf8"));
const events = brain.filter((e) => e.type === "event");

// known-good window from before
const w = await client.getLogs({ address: getAddress(BRAIN_V2), fromBlock: 475614000n, toBlock: 475614799n });
console.log("known window logs:", w.length);

const latest = await client.getBlockNumber();
console.log("latest:", latest.toString());
const counts = {};
let failures = 0;
let oldestAudit = 0n;
for (let i = 0; i < 500; i++) {
  const end = latest - BigInt(i * 4000);
  const start = end - 799n;
  let logs;
  try {
    logs = await client.getLogs({ address: getAddress(BRAIN_V2), fromBlock: start, toBlock: end });
  } catch (e) {
    failures++;
    continue;
  }
  for (const l of logs) {
    let name = "unknown";
    for (const e of events) {
      try {
        const d = decodeEventLog({ abi: [e], data: l.data, topics: l.topics, strict: true });
        name = e.name;
        break;
      } catch {}
    }
    counts[name] = (counts[name] ?? 0) + 1;
    if (name === "AuditEvent") {
      if (!oldestAudit) oldestAudit = l.blockNumber;
    }
  }
}
console.log("failures:", failures, "| by event:", JSON.stringify(counts));
console.log("oldest audit:", oldestAudit ? (latest - oldestAudit).toString() + " blocks back" : "none");
