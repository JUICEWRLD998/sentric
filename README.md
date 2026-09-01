# SENTRIC — the self-insuring portfolio

> **An autonomous insurance agent that lives entirely inside the Somnia blockchain.**
> It watches the market, reasons with an on-chain LLM, and trades DreamDEX Event
> Contracts to protect your crypto against the next 15 minutes — with no servers, no
> API keys, no oracle, no keeper, and a brain anyone can audit.

Built for the **Somnia × DreamDEX "Event Contracts" Hackathon** (DoraHacks).
Testnet chainId **50312** · Live web app in `apps/web`.

**Status — LIVE ON TESTNET:** the v4 brain is **armed** (subscription `15252347`,
33 STT reserve, 5-minute price feed) and self-waking every ~5 min, posting real
AuditEvents to the Reason Explorer. 71/71 contract tests · frontend build green.

---

## The problem

Crypto holders live in constant fear of the next red candle, but their only tools are
bad: (1) do nothing and eat the drawdown, (2) sell the whole position, or (3) gamble
with leveraged derivatives that can liquidate them. There is no cheap, capped-cost way
to say *"protect me for the next hour."*

Event Contracts — fixed payout, capped loss, zero fees — are *structurally* short-term
insurance, but they are marketed and understood purely as gambling. Nobody was using
them as protection.

## The insight

Somnia is the only chain where that insurance can run **fully autonomously and fully
on-chain**: a smart contract can schedule itself (reactivity), read the market
(JSON-API agent), reason about it (on-chain LLM agent), and hedge (Event Contracts) —
all inside validator consensus. No server, no API key, no oracle, no keeper.

So SENTRIC isn't "another AI trading bot." It's **insurance with a brain that lives
on-chain and can prove what it was thinking.**

## What it does

You connect a wallet and commit a hedge notional. From then on:

1. **Wake** — Somnia reactivity fires an `EpochTick` every ~5 minutes and calls the
   brain. No keeper, no server, no cron.
2. **See** — the brain calls the JSON-API agent for the live BTC 5-minute candle.
3. **Decide** — the on-chain LLM returns `HEDGE` / `STAND_DOWN` / `HOLD` + a confidence
   score, deterministically and consensus-verified (temperature 0, byte-identical across
   the validator subcommittee).
4. **Hedge** — on `HEDGE`, it buys a Down Event Contract sized to your exposure, bounded
   by per-window and per-day premium budgets.
5. **Redeem** — settled winnings are claimed automatically; every step leaves an
   `AuditEvent` receipt you can inspect in the Reason Explorer.

The user experience is one toggle: **"Protect my position."**

## Why it's different (the moat)

- **Category, not competitor.** Existing "AI trading agents" run off-chain — a server,
  API keys, and an oracle you must trust. SENTRIC's brain runs *inside consensus*: no
  server to hack, no key to leak, no oracle to bribe, no black box.
- **The insurance reframe.** Everyone else builds "trade up/down faster." SENTRIC builds
  "never eat a surprise dump again" — turning a gambling product into a protection
  product with a far bigger, stickier market.
- **The flagship composition of the entire sponsor stack** — reactivity + Somnia Agents +
  Event Contracts + the CLOB SDK — working together in one product. That combination is
  exactly what the hackathon is trying to prove out.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (apps/web) — Next.js 16 + TS · CSS Modules ·      │
│  Framer Motion · SIGNAL DECK design system (custom tokens)  │
│  Wallet connect · arm/disarm · live dashboard · Reason      │
│  Explorer (audit receipts) · live order book (read-only)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ RPC read / user txs
┌──────────────────────────────▼──────────────────────────────┐
│  ON-CHAIN CORE (Somnia, chainId 50312)                      │
│  SentricVault.sol — custody, sizing, arm/disarm/withdraw,   │
│                     redeem-on-settle, safety rails          │
│  SentricBrain.sol — reactivity handler (EpochTick), agent   │
│                     state machine, order exec, AuditEvents  │
│   ├─ Reactivity (precompile 0x0100) → self-scheduling       │
│   └─ Somnia Agents (JSON-API + LLM) → fetch + decide        │
└──────────────────────────────┬──────────────────────────────┘
                               │ placeOrder / redeem
┌──────────────────────────────▼──────────────────────────────┐
│  DREAMDEX EVENT CONTRACTS — BTC/ETH Up/Down, 15-min & 1-hr  │
│  windows · CLOB · P(Up)∈(0,1) · fixed payout · zero fees    │
└─────────────────────────────────────────────────────────────┘
```

One async decision cycle, fully on-chain:

```
EpochTick (reactivity, synthetic tx, same 100ms block)
  → SentricBrain._onEvent
  → auto-redeem any open position (settle the last window)
  → FETCHING  → JSON-API agent  (Bitfinex 5m candle: price + recent move)
  → DECIDING  → LLM agent       (HEDGE / STAND_DOWN / HOLD + confidence 0–100)
  → on HEDGE: size = f(exposure, P(Down)) → placeOrder(BUY_NO, IOC)
      → emit AuditEvent(inputsHash, decision, confidence, tx)
  → on settlement: redeemSettled(...)   (automatic, next tick)
```

## Safety rails (non-negotiable)

| Rail | Guarantee |
|---|---|
| **Non-custodial** | Deposits are yours; the brain can only hedge, never transfer out. |
| **Per-window premium cap** | Max premium per epoch (default 10 tUSDC). |
| **Daily budget** | Max premium per day (default 500 tUSDC), tracked on-chain. |
| **Loss-streak stop-loss** | 3 consecutive losing windows halts new hedges (`StopLossEngaged`). |
| **Pause circuit breaker** | Blocks new hedges only — redemption always stays open. |
| **One position at a time** | No stacking, no unbounded exposure. |
| **Failure-tolerant** | try/catch around order placement and redemption; a rejected order never wedges the state machine — the next tick retries. |

## Proven on testnet (real receipts, not mockups)

- The **phase-2 brain** ran the full fetch → LLM → `AuditEvent` cycle autonomously for
  ~24h of live epochs (visible in the Reason Explorer under "v2 (historical)").
- The **phase-4 vault** placed a real Down order and redeemed a settled position:
  window **#60705**, paid 9.774 tUSDC premium, **NO won**, redeemed ~18 tUSDC →
  **+8.23 tUSDC real profit** (vault 10,008.24 tUSDC).

## Tech stack

| Layer | Choice |
|---|---|
| Chain | Somnia (EVM, ~100ms blocks, chainId 50312 testnet) |
| Contracts | Solidity 0.8.30, Foundry (forge/cast/anvil) |
| On-chain AI/data | Somnia Agents — `json-fetch` (`13174292974160097713`) + `llm-inference` (`12847293847561029384`) |
| Scheduling | `@somnia-chain/reactivity-contracts` (precompile `0x0100`, `EpochTick`) |
| Market access | `@somnia-chain/markets-sdk` (reads) + Solidity venue calls (orders) |
| Frontend | Next.js 16 (App Router) + TypeScript + CSS Modules (OKLCH design tokens) |
| Web3 client | wagmi + viem |
| Server state | @tanstack/react-query |
| A11y primitives | Radix UI (unstyled) — Dialog, Slider, Tabs, Toast, Tooltip |
| Animation | Framer Motion (only) |
| Styling | Custom **SIGNAL DECK** system — flat ink surfaces, mint signal accent, light/dark themes, no Tailwind |

## Live app

`apps/web` — three screens:

| Route | Purpose |
|---|---|
| `/` | Landing + a live "guardian console" (agent state, market odds, vault, last decision) |
| `/dashboard` | Control room — arm/disarm, live status, market odds, thresholds, hedge history |
| `/reason-explorer` | The audit trail — every decision the agent ever made, with raw receipts |

Dark and light themes ship out of the box (persisted, toggle in the header).

## Repo structure

```
somnia/
├─ implementation.md      ← single source of truth (full spec + phase history)
├─ README.md              ← this file
├─ test.md                ← how to use the product, end to end
├─ demo.md                ← demo runbook + voiceover script
├─ apps/web/              Next.js frontend (SIGNAL DECK design system)
├─ contracts/             Foundry — SentricBrain.sol, SentricVault.sol, tests
├─ packages/              sdk-shared (workspace package)
├─ scripts/               deploy-*.js, watch-cycle.py, track-equity.js, wait-live-window.js
└─ docs/                  network-facts.md, agent-ids.md, venue-live-recipe.md, ...
```

## Quick start

Prereqs: Node ≥ 20, pnpm ≥ 10, Foundry (`forge`/`cast`).

```bash
pnpm install

# Frontend
pnpm dev            # http://localhost:3000
pnpm build
pnpm typecheck
pnpm lint

# Contracts
cd contracts && forge test   # 71/71 pass
```

Copy `.env.example` → `.env` and set `DEPLOYER_PRIVATE_KEY` (and, to point the frontend
at your own deployments, `NEXT_PUBLIC_BRAIN_ADDRESS` / `NEXT_PUBLIC_VAULT_ADDRESS`).

## Deployed contracts (Somnia testnet, 50312)

| Contract | Address |
|---|---|
| SentricBrain v4 (current, **ARMED** — live autonomy) | `0xb7ce698f31d8ad10a1714f3da701cdc32c58067e` |
| SentricVault v2 | `0xd4fa5efd13d7cb247c26d267014164031c93885f` |
| SentricBrain v2 (historical receipts) | `0x9b0ee5aff990d09a099672a621b7ce18d7ac98ec` |
| tUSDC (6 dp, faucet) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` |

---

## How this project is scored (and how SENTRIC answers)

> The hackathon judges 40% on **Technical Implementation** (25%) + **Innovation** (20%),
> and 35% on **User Experience** (20%) + **Business/Ecosystem impact** (20%), with 15%
> on **Presentation & Demo**. Here's how SENTRIC maps to each.

**Technical Implementation (25%) — deep, working integration.**
The entire loop runs on-chain against the *real* sponsor stack, proven on testnet:
reactivity self-wake → JSON-API agent → LLM inference → BinaryPool `placeOrder` →
`finalizeAndRedeem` — with 71/71 Solidity tests and live on-chain receipts.

**Innovation & Originality (20%) — a creative use that solves a real problem.**
Event Contracts were launched as gambling; SENTRIC reframes them as the first on-chain
micro-insurance primitive, and is the first autonomous, consensus-verified insurance
agent. It's a *category*, not a clone of the "trade up/down faster" templates.

**User Experience & Design (20%) — intuitive, beautiful, usable.**
A Noviq-token design system (OKLCH, dark-first with a light theme, fluid type, Framer
Motion), a one-toggle product surface, and the Reason Explorer — which turns
"black-box AI" into a human-readable, verifiable audit trail.

**Business & Ecosystem Impact (20%) — grows Event Contracts adoption.**
SENTRIC generates continuous automated volume on Event Contracts *and* gives retail a
reason to care — a wedge from DeFi traders to retail spot holders to any on-chain agent
that needs a verifiable hedge. Recurring per-window premium = recurring revenue.

**Presentation & Demo (15%) — a clear story with a magic moment.**
The 2–3 minute demo shows a portfolio protect itself with zero clicks, then flips to
the Reason Explorer for the "wait, you can do THAT?" beat. Runbook + word-for-word
voiceover in `demo.md`.

---

## Roadmap (post-hackathon)

- **LP mode** — neutral-view complete-set quoting to earn spread (signatures already
  verified; skipped for the demo to avoid adverse-selection risk).
- **Multi-asset / portfolio view** — aggregate hedges across BTC, ETH and more.
- **Backtest view** — "what SENTRIC would have done last week."
- **Copy-protection referral** — one-click "protect this position" links.

## Docs

- [implementation.md](./implementation.md) — full spec, technical reference, phase history
- [test.md](./test.md) — how the product works, step by step
- [demo.md](./demo.md) — demo runbook + 3-minute voiceover script
- [docs/](./docs/) — verified network facts, agent IDs, live venue recipe

---

**SENTRIC — the portfolio that protects itself.**
