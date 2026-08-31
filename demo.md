# SENTRIC — Demo runbook + voiceover script

> How to run the 2–3 minute demo, and the word-for-word voiceover to record over it.

## 0. What you're proving

One sentence: *"Your portfolio protected itself — there's no server, no API key, no
oracle, and here's the proof of what it was thinking."*

Three beats:
1. A portfolio is idling, unprotected ("standing down").
2. The market dumps; SENTRIC wakes itself, reasons on-chain, and hedges — no click.
3. Flip to the Reason Explorer: the consensus-verified receipt of the decision.

## 1. Before you record (setup)

1. **Frontend up:** `pnpm dev` → http://localhost:3000
2. **Wallet funded** with tUSDC + STT — faucet https://testnet.somnia.network
3. **Arm the brain** so it self-wakes: on the Dashboard, connect the owner wallet and
   flip **"Arm the guardian"** (needs ≥ 32 STT on the brain). If the reserve isn't
   funded yet, use the **manual pulse** fallback below.
4. **Open three tabs:** `/` (landing) · `/dashboard` · `/reason-explorer`.

## 2. The demo flow (what's on screen)

| Time | Screen | Action |
|---|---|---|
| 0:00 | `/` landing | Talk over the guardian console (live agent state + market odds). |
| 0:20 | `/dashboard` | Show the position "standing down", vault collateral, live odds bar. |
| 0:45 | `/dashboard` | Trigger the dump — watch state move Idle → Fetching → Deciding, then a HEDGE order lands in hedge history. |
| 1:30 | `/reason-explorer` | Open the newest receipt: inputsHash, decision HEDGE, confidence, block. |
| 2:00 | `/dashboard` | Show the hedge paying out (vault collateral up, "position closed · won"). |
| 2:45 | close | Name, one-liner, GitHub link. |

### Scripted dump (deterministic — no luck required)

```bash
# 1. find a live BTC window
node scripts/wait-live-window.js
# 2. the Bitfinex 5m candle is the brain's input — a fast-moving candle is all you
#    need; or drive a sharp move with a test order if you want it fully scripted.
```

### Manual pulse fallback (never block on the 5-min cadence)

If the reactive arm isn't live, force the "it hedged itself" beat with the brain's
one-tx manual path (`manualHedgeNow(pool, marketId, downPriceBps, yesPrice)` — re-point +
approve + size + place in a single transaction):

```bash
node scripts/phase3-smart-hedge.js   # or call manualHedgeNow directly via the brain
```

## 3. Voiceover script (2:45, word-for-word)

**(0:00–0:20 — the hook)**

"Every crypto holder lives in fear of the next red candle. And the only tools we've had
are terrible — do nothing and eat the drawdown, sell everything and pay for it, or
gamble with leverage that can liquidate you. There's no cheap, safe way to say:
'protect me for the next hour.'"

**(0:20–0:45 — the primitive)**

"Somnia just shipped the primitive that changes that: Event Contracts. Fixed payout,
capped loss, zero fees. Mechanically they're not a toy — they're the first real on-chain
insurance for short-term price moves. But nobody's been using them that way. So we
built something that does."

**(0:45–1:30 — the magic moment)**

"Meet SENTRIC — a portfolio that protects itself. Here's a position, sitting
unprotected. The agent is standing down. Now watch the market dump. Nobody clicks
anything. SENTRIC wakes itself through on-chain reactivity, reads the live price, asks
an on-chain LLM what to do — and it says HEDGE. It buys a Down contract automatically.
BTC keeps falling — but this portfolio barely dips, because the insurance pays out."

**(1:30–2:00 — the brain)**

"And here's the part nobody else can show. Flip to the Reason Explorer. There's no
server, no API key, no oracle — and here's the proof of what it was thinking: the exact
input it saw, the decision, the confidence, verified byte-identical across the validator
subcommittee. Every single decision is auditable, on-chain."

**(2:00–2:45 — impact + vision)**

"We didn't build a trading bot. We built the first portfolio that defends itself — and
the first insurance layer for the on-chain agent economy. This chain's whole thesis is
agents moving capital. SENTRIC is the trust layer that makes that safe. Buy an Up, buy a
Down, or just stand back — your portfolio protects itself."

**(2:45 — close)**

"SENTRIC. The self-insuring portfolio, built entirely on Somnia. [GitHub link]."

## 4. Submission checklist (DoraHacks)

- [ ] 2–3 min demo video (uploaded)
- [ ] GitHub repo link (public)
- [ ] Optional: deck + SDK/docs feedback report
- [ ] Submitted before **2026-09-08 18:00 UTC**
