"""Robust watcher for SentricBrain TickObserved stream (Somnia testnet).
Scans rolling 800-block windows with retries; exits 0 once >= 2 ticks seen.
Usage: python watch-ticks.py  (reads SOMNIA_RPC_URL from env)
"""
import json
import os
import sys
import time
import urllib.request

RPC = os.environ["SOMNIA_RPC_URL"]
BRAIN = "0x213714e59e6e70946d45bd6a534229d0d9165f76"
TICK_TOPIC = "0x3b4e3db0e2d2b7baf257fd019105c7e65243be227b6f29ead41de5952270a3ba"  # TickObserved(uint256,uint256)
ARM_BLOCK = 475203415
WINDOW = 800


def rpc(method, params, retries=4):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as r:
                resp = json.loads(r.read().decode())
            if "error" in resp:
                raise RuntimeError(f"rpc error: {resp['error']}")
            return resp["result"]
        except Exception as e:
            last = e
            time.sleep(3 * (attempt + 1))
    raise last


def scan_window(frm, to):
    try:
        return rpc("eth_getLogs", [{"address": BRAIN, "topics": [TICK_TOPIC], "fromBlock": hex(frm), "toBlock": hex(to)}])
    except Exception as e:
        print(f"  scan {frm}-{to} failed: {e}", flush=True)
        return None


def main():
    seen = {}
    for i in range(45):
        try:
            latest = int(rpc("eth_blockNumber", []), 16)
        except Exception as e:
            print(f"poll {i}: blockNumber failed: {e}", flush=True)
            time.sleep(60)
            continue
        lo = max(ARM_BLOCK, latest - 2400)
        found = []
        f = lo
        while f <= latest:
            res = scan_window(f, min(f + WINDOW, latest))
            if res:
                for l in res:
                    b = int(l["blockNumber"], 16)
                    ts = int(l["data"], 16) if l["data"] and l["data"] != "0x" else -1
                    found.append((b, ts, l["transactionHash"]))
                    seen[b] = (ts, l["transactionHash"])
            f += WINDOW + 1
        print(f"poll {i} @block {latest}: TickObserved total={len(seen)} recent={found}", flush=True)
        if len(seen) >= 2:
            print("STREAM CONFIRMED: >=2 TickObserved events, no manual tx:", flush=True)
            for b in sorted(seen):
                ts, txh = seen[b]
                print(f"  block {b} ts {ts} tx {txh}", flush=True)
            sys.exit(0)
        time.sleep(60)
    print("TIMEOUT after ~45 min", flush=True)
    sys.exit(1)


if __name__ == "__main__":
    main()
