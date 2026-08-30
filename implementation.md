# SENTRIC — Implementation Plan

> **The self-insuring portfolio.** An autonomous agent that lives entirely inside the
> Somnia blockchain, watches the market, thinks, and trades Event Contracts to protect
> your crypto against the next 15 minutes — no servers, no API keys, and a brain anyone
> can audit.
>
> This document is the single source of truth. It captures the idea, the hackathon
> context, the architecture, the full technical reference, the UI system, and a
> phase-by-phase build plan so no context is lost if we pause and resume.

---

## 1. THE HACKATHON (context we must never lose)

**Event:** Somnia × DreamDEX "Event Contracts Hackathon" (hosted on DoraHacks)
**URL:** https://dorahacks.io/hackathon/event-contracts/buidl
**Organizer:** Somnia Network (the "Agentic L1")
**Prize pool:** $5,000 USD (virtual hackathon)
**Deadline:** 2026-09-08 18:00 (UTC)
**Participants:** ~253 hackers, single **Open Track**

**Submission requirements (mandatory):**
- Working prototype on **testnet**
- GitHub repository link
- **2–3 minute demo video**
- Optional: presentation deck, feedback report on the SDK/docs

**Judging criteria (weights matter — design to them):**
| Criterion | Weight | What they're really asking |
|---|---|---|
| Technical Implementation | 25% | How deeply do you use DreamDEX Event Contracts + SDKs? Does it actually work? |
| Innovation & Originality | 20% | Did you use Event Contracts *creatively* to solve a *real* problem? |
| User Experience & Design | 20% | Is it intuitive, beautiful, usable? |
| Business & Ecosystem Impact | 20% | Will it attract users, generate trading activity, grow Event Contracts adoption? |
| Presentation & Demo | 15% | Is the story, product, demo, and vision clear? |

**Open Track example use-cases (what most teams will clone — do NOT just do these):**
- Consumer trading apps, simplified Up/Down UIs, mobile-first apps
- Autonomous AI trading agents, news bots, market-analysis assistants
- Trading dashboards, portfolio analytics, scanners, backtesting
- Leaderboards, copy-trading, referral, creator communities

**Sponsor resources:**
- Docs: https://docs.dreamdex.io/developers/event-contracts
- Bot Kit: https://github.com/somnia-chain/dreamdex-bot-kit
- Bot Builder: https://dreambot-builder.vercel.app
- SDK (npm): `@somnia-chain/markets-sdk` (use v0.28.0+)
- Reactivity (npm): `@somnia-chain/reactivity-contracts`
- Somnia Agents docs: https://docs.somnia.network/agents
- Somnia Reactivity docs: https://docs.somnia.network/developer/reactivity/reactivity-onchain

---

## 2. THE WINNING IDEA

**Name:** SENTRIC (from "sentry/sentinel" — the guardian; "centric" — the user stays at
the center)

**One-liner:**
A portfolio that protects itself — an autonomous agent that lives entirely inside the
Somnia blockchain, watches the market, thinks, and trades Event Contracts to insure
your crypto against the next 15 minutes, with no servers, no API keys, and a brain
anyone can audit.

**The problem:**
Crypto holders live in constant fear of the next red candle, but their only tools are
terrible: (1) do nothing and eat the drawdown, (2) sell the whole position (taxes,
timing, regret), or (3) use leveraged derivatives (liquidation, funding, unbounded
risk). There is no simple, capped-cost way to say "protect me for the next hour."
Meanwhile Event Contracts — which are *structurally* short-term insurance (pay a small
fixed premium, receive a fixed payout if the adverse move happens) — are marketed and
understood purely as gambling.

**The insight (non-obvious):**
Event Contracts were launched as a *trading/gambling* product, but their mechanics make
them the first viable **on-chain micro-insurance** primitive: capped loss, fixed payout,
zero fees. And Somnia is the *only* chain where you don't need a human, a server, or an
oracle to operate that insurance — a smart contract can schedule itself (reactivity),
read the market (JSON-API agent), reason about it (on-chain LLM agent), and hedge
(event contracts), all inside validator consensus. The product isn't "another AI
trading bot" — it's **insurance with a brain that lives on-chain and can prove what it
was thinking.**

**The solution:**
SENTRIC is a non-custodial guardian agent. You connect a wallet (or commit a hedge
notional). The agent runs 100% on-chain:
- Every window it wakes itself via reactivity (epoch/block ticks — no keeper).
- It pulls live BTC/ETH price + volatility via the JSON-API agent.
- It forms a deterministic, consensus-verified view via the on-chain LLM agent
  (a constrained signal: `HEDGE / STAND-DOWN / HOLD` + confidence).
- When it detects elevated downside risk, it buys a Down Event Contract sized to offset
  your exposure (or an Up contract to cheaply capture a breakout).
- Every decision emits an on-chain audit receipt — the exact inputs it saw and the
  decision it made, verified byte-identical across the validator set.

The user experience is one toggle: "Protect my position." No spreadsheets, no charts, no
"short this, long that." Just a dashboard showing your position, the agent's live
reasoning, and the payout when it saves you.

**Why it is different:**
- **Category, not competitor.** Existing "AI trading agents" run off-chain (a server +
  API keys + an oracle you must trust). SENTRIC's brain runs *inside consensus*: no
  server to hack, no key to leak, no oracle to bribe, no black box — the reasoning is
  reconstructable from on-chain inputs, deterministically.
- **The insurance reframe.** Everyone else builds "trade up/down faster." SENTRIC
  builds "never eat a surprise dump again" — turning a gambling product into a
  protection product, which has a far bigger and stickier market.
- **The flagship composition of the entire sponsor stack** (reactivity + Agents +
  Event Contracts + the CLOB SDK) working together in one product. No other team will
  demonstrate all of them working together.

**Why now:**
Three things converged in the last ~4 weeks: Event Contracts launched (Aug 24, 2026),
Somnia Agents went live on mainnet (on-chain AI is shipped, not roadmap), and the
"agents are moving capital" narrative is peaking. The primitive, the AI, and the demand
all exist for the first time, on the same chain.

**Why this hackathon:**
Somnia/DreamDEX are running this to prove Event Contracts can become a real, adopted
product; 40% of the score (Technical + Ecosystem) is literally "use Event Contracts
deeply" and "drive adoption/trading activity." SENTRIC most directly makes Event
Contracts indispensable — it generates continuous automated volume *and* gives retail a
reason to care — while showcasing exactly the tech Somnia is trying to prove out.

---

## 3. THE MAGIC MOMENT (demo beat)

Set up a live testnet portfolio of **1 ETH** and an idling SENTRIC agent. Then trigger
a sharp sell-off (scripted on testnet for determinism, or replay a real one).

**BEFORE:** Calm chart. Dashboard shows "Position: 1 ETH, unprotected. Agent: standing down."

**ACTION:** The market dumps — a fast ~-2% candle. Nothing is sent by hand. The
SENTRIC agent, scheduled by on-chain reactivity, fetches live price (JSON-API agent),
the on-chain LLM agent returns `HEDGE / confidence 0.81`, and a Down Event Contract is
placed automatically — all as synthetic on-chain transactions, no server, no keeper, no
click.

**AFTER — the "wait, you can do THAT?" beat:** BTC keeps falling. The portfolio line
barely dips because the insurance pays out. Then flip to the **Reason Explorer**: the
consensus-verified audit receipt showing *exactly what the chain saw and decided*,
byte-identical across validators:

```
Input (on-chain):  BTC -2.1% in 300s · realized vol 4.2σ
Model (on-chain LLM, T=0):  HEDGE
Confidence: 0.81
Action: BUY 1.2 ETH notional DOWN @ 0.42
Verified by: validator subcommittee (3/3)
```

**The line that lands:** "Your portfolio protected itself. There's no server, no API
key, no oracle — and here's the proof of what it was thinking."

Nobody else in the competition can show that "brain" beat, because it requires Somnia
Agents + on-chain reactivity.

---

## 4. ARCHITECTURE

### 4.1 System components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (off-chain)                          │
│  Next.js + TS · CSS Modules · Radix UI · Framer Motion (only animation) │
│                                                                          │
│  · Wallet connect (wagmi/viem)   · arm / disarm / withdraw controls     │
│  · Live position + hedge history · Reason Explorer (audit receipts)     │
│  · Live order book stream (markets-sdk, READ-ONLY)                      │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ read (RPC) / write (user txs: arm, disarm, withdraw)
┌───────────────▼──────────────────────────────────────────────────────────┐
│                         ON-CHAIN CORE (Somnia)                          │
│                                                                          │
│  SentricVault.sol  — hedge capital custody, non-custodial, sizing,      │
│                      arm/disarm/withdraw, redeem-on-settle               │
│  SentricBrain.sol  — reactivity handler (EpochTick), agent call state   │
│                      machine, order execution, audit-event emitter      │
│                                                                          │
│    ┌─────────────── Reactive scheduling (precompile 0x0100) ───────────┐ │
│    │  subscribe(BlockTick/EpochTick) → self-wakes, no keeper          │ │
│    └────────────────────────────────────────────────────────────────────┘ │
│    ┌─────────────── Somnia Agents (on-chain AI + data) ────────────────┐ │
│    │  JSON API agent (price/vol)  ·  LLM agent (deterministic decide) │ │
│    │  async callback → handleResponse; consensus-verified, receipt     │ │
│    └────────────────────────────────────────────────────────────────────┘ │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ placeOrder / redeem  (Solidity calls venue directly)
┌───────────────▼──────────────────────────────────────────────────────────┐
│            DREAMDEX EVENT CONTRACTS (the market / venue)                 │
│  BTC & ETH Up/Down · 15-min & 1-hr windows · CLOB · price = P(Up)∈(0,1) │
│  fixed payout · zero fees · complete sets (1 USDso = 1 Up + 1 Down)     │
│  auto-rolling markets · settlement + redeem                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data flow (one async decision cycle — fully on-chain)

```
EpochTick fires (reactivity, synthetic tx, same 100ms block)
  → SentricBrain._onEvent
  → state = FETCHING; call JSON API agent  (async request)
      ↓ (later block) platform callback → handleResponse(price, vol)
  → state = DECIDING; call LLM inference agent (async request)
      ↓ (later block) platform callback → handleResponse({action, confidence})
  → if action == HEDGE:
        compute hedge size from exposure & current Up/Down probability
        → venue.placeOrder(Down, size, IOC)        (or Up for breakout mode)
        → emit AuditEvent(inputs, decision, txhash)
  → on window settlement: vault.redeem(winning positions)
```

**Key mechanisms (why this is defensible):**
- **Self-scheduling** via reactivity → no keeper, no liveness risk.
- **Deterministic on-chain inference** → tamper-proof, reproducible decisions.
- **Capped-risk sizing** → max loss per window is the premium; vault can never be
  liquidated or blow up.
- **Verifiable reasoning** → every action maps to (deterministic input → deterministic
  output); the "why" is provable after the fact — the trust moat vs every black-box bot.

### 4.3 Tech stack

| Layer | Choice |
|---|---|
| Chain | Somnia (EVM-compatible, 100ms blocks, ~1M TPS, sub-cent fees) |
| Smart contracts | Solidity 0.8.30, Foundry (forge/cast/anvil) |
| On-chain AI/data | Somnia Agents (JSON API + LLM inference) |
| Scheduling | `@somnia-chain/reactivity-contracts` (precompile 0x0100) |
| Market access | `@somnia-chain/markets-sdk` (TS) for reads/frontend; Solidity venue calls for on-chain orders |
| Frontend | Next.js (App Router) + TypeScript + CSS Modules + CSS variables |
| Web3 client | wagmi + viem |
| Server state | @tanstack/react-query |
| A11y primitives | Radix UI (unstyled) — Dialog, Tabs, Toast, Tooltip, Dropdown |
| Animation | **Framer Motion ONLY** (see §7 constraint) |
| Styling | Noviq UI Playbook tokens (dark-first, OKLCH) — see §7 |

---

## 5. MVP SCOPE

**Must Have (non-negotiable)**
- `SentricVault` contract: `arm/disarm/withdraw`, hedge-ratio sizing, non-custodial
  (agent controls only the armed hedge notional, capped per window, no transfer-anywhere path).
- Full on-chain loop: reactivity-triggered → API agent → LLM agent → Event Contract
  order → redeem on settlement.
- Clean dashboard: live position, agent status, hedge history, and the **Reason
  Explorer** (audit receipts).
- End-to-end on Somnia **testnet**, proven by a 2–3 min demo video.
- Safety rails: max premium per window, `disarm` unsubscribes reactivity, no unbounded exposure.

**Should Have**
- User threshold knobs ("protect only moves > 1.5%"), manual override, and a live
  "preview" of what a hedge would cost right now.
- LP mode: neutral-view complete-set quoting to earn spread (adds liquidity → feeds the
  20% ecosystem score).
- A simulated "what SENTRIC would have done last week" backtest view (great pitch material).

**If Time Allows**
- Multi-position / portfolio view (multiple assets, aggregate hedge).
- Streak/win-rate stats + simple leaderboard.
- One-click "copy this protection" referral link.

**Do NOT build:** a DEX, a custom market creator, an off-chain ML pipeline, a mobile
app. On-chain autonomy is the whole point — everything else dilutes it.

---

## 6. TECHNICAL REFERENCE (verified facts — do not lose these)

### 6.1 Event Contracts (`@somnia-chain/markets-sdk`)
- Trade on the **Somnia Markets on-chain order book**. The HTTP API covers spot only;
  event contracts are **SDK-only**.
- SDK capabilities: `loadMarkets`, `listBinaryMarkets`, `fetchOrderBook`, `createOrder`,
  realtime watches (order book / fills / candles), React hooks, raw trader tier,
  **mint/merge complete sets** (1 USDso ⇄ 1 Up + 1 Down), **redeem winning positions**.
- **Price = Up probability in (0, 1).** Symbol format: `"BTC-0-12AUG26-1600/USDso#YES"`.
- **One book, two sides:** Up and Down trade on a single book; Down price = 1 − Up price.
  Two opposite-side buyers can cross with **no seller at all** — the pool mints a fresh
  Up/Down pair from their combined collateral (so you can quote both sides with zero
  inventory).
- **Markets die on schedule and respawn:** every window has a hard expiry; the venue
  auto-rolls a successor. A settled market leaves the live list — winnings are claimed
  by scanning recently settled markets.
- **No API rate limits:** market data is the chain itself; public RPC is unthrottled.
  Snapshot once, stay current from on-chain events (the SDK's live watches do this).
- **Gotchas:**
  - The **indexer lags** — gate every write on the live on-chain status
    (`onchain.status === 1` means Trading).
  - Row ids are plain strings; the client wants them **hex-typed** (`0x${string}`).
  - A reverted write **throws a decoded revert error** (from 0.23.0) — propagate/catch
    it rather than testing a status flag.
  - The **receipt rides on `info`** (`order.info.receipt.transactionHash`), not on the order.
  - Use **IOC** (`timeInForce: "IOC"`) so an unfilled remainder never rests silently.
  - Use **v0.28.0+**: below 0.23.0 the indexer dropped `longOpenInterest` (breaks
    `loadMarkets`/`listBinaryMarkets`); below 0.28.0 an ordinary float price lands off
    the tick grid and the pool rejects it.

### 6.2 Somnia Agents (on-chain AI + data) — CORE
- Three base agents, live on testnet **and** mainnet, same agentId (platform contract
  address differs per network):
  1. **JSON API Request** — fetch/parse any public HTTP endpoint (price, sports, weather).
  2. **LLM Inference** — deterministic Qwen3-30B, fixed seed, temperature 0, constrained
     output set.
  3. **LLM Parse Website** — read a webpage, extract a structured answer.
- **Consensus-verified:** runs on a subcommittee of validators (default 3); each
  re-runs the fetch/inference; outputs are byte-identical; a majority must agree.
- **Async + callback:** a contract calls the platform; the result returns
  asynchronously through a callback you implement (`handleResponse`, gated — anyone can
  call it, so validate `msg.sender == platform`).
- **Pricing (per call):** JSON API 0.03 STT/validator; LLM 0.07 STT/validator; add
  `pricePerAgent × subcommitteeSize` on top (e.g. JSON API with subcommittee 3 =
  0.03 + 0.03×3 = 0.12 STT). Sub-cent per decision cycle.
- **Must implement `receive() external payable`** (rebates are pushed on finalization;
  without it the transfer fails silently and funds stick in the platform contract).
- **Handle every status:** a request ends in `Success`, `Failed`, or `TimedOut`.
- Each agent call produces an **audit receipt**.
- **Design note:** the deterministic, consensus-verified output is a *feature* for a
  risk-control decision (reproducible, tamper-proof), not a limitation.

### 6.3 On-chain Reactivity (`@somnia-chain/reactivity-contracts`) — CORE
- Precompile at **0x0100**; a contract subscribes via
  `SomniaExtensions.subscribe(address(this), filter, options)`.
- When an event/system-event matches the filter, validators include a **synthetic
  transaction in the same block** that calls the handler. The **subscription owner pays
  gas** → fund the contract with **≥ 32 SOMI**.
- **System events** (`BlockTick`, `EpochTick`, `Schedule`) are fabricated `0x100` logs
  at block end → this is how SENTRIC **self-schedules** with no keeper.
- Handler extends `SomniaEventHandler`, overrides `_onEvent`. Inside `_onEvent`:
  `msg.sender` is the reactivity precompile (`0x0100`); `tx.origin` is the subscription owner.
- **Min base fee = 6 nanoSomi (6 gWei = 6,000,000,000 wei)** — a common bug is passing
  wei while thinking it's gWei.
- **On-chain wildcard subscriptions are NOT allowed** (≥1 of eventTopics/origin/emitter).
- **Avoid recursive explosions** — don't let the handler emit an event that re-triggers
  its own subscription.
- "No other EVM can do this; combined with 100ms blocks it enables a class of apps other
  chains can only approximate off-chain." (Somnia's own docs.)

### 6.4 Venue Solidity entry point (for on-chain orders)
- The bot-kit notes the June 2026 upgrade: old `placeTakerOrderWithoutVault` is
  **removed**. Single entry point now:
  `placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity,
  uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder,
  uint96 bu...)` — confirm exact signature against the deployed venue ABI before coding.

### 6.5 DreamDEX Bot Kit (reference material, not to clone)
- `github.com/somnia-chain/dreamdex-bot-kit`: shared client (TS + Python), five
  strategies (market-making, grid, momentum, mean-reversion, twap), session keys,
  EIP-7702 batching, and an **edge-analytics** tool. Use it to understand the venue;
  our differentiator is the on-chain agent brain + insurance framing, not a bot strategy.

---

## 7. UI / DESIGN SYSTEM (Noviq UI Playbook + the animation constraint)

**Source file:** `C:\Users\fadhm\Desktop\UI-DESIGN-SYSTEM.md` (Noviq UI Playbook).

**Constraint (explicit from the user):** No animation except **Framer Motion**. This means:
- ✅ Use: Framer Motion for all motion (reveals, gestures, `AnimatePresence`,
  `MotionConfig reducedMotion="user"`, layout animations).
- ❌ Do NOT add: GSAP / ScrollTrigger, three.js / @react-three/fiber / WebGL hero,
  and the CSS `@keyframes` mesh-drift animation.
- ⚠️ The animated mesh is used **statically** (mesh gradient without the drift
  keyframes) or dropped; film grain is static and stays. Glass card + edge-light ring
  are static and stay.

**Apply these playbook rules:**
1. **Dark-first**; light theme is a semantic-layer override only (`[data-theme="light"]`).
2. **OKLCH color, never `#000`/`#fff`**; neutrals tinted ~265° hue.
3. **3-tier tokens** (primitives → semantic → component). Components touch only tiers 2–3.
4. **One accent hue** (~285° electric violet) + danger/success/warning. No rainbow.
   (Optionally re-hue the accent to a Somnia-aligned color later — change the `285` ramp only.)
5. **Fluid `clamp()` type**, three font roles: display (Space Grotesk) / sans (Geist) /
   mono (Geist Mono). Tabular numerals for money & hashes.
6. **4px base / 8px rhythm** spacing scale — no magic numbers.
7. **Reusable surface patterns:** glass card, edge-light ring, film grain, (static) mesh.
8. **Motion tokens in one file, mirrored in TS** (`motion.css` + `motion.ts`) so Framer
   Motion shares identical easings/durations. Framer presets in `lib/motion.ts`
   (`fadeUp`, `fadeIn`, `scaleIn`, `staggerParent`, `springTap`).
9. **Respect reduced motion** three ways: global CSS kill-switch,
   `<MotionConfig reducedMotion="user">`, and skip heavy effects.
10. **CSS Modules + CSS variables only (no Tailwind)**; **Radix UI unstyled primitives**
    for a11y; one global `:focus-visible` ring.

**Files to scaffold first (frontend):** `tokens.css`, `motion.css`, `motion.ts`,
`patterns.module.css`, `globals.css`, `lib/motion.ts` (Framer presets), then the
component kit: `Button`, `Card`, `Badge`, `Field/Input`, `CodeBlock`, `Skeleton`,
`Stat`, `Toast`, + layout primitives `Container`, `Stack`, `Grid`, `PageHeader`.

**SENTRIC-specific UI surfaces:**
- **Dashboard:** position card (tabular numerals), agent status badge (standing
  down / fetching / deciding / hedged), live Up/Down probability, hedge history table.
- **Reason Explorer (the hero):** renders the audit receipt — inputs, model decision,
  confidence, action, validator subcommittee — in `CodeBlock` + `Stat` components.
- **Arm/Disarm toggle** + threshold knobs (Slider via Radix, styled with tokens).
- Keep a `/styleguide` route (per playbook) to verify tokens/patterns; gate in prod.

---

## 8. IMPLEMENTATION PHASES

> Each phase ends with a **verifiable milestone** (a running command / on-chain tx /
> screenshot). Do not start the next phase until the milestone is met. This is the
> anti-drift backbone.

### Phase 0 — Scaffold & environment (0.5 day)
- Init monorepo (pnpm workspaces): `apps/web`, `contracts`, `packages/sdk-shared`.
- Foundry project under `contracts/`; Next.js (App Router + TS) under `apps/web/`.
- Install: `@somnia-chain/markets-sdk@>=0.28.0 viem`, `@somnia-chain/reactivity-contracts`,
  wagmi, @tanstack/react-query, Radix primitives, framer-motion.
- Add `.env` for Somnia **testnet** RPC + deployer key + indexer URL.
- **Milestone:** `forge build` clean + `pnpm dev` serves the (empty) Next.js app.

### Phase 1 — Prove reactivity (self-waking contract) (1 day)
- Write `SentricBrain` as `SomniaEventHandler` subscribing to `EpochTick`/`BlockTick`.
- On `_onEvent`, emit `TickObserved(blockNumber, timestamp)`.
- Deploy to testnet with ≥32 SOMI funded; verify synthetic ticks land with no external
  caller.
- **Milestone:** `cast logs` shows a growing stream of `TickObserved` events with no
  manual tx triggering them.

### Phase 2 — Prove on-chain AI (the "brain") (1.5 days)
- Add agent-call state machine to `SentricBrain`: on tick → request JSON API agent
  (BTC price + a vol proxy) → `handleResponse` → request LLM agent
  (`{action, confidence}` from a constrained output set) → `handleResponse`.
- Gate `handleResponse` by platform address; handle `Success/Failed/TimedOut`; add
  `receive()`.
- Emit `AuditEvent(inputs, decision, confidence)` on completion.
- **Milestone:** a single tick produces an end-to-end on-chain `AuditEvent` showing real
  fetched price + a deterministic model decision, verified across the subcommittee.

### Phase 3 — Prove on-chain trading (Event Contract execution) (1.5 days)
- Implement venue `placeOrder` (Down/Up) + `redeem` calls in the vault.
- Wire hedge sizing: `size = f(exposure, current Up/Down probability)`; enforce max
  premium per window.
- **Milestone:** the vault places a real testnet Event Contract order and redeems a
  settled position; the order/redeem txs are visible on a block explorer.

### Phase 4 — Full autonomous loop + safety (1.5 days)
- Chain Phase 2 + 3 into one cycle: tick → fetch → decide → (hedge/stand-down) → order.
- Add `arm/disarm/withdraw`, non-custodial guardrails, re-entrancy checks, recursion
  guard (no self-triggering), max-premium and stop-loss rails.
- Add LP mode (stretch): neutral-view complete-set mint/quote.
- **Milestone:** a scripted testnet sell-off triggers the full self-hedge loop and the
  portfolio drawdown is reduced vs. unhedged (measurable in the Reason Explorer).

### Phase 5 — Frontend (Noviq UI + Framer Motion) (3 days)
- Scaffold tokens/motion/patterns/globals + component kit (§7).
- Dashboard: position card, agent status, live probability (markets-sdk stream),
  hedge history.
- **Reason Explorer**: render `AuditEvent` receipts (inputs / decision / confidence /
  subcommittee) — this is the demo hero.
- Arm/disarm toggle + threshold controls; wallet connect (wagmi).
- **Milestone:** end-to-end UI drives arm/disarm, streams the live book, and renders a
  real audit receipt; motion is Framer-only; `/styleguide` renders correctly.

### Phase 6 — Demo, polish, submit (2 days)
- Write + rehearse the 2–3 min demo script (§9); record against the scripted testnet
  scenario (deterministic dump, no luck required).
- Optional deck (Problem → Insight → Solution → Tech → Impact → Vision) + SDK/docs
  feedback report (free goodwill with organizers).
- Submit on DoraHacks: GitHub link + demo video (+ optional deck/report).
- **Milestone:** submission confirmed before 2026-09-08 18:00 UTC.

**Suggested effort split (solo or small team):** contracts/agent = 60%, frontend =
30%, demo/submission = 10%. Do not let UI scope-creep steal time from Phase 2–4 — the
on-chain loop is the whole pitch.

---

## 9. DEMO VIDEO SCRIPT (2–3 min, for judges)

**0:00–0:20 — Problem hook.** "Every crypto holder fears the next red candle, and the
only tools are bad: sell everything, or gamble with leverage that liquidates you. There's
no cheap, safe way to say 'protect me for the next hour.'"

**0:20–0:45 — The primitive.** "Somnia just shipped the primitive that changes that:
Event Contracts — fixed payout, capped loss, zero fees. They're not a toy; mechanically
they're the first real on-chain insurance for short-term price moves."

**0:45–1:30 — The demo (the magic moment).** Show the idling portfolio (1 ETH,
"standing down"). Trigger/script the dump. Show the agent wake itself (reactivity),
fetch price + reason (on-chain AI), and place the Down contract — no server, no click.
Show the portfolio barely dipping as BTC falls.

**1:30–2:00 — The brain.** Flip to the Reason Explorer: "No server, no API key, no
oracle — and here's the proof of what it was thinking" (the consensus-verified receipt,
subcommittee 3/3).

**2:00–2:45 — Impact + vision.** "We didn't build a trading bot. We built the first
portfolio that defends itself — and the first insurance layer for the on-chain agent
economy. This chain's whole thesis is agents moving capital; SENTRIC is the trust layer
that makes that safe."

**2:45–3:00 — Close.** Name, one-liner, GitHub/links.

---

## 10. STARTUP POTENTIAL, COMPETITION, RISKS (condensed for context)

**Target users (wedge → broad):** DeFi traders / airdrop farmers / DEX LPs (wedge) →
retail spot holders → treasury/fund managers → (long-term) any on-chain agent needing a
verifiable hedge primitive.

**Business model:** take rate / premium on protection; LP spread capture; optional
performance fee on a "growth mode." Continuous per-window volume = recurring revenue.

**Moat:** first-mover on "verifiable, fully-on-chain insurance agent"; workflow lock-in
(calibrated thresholds + trust in the audited agent); liquidity/volume network effects;
the deterministic consensus-verified brain is the hardest thing to copy (needs the
sponsor stack).

**Honest competitive overlap (and why we still win):**
- Prophecy Social / Algo Arena / Bot Kit — different product (we don't create markets or
  run off-chain bots; we operate autonomous insurance on existing Event Contracts).
- DreamDEX native UI — we're the automation/insurance layer *on top*; additive, not competing.
- Polymarket / Kalshi / CME event contracts — multi-day or centralized; no 15-min on-chain
  price binaries with on-chain AI.
- Options protocols (Lyra/Derive) — real options with liquidation risk; we use capped-loss
  binaries (approachable for retail).
- DeFi insurance (Nexus Mutual) — covers hacks, not price moves.

**Top risks & mitigations:**
- Async agent flow flaky on camera → scripted/deterministic testnet scenario; practice
  the loop; keep a "manual pulse" fallback path for the demo.
- Judge lumps us with "AI trading agent" example → lead the pitch with the insurance
  reframe + the on-chain "brain proof," not with "bot."
- Scope creep → MVP boundaries in §5 are hard; UI polish is last.

---

## 11. REPO STRUCTURE (target)

```
somnia/
├─ implementation.md               ← this file (single source of truth)
├─ apps/
│  └─ web/                        Next.js frontend (Noviq UI)
│     ├─ src/app/                 dashboard, reason-explorer, styleguide routes
│     ├─ src/components/          Button, Card, Stat, CodeBlock, ...
│     ├─ src/styles/              tokens.css, motion.css, globals.css, patterns.module.css
│     ├─ src/lib/                 motion.ts, wagmi.ts, sdk.ts (markets-sdk client)
│     └─ src/hooks/               useAgentState, useOrderBook, useAuditEvents
├─ contracts/                     Foundry (Solidity 0.8.30)
│  ├─ src/
│  │  ├─ SentricVault.sol
│  │  ├─ SentricBrain.sol        (reactivity handler + agent state machine)
│  │  └─ lib/                     venue interface, agent platform interface,
│  │                              ISomniaReactivityPrecompile, helpers
│  ├─ script/                     Deploy.s.sol, DeployAndArm.s.sol, SimulateDump.s.sol
│  └─ test/                       unit + integration (forge)
├─ packages/
│  └─ sdk-shared/                 agent ABI encoders, market helpers, hedge-sizing math
└─ docs/
   ├─ demo-script.md
   └─ sdk-feedback.md             (optional submission artifact)
```

---

## 12. STATUS & NEXT STEPS

### Phase 0 — DONE (verified with real tool output)
- Monorepo scaffolded (pnpm workspaces: `apps/web`, `packages/sdk-shared`; `contracts/` is a Foundry project outside the workspace).
- Foundry v1.8.1 installed; `forge build` passes and `forge test` = 14/14 pass (10 new SentricBrain reactivity tests + 4 vault).
- `apps/web`: Next.js 16.3.3 + Noviq UI (tokens/motion/patterns + Framer presets), typecheck clean (added missing `typecheck` script → `tsc --noEmit`), `pnpm build` green, `pnpm dev` serves HTTP 200 (title "Sentric").
- `packages/sdk-shared`: typechecks, 21/21 tests pass.
- All confirmed network facts live in **`docs/network-facts.md`**.

### Phase 1 — DONE (reactivity self-wake proven on testnet)
- **`SentricBrain.sol` rewritten** as a real `SomniaEventHandler` (vendored `@somnia-chain/reactivity-contracts@0.2.1` into `contracts/lib/reactivity-contracts/`, remapped in `foundry.toml`). Owner-gated `arm()` (payable — funds the ≥32 STT reserve + subscribes to `EpochTick.selector`), `disarm()` (unsubscribes), `_onEvent` emits `TickObserved(block.number, block.timestamp)`, gated to `msg.sender == 0x0100` by the base contract. The old `IAgentPlatform`/`ISomniaReactivityPrecompile` stubs were NOT the real ABI — the real one is the npm package (documented in `docs/network-facts.md` §6).
- **Deployed on testnet (50312):** SentricBrain `0x213714e59e6e70946d45bd6a534229d0d9165f76` (deploy tx `0x79a112b80ebb39a36110efc52f632b4bfb203a6dd7b57becdb4c9613019b61da` @ block 475237693; arm tx `0x1996b44467669a535517661babf7555ce7161cf425ff349b465f7826062001ce` @ block 475237719). Contract holds **~33 STT**; subscription **id 14853920** verified via `getSubscriptionInfo` (EpochTick topic, emitter 0x0100, handler = brain, onEvent selector, 20 gwei max fee, 10M gas, owner = brain).
- **MILESTONE MET — `cast logs` stream of `TickObserved` with no manual tx:** 4+ synthetic self-txs (from == to == brain, miner 0x0, 82,212 gas each) at blocks 475238999 / 475241999 / 475244999 / 475247999, exactly **3000 blocks / 300 s apart** — EpochTick cadence empirically confirmed. Balance math checks: 33 − 4×(82,212×6 gwei) = 32.99753364 STT.
- **Deploy quirk:** this RPC's log indexer lags and `eth_getLogs` caps ranges at 1000 blocks — scan in ≤800-block windows and re-verify receipts directly (`eth_getTransactionReceipt`); `cast receipt` gave stale block numbers. `forge script --broadcast` fails with `-32602` on this RPC (doubled `0x` prefix in forge-inspected bytecode + node quirks) → deploy via viem (`scripts/deploy-brain.js`).

### Phase 2 — IN PROGRESS (on-chain AI cycle deployed, awaiting funding to arm)
- **SentricBrain v2** rewritten: full async decision state machine (Idle → Fetching → Deciding → Scoring) on the real `IAgentRequester` ABI (`contracts/src/lib/IAgentRequester.sol` — replaces the wrong `IAgentPlatform` stub). Per EpochTick: 1x JSON fetch (Bitfinex candle via `fetchUintArray(url,"",8)` — price + 24h change + high/low vol in one request, or CoinGecko scalar mode) → 1x `inferString` (HEDGE/STAND_DOWN/HOLD, deterministic) → 1x `inferNumber` (0-100 confidence) → `AuditEvent(inputsHash, decision, confidence, asset)`. `handleResponse` gated to the platform + requester check; Failed/TimedOut reset to Idle; one cycle in flight guard; owner-configurable agentIds/fetch-params/fetch-mode/fees; `sweep()` recovers the reserve when disarmed. **29/29 tests pass** (mock platform + mock precompile: full cycle, array+scalar modes, gating, failures, sweep).
- **Verified agent facts (docs/agent-ids.md + docs/price-endpoints.md):** json-fetch agentId **13174292974160097713** (0xb6d47da8dbbcb1b1), llm-inference **12847293847561029384** (0xb24ac1afbcefc708) — same on testnet+mainnet, confirmed in somnia-chain/agentathon examples + live RequestCreated logs (also: beware agentId 9911223344556677889 = custom aggregator, NOT json-fetch). `getRequestDeposit()` = 0.03 STT floor; real calls fund floor + price×subSize (0.12 json / 0.24 llm, rebated if over). Bitfinex 1D candle array endpoint is the recommended single-request feed (CoinGecko fallback).
- **Deployed (testnet 50312):** `0x3cc0d4e847d605c2bc526bbf9dadb541576d8ad2` — agentIds + Bitfinex array mode + cycleEnabled=true set on-chain; **NOT armed yet** (deployer needs ~33.2 STT; had 17.65 after deploy → faucet top-up pending).
- **Remaining:** fund deployer (~16 STT) → `node scripts/arm-brain.js 0x3cc0d4e847d605c2bc526bbf9dadb541576d8ad2` → watch first live cycle: RequestCreated(json) → RequestFinalized → RequestCreated(llm) → RequestFinalized → AuditEvent.
- **Note:** the Phase-1 brain `0x213714…` was disarmed (tx `0x32b4ce0b…`); its ~33 STT reserve is locked (Phase-1 contract had no `sweep()` — the Phase-2 contract adds it).

### Confirmed (no longer TODO)
- Testnet: chain id 50312, RPC https://api.infra.testnet.somnia.network, faucet https://testnet.somnia.network.
- Event Contracts venue addresses, collateral (tUSDC `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E`, 6 decimals), Somnia Agents platform (testnet `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`).
- Full `IAgentRequester` / `IAgentRequesterHandler` interfaces, agent method signatures (`fetchUint`/`fetchString`, `inferString`/`inferNumber`), and fee sizing — verbatim in `docs/network-facts.md`.
- Reactivity: EpochTick = 3000 ledger blocks ≈ 5 min (testnet + mainnet); BlockTick would cost ~233 STT/day vs EpochTick ~0.08 STT/day; subscribe owner must hold ≥ 32 STT at subscribe time — full confirmed interfaces in `docs/network-facts.md` §6.
- Deployer funded via GCP Shannon faucet (1 STT/request) + Discord faucet (51 STT total).

### Remaining TODOs (unblock the next phases)
1. **Phase 2:** fetch the literal `agentId`s for `json-fetch` and `llm-inference` from https://agents.testnet.somnia.network.
2. **Phase 3:** read the exact `placeOrder` full signature from the SDK's `binaryModuleWriteAbi` (`npm pack @somnia-chain/markets-sdk` → `src/`).

### Build order (de-risk order)
1. Phase 1 (reactivity self-wake) — hardest unknown first.
2. Phase 2 (on-chain agents: JSON fetch → LLM decide). NOTE: replace the current `IAgentPlatform` stub with the real `IAgentRequester.createRequest(...)` interface and fix `handleResponse(requestId, Response[], status, Request)` — the stub signatures are NOT the real ABI.
3. Phase 3 (venue order placement + redeem + hedge sizing).
4. Phase 4 (full loop + safety), Phase 5 (frontend), Phase 6 (demo + submit).

---

*End of implementation plan. This file is authoritative — update it whenever a technical
fact changes or a phase milestone shifts, so we never lose context mid-build.*
