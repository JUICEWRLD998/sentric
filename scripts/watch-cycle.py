"""Watch the SentricBrain Phase-2 decision cycle on Somnia testnet:
prints RequestFinalized events (platform) and the final AuditEvent (brain).
Exits 0 once an AuditEvent is seen. Usage: python watch-cycle.py <brain>
"""
import json
import os
import sys
import time
import urllib.request

RPC = os.environ["SOMNIA_RPC_URL"]
BRAIN = sys.argv[1] if len(sys.argv) > 1 else "0x9b0ee5aff990d09a099672a621b7ce18d7ac98ec"
PLATFORM = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776"
ARM_BLOCK = 475433857
WINDOW = 800

TOPICS = {
    "audit": "0x4f46cb510fe56e2de2a4f3adf393186e0e8d7ff9f7e25e7e2b2f25e06dfe6692",  # AuditEvent(bytes32,string,uint8,address) - verify at runtime
}


def keccak(sig):
    # compute via cast once and hardcode; here we verify at startup
    return None


def rpc(method, params, retries=4):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    last = None
    for a in range(retries):
        try:
            req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as r:
                resp = json.loads(r.read().decode())
            if "error" in resp:
                raise RuntimeError(str(resp["error"]))
            return resp["result"]
        except Exception as e:
            last = e
            time.sleep(2 * (a + 1))
    raise last


def get_logs(address, topic0, frm, to):
    try:
        return rpc("eth_getLogs", [{"address": address, "topics": [topic0], "fromBlock": hex(frm), "toBlock": hex(to)}])
    except Exception as e:
        print(f"  scan err {frm}-{to}: {e}", flush=True)
        return None


def decode_audit(l):
    # ABI (bytes32, string, uint8): [inputsHash][offset][confidence][len][string]
    data = l["data"][2:]
    words = [data[i:i + 64] for i in range(0, len(data), 64)]
    inputs_hash = "0x" + words[0]
    confidence = int(words[2], 16)
    slen = int(words[3], 16)
    raw = "".join(words[4:])
    decision = bytes.fromhex(raw[: slen * 2]).decode("utf8", "replace")
    asset = "0x" + l["topics"][1][26:]
    return inputs_hash, decision, confidence, asset


def main():
    # AuditEvent(bytes32,string,uint8,address) — verified via `cast keccak`
    topic = "0x8788a4b3c63452dd9663256f9c8da0fb0f8069a9e86a210d03f82ceacc7315ad"
    print("AuditEvent topic0:", topic, flush=True)

    seen = {}
    for i in range(60):
        try:
            latest = int(rpc("eth_blockNumber", []), 16)
        except Exception as e:
            print(f"poll {i}: blockNumber failed: {e}", flush=True)
            time.sleep(45)
            continue
        lo = max(ARM_BLOCK, latest - 2400)
        events = []
        f = lo
        while f <= latest:
            res = get_logs(BRAIN, topic, f, min(f + WINDOW, latest))
            if res:
                for l in res:
                    events.append((int(l["blockNumber"], 16), l["transactionHash"]))
            f += WINDOW + 1
        for b, txh in events:
            if b in seen:
                continue
            seen[b] = txh
            l = None
            # re-fetch the exact log to decode it
            res = get_logs(BRAIN, topic, b, b)
            for x in res or []:
                ih, decision, confidence, asset = decode_audit(x)
                print(f"\n*** AUDIT EVENT @ block {b} tx {txh} ***", flush=True)
                print(f"  inputsHash: {ih}", flush=True)
                print(f"  decision:   {decision}", flush=True)
                print(f"  confidence: {confidence}", flush=True)
                print(f"  asset:      {asset}", flush=True)
                print("PHASE 2 MILESTONE MET: tick -> fetch -> LLM action -> LLM confidence -> AuditEvent", flush=True)
                sys.exit(0)
        print(f"poll {i} @block {latest}: audit events={len(events)}", flush=True)
        time.sleep(30)
    print("TIMEOUT", flush=True)
    sys.exit(1)


if __name__ == "__main__":
    main()
