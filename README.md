# SENTRIC

**The self-insuring portfolio.** An autonomous agent that lives entirely inside the
Somnia blockchain — it watches the market, thinks, and trades DreamDEX Event Contracts
to insure your crypto against the next 15 minutes. No servers, no API keys, no oracle,
no keeper — and a brain anyone can audit.

> Built for the Somnia × DreamDEX "Event Contracts" Hackathon (DoraHacks).
> Testnet: chainId **50312** · Live web app: `apps/web`

## Status

- ✅ On-chain loop proven end-to-end on testnet: tick → fetch → LLM decide → hedge → auto-redeem
- ✅ Contracts: **71/71 tests pass** (`forge test`), Solidity 0.8.30
- ✅ Frontend: Next.js 16 + Noviq UI — `typecheck` / `lint` / `build` all green
- ⏳ Autonomous arm pending ~1 STT faucet claim (deployer holds 31.17 STT vs 32 required)

## What it is

Crypto holders live in fear of the next red candle, but their only tools are bad:
do nothing and eat the drawdown, sell the whole position, or gamble with leverage.
There is no cheap, capped-cost way to say *"protect me for the next hour."*

SENTRIC fills that gap. Event Contracts — fixed payout, capped loss, zero fees — are
structurally short-term insurance, but everyone treats them as gambling. SENTRIC turns
them into the first **on-chain micro-insurance primitive**: a guardian that wakes
itself every ~5 minutes, reads the market, reasons about it with an on-chain LLM, and
buys a Down contract to hedge your exposure — all inside validator consensus, with an
audit receipt for every decision.

## How it works (the loop)

1. **Wake** — Somnia reactivity fires an `EpochTick` every ~5 min and calls the brain.
   No keeper, no server, no cron.
2. **See** — the brain calls the JSON-API agent for the live BTC price + recent move.
3. **Decide** — the on-chain LLM agent returns `HEDGE` / `STAND_DOWN` / `HOLD` + a
   confidence score, deterministically and consensus-verified.
4. **Hedge** — on `HEDGE` it buys a Down Event Contract sized to the exposure, bounded
   by per-window and per-day premium budgets.
5. **Redeem** — settled winnings are claimed automatically; every step leaves an
   `AuditEvent` receipt you can read in the Reason Explorer.

See [test.md](./test.md) for the full technical walkthrough.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (apps/web) — Next.js + TS · CSS Modules · Framer  │
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

## Tech stack

| Layer | Choice |
|---|---|
| Chain | Somnia (EVM, 100ms blocks, chainId 50312 testnet) |
| Contracts | Solidity 0.8.30, Foundry (forge/cast/anvil) |
| On-chain AI/data | Somnia Agents (JSON API + LLM inference) |
| Scheduling | `@somnia-chain/reactivity-contracts` (precompile 0x0100) |
| Market access | `@somnia-chain/markets-sdk` (reads) + Solidity venue calls (orders) |
| Frontend | Next.js 16 (App Router) + TypeScript + CSS Modules (OKLCH tokens) |
| Web3 client | wagmi + viem |
| Animation | Framer Motion (only) |
| Styling | Noviq UI Playbook — dark-first, OKLCH, no Tailwind |

## Repo structure

```
somnia/
├─ implementation.md      ← single source of truth (full spec)
├─ README.md
├─ test.md                ← how the product works, end to end
├─ demo.md                ← demo runbook + voiceover script
├─ apps/web/              Next.js frontend (Noviq UI)
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

# Contracts
cd contracts && forge test   # 71/71 pass
```

Copy `.env.example` → `.env` and set `DEPLOYER_PRIVATE_KEY` (and, to point the frontend
at your own deployments, `NEXT_PUBLIC_BRAIN_ADDRESS` / `NEXT_PUBLIC_VAULT_ADDRESS`).

## Deployed contracts (Somnia testnet, 50312)

| Contract | Address |
|---|---|
| SentricBrain v4 (current, unarmed) | `0xb7ce698f31d8ad10a1714f3da701cdc32c58067e` |
| SentricVault v2 | `0xd4fa5efd13d7cb247c26d267014164031c93885f` |
| SentricBrain v2 (historical receipts) | `0x9b0ee5aff990d09a099672a621b7ce18d7ac98ec` |
| tUSDC (6 dp, faucet) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` |

## Docs

- [implementation.md](./implementation.md) — full spec, phase history, technical reference
- [test.md](./test.md) — how the product works, step by step
- [demo.md](./demo.md) — demo runbook + 3-minute voiceover script
- [docs/](./docs/) — verified network facts, agent IDs, live venue recipe
