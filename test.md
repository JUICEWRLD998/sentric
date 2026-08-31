# SENTRIC — How the product works

> A plain-English + technical walkthrough of the full SENTRIC loop — from "the market
> just dumped" to "your portfolio protected itself" — every step on-chain and auditable.

## 1. The mental model

SENTRIC is **insurance, not trading**. You deposit collateral into a non-custodial
vault. The agent is allowed to do exactly one thing with it: buy short-dated Down Event
Contracts to offset a price drop. It can never move funds out of the vault, and its loss
per window is capped at the premium it paid.

An "Event Contract" is a binary outcome: *"will BTC close above its opening price in
this 15-minute window?"* The Up side costs P(Up), the Down side costs 1 − P(Up). Buying
Down for a small fixed premium pays a fixed 1.00 if BTC closes lower — which is exactly
the payout leg of a put option, with zero fees and capped loss.

## 2. The components

| Component | Role |
|---|---|
| **SentricBrain.sol** | The agent's brain. Subscribes to reactivity, runs the decision state machine, calls Somnia Agents, places orders, emits `AuditEvent`s. |
| **SentricVault.sol** | The wallet. Custodies hedge capital, computes hedge size, places/redeems orders, enforces every safety rail. Owned by the brain. |
| **Reactivity (0x0100)** | The heartbeat. On `EpochTick` (every 3000 ledger blocks ≈ 5 min) the chain calls the brain directly — self-scheduling with no keeper. |
| **Somnia Agents** | On-chain AI. `json-fetch` (agentId `13174292974160097713`) pulls the live price; `llm-inference` (`12847293847561029384`) returns the decision + confidence. Both run on a validator subcommittee; outputs are byte-identical (deterministic, temperature 0). |
| **DreamDEX Event Contracts** | The market. BTC/ETH Up-Down binaries with 15-min & 1-hr windows. Orders go to the per-market BinaryPool. |

## 3. One decision cycle, step by step

```
EpochTick fires (reactivity, synthetic tx in the same block)
  → SentricBrain._onEvent
  → auto-redeem any open position (settle the last window)
  → state = FETCHING  → call json-fetch  (Bitfinex 5m candle: price + recent move)
      ↓ (a few blocks later) platform callback → handleResponse
  → state = DECIDING  → call llm-inference (HEDGE / STAND_DOWN / HOLD + confidence 0–100)
      ↓ platform callback → handleResponse
  → if HEDGE:
       size = hedge size from exposure & P(Down)
       → vault.placeBinaryOrder(BUY_NO, ...)   (a Down contract, IOC)
       → emit AuditEvent(inputs, decision, confidence, tx)
  → on settlement: vault.redeemSettled(...)    (automatic, on the next tick)
```

Every cycle emits an `AuditEvent` recording the exact inputs the chain saw and the
decision it made, so the "why" of any trade is reconstructable after the fact. Rendering
those receipts is the Reason Explorer's whole job.

## 4. Hedge sizing (`SentricVault.sizeHedge`)

```
N = exposure × move / (1 − P(Down))
```

…capped by `maxPremium / P(Down)` so the worst case is bounded. Degenerate inputs (dead
book, extreme probability, zero exposure) return 0 — the agent stands down rather than
guess.

## 5. Safety rails (non-negotiable)

- **Non-custodial** — deposits are yours; the brain can only hedge, never transfer out.
- **Per-window premium cap** — max premium per epoch (default 10 tUSDC).
- **Daily budget** — max premium per day (default 500 tUSDC).
- **Loss-streak stop-loss** — 3 consecutive losing windows halts new hedges.
- **Pause circuit breaker** — blocks new hedges only; redemption always stays open.
- **One position at a time** — no stacking, no unbounded exposure.
- **Failure-tolerant** — try/catch around order placement and redemption; a rejected
  order or unsettled window never wedges the state machine — the next tick retries.

## 6. Why it's defensible

- **Self-scheduling** → no liveness risk, no keeper.
- **Deterministic on-chain inference** → tamper-proof, reproducible decisions.
- **Capped-risk sizing** → can't be liquidated or blown up.
- **Verifiable reasoning** → every action maps to (deterministic input → deterministic
  output); the trust moat versus every black-box bot.

## 7. Verification (how to test it)

```bash
# contracts — unit + integration tests
cd contracts && forge test          # 71/71 pass

# frontend — typecheck, lint, production build
cd apps/web && pnpm typecheck && pnpm lint && pnpm build

# live on-chain — stream the AuditEvents from the armed brain
node scripts/watch-cycle.py

# live market discovery — find a tradeable BTC window
node scripts/wait-live-window.js
```

## 8. Proven on testnet (real receipts)

- The **phase-2 brain** ran the full fetch → LLM → `AuditEvent` cycle autonomously for
  ~24h of live epochs — those receipts are in the Reason Explorer against the v2 brain.
- The **phase-4 vault** placed a real Down order and redeemed a settled position:
  window **#60705**, paid 9.774 tUSDC premium, NO won, redeemed ~18 tUSDC → **+8.23 real
  profit** (vault 10,008.24 tUSDC).

Both are verifiable on-chain — the Reason Explorer renders them with the `inputsHash`,
decision, confidence, asset, and block for each one.
