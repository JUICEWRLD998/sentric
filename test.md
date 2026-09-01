# SENTRIC — How to use the app (start to finish)

> A practical walkthrough for actually using SENTRIC: run it, connect a wallet, fund
> the vault, arm the guardian, watch it hedge, and read its reasoning. For the deep
> technical internals, see `implementation.md` and `docs/`.

## 1. What you're using

SENTRIC is an autonomous portfolio-insurance agent on the Somnia testnet. You deposit
tUSDC, arm it, and from then on it wakes **itself** every ~5 minutes, reads the BTC
price, asks an on-chain LLM whether to hedge, and — if the risk is high — buys a Down
Event Contract to protect your position. Every decision leaves an on-chain receipt you
can inspect.

There are three screens:

| Route | Purpose |
|---|---|
| `/` | Landing page + a live "guardian console" showing current state at a glance |
| `/dashboard` | The control room — arm/disarm, live status, market odds, hedge history |
| `/reason-explorer` | The audit trail — every decision the agent ever made |

## 2. Before you start

- **Wallet:** MetaMask (injected) pointed at the Somnia Shannon testnet.
  - Chain ID: **50312** · RPC: `https://api.infra.testnet.somnia.network`
  - Native token: **STT** (gas + agent fees) — faucet: https://testnet.somnia.network
  - Collateral: **tUSDC** (6 decimals) — minted via the tUSDC contract `faucet()`
    (see `docs/venue-live-recipe.md` §2).
- **Run the app:** `pnpm dev` → http://localhost:3000 (or `pnpm build && pnpm start`).

## 3. Using it, step by step

### 3.1 Start the app
```bash
pnpm install
pnpm dev        # open http://localhost:3000
```

### 3.2 Connect your wallet
Click **"Connect wallet"** (top-right). Approve in MetaMask and switch to the Somnia
testnet if prompted. Once connected you'll see your STT balance and a short address.

### 3.3 Fund the vault (tUSDC)
The vault holds the hedge capital. Mint test USDC and deposit it:

```bash
# 1. mint tUSDC (faucet, 6-dec)
cast send 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E 'faucet(uint256)' 1000000000 \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$SOMNIA_RPC_URL" \
  --gas-limit 10000000 --gas-price 8000000000 --priority-gas-price 1000000000
# 2. deposit into the vault (approve first)
#    vault: 0xd4fa5efd13d7cb247c26d267014164031c93885f
```

> Note: `deposit` / `withdraw` are on-chain vault functions. The current UI shows the
> vault balance but does not yet expose deposit/withdraw buttons — use `cast` (above) or
> the SDK for now.

### 3.4 Arm the guardian
On `/dashboard`, flip **"Arm the guardian"**. This subscribes the brain to `EpochTick`,
so it wakes itself every ~5 minutes with no one watching.

- **Requirement:** the brain must hold ≥ 32 STT (reactivity reserve). If it's
  unfunded, arming reverts — see §6.
- Only the **owner** wallet can arm/disarm.

### 3.5 Watch a decision cycle
The "Agent state" badge steps through **Idle → Fetching → Deciding → Scoring** and back.
Within ~5 minutes a new row appears in **Hedge history** — `HEDGE` (bought protection),
`STAND_DOWN` (no threat), or `HOLD` (kept position).

### 3.6 Read the reasoning
Go to `/reason-explorer`. Each card is one decision:

- **decision** — `HEDGE` / `STAND_DOWN` / `HOLD`
- **confidence** — how sure the model was (0–100)
- **block / tx / inputsHash** — the on-chain proof of what it saw
- **"Show raw receipt"** — expands the full JSON

### 3.7 Tune the thresholds (owner only)
On `/dashboard` → **Thresholds**, set:
- **Insured move** (bps) — the minimum adverse move worth insuring (default 200 = 2%)
- **Down price** (bps) — the probability the agent targets

Click **"Save thresholds"** to write them on-chain (`setHedgeConfig`).

### 3.8 Disarm / withdraw
- Flip the switch off to **disarm** (unsubscribes reactivity; the reserve is swept back).
- **Withdraw** principal via `vault.withdraw()` (on-chain; see §3.3 note).

## 4. Reading each screen (cheat sheet)

**Dashboard**
- Agent state badge = where the cycle is (Idle / Fetching / Deciding / Scoring)
- `position open` = currently hedged · `subscribed` = armed
- **Vault** — collateral, premium spent this window/today, "budget used" bar
- **Live market** — Up/Down probability, best bid/ask, top depth
- **Hedge history** — every event the brain emitted, newest first

**Reason Explorer**
- `HEDGE` (red) = bought protection · `STAND_DOWN` (green) = no threat · `HOLD` (neutral)
- `inputsHash` = fingerprint of the exact inputs it saw (the "what it was thinking")

**Landing / guardian console**
- Pulse dot = live state (accent = hedging, neutral = standing by)
- Market bar = current Up/Down odds · last decision = the newest receipt

## 5. What's happening under the hood (30 seconds)

Every ~5 minutes, Somnia **reactivity** fires an `EpochTick` that calls the brain (no
keeper). The brain:
1. fetches the BTC 5-minute candle (JSON-API agent),
2. asks an on-chain **LLM** for `HEDGE / STAND_DOWN / HOLD` + confidence,
3. on `HEDGE`, buys a **Down Event Contract** sized to the exposure,
4. redeems any settled winnings automatically.

All of it runs inside validator consensus — no server, no API key, no oracle — and every
step is written to the chain as an `AuditEvent`. The full spec is in `implementation.md`.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Switch won't arm / "awaiting arm" | Brain is unfunded (< 32 STT) or you're not the owner. |
| No receipts appear | It's unarmed, or < 5 min since arming (EpochTick ≈ 5 min). |
| Market shows "–" | No live window right now — operators roll windows; op-2 5-min has gaps. |
| "standing by" | Normal — no position open, the agent is watching. |
| Arm reverts | Send ≥ 32 STT to the brain first (`node scripts/arm-brain.js <brain>`). |

## 7. Verify it works (run these)

The whole stack is testable from a terminal:

```bash
# 1. Smart contracts — unit + integration tests (71/71 pass)
cd contracts && forge test

# 2. Frontend — typecheck, lint, production build
cd apps/web && pnpm typecheck && pnpm lint && pnpm build

# 3. Live on-chain — stream the brain's AuditEvents as they land
node scripts/watch-cycle.py

# 4. Live market discovery — find a tradeable BTC window
node scripts/wait-live-window.js
```

A clean `forge test` (71/71), `typecheck` (0 errors), `lint` (0 problems) and a
green `build` is the full acceptance check for the repo.

## 8. Proven on testnet (real receipts, not mockups)

- The **phase-2 brain** (`0x9b0ee5…98ec`) ran the full fetch → LLM → `AuditEvent`
  cycle autonomously for ~24h of live epochs — those receipts are live in the
  Reason Explorer under the **"v2 (historical)"** switch.
- The **phase-4 vault** (`0xd4fa5e…385f`) placed a real Down order and redeemed a
  settled position: window **#60705**, paid 9.774 tUSDC premium, NO won, redeemed
  ~18 tUSDC → **+8.23 tUSDC profit** (vault 10,008.24 tUSDC).

Both are verifiable on-chain — the Reason Explorer renders each one with its
`inputsHash`, decision, confidence, asset, and block.
