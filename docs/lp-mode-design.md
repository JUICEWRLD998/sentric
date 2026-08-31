# Sentric — LP Mode Design (neutral-view market making on DreamDEX Event Contracts)

Status: Phase-4 stretch design. All signatures verified against the live Somnia testnet (50312) RPC
on 2026-08-31 via `eth_getCode` PUSH4-selector scans (proxies resolved via the EIP-1967 impl slot)
and read-only `eth_call`. No txs were sent. CREATE3 ⇒ identical code on mainnet (5031).

## 1. Complete-set mechanics — verified signatures & targets

A "complete set" = 1 YES + 1 NO outcome token, mintable for 1 collateral unit
(`oneCollateral` = 1e6 raw for tUSDC) and burnable back. There are TWO surfaces; the
SDK/bot-kit use the POOL surface. `operatorId`/`venueId` are attribution-only (0/0x0 ok).

### BinaryPool (per-market; pool of the market in `module.markets(marketId)`, e.g. live `0xc92dc97f3c1a9bcd63ea1d7294759bee6102bbc7`; code = `binaryPoolImpl 0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD`, CREATE3 clone)
```solidity
// selector 0x54657dd2 — VERIFIED on impl. Pool pulls `amount` collateral from caller,
// mints `amount` YES → yesTo and `amount` NO → noTo. Permissionless.
function mintSet(address yesTo, address noTo, uint256 amount)
// selector 0x55664dbd — VERIFIED. Caller surrenders `amount` YES + `amount` NO,
// gets `amount` collateral back (pool vault). Permissionless.
function burnSet(uint256 amount)
// 0x718c2d4d, 0x4f1ce9a7 (getBookLevels), 0x9b98cc19 (getBinaryPoolParams), 0xdbc91396 (cancelOrder) — VERIFIED
```

### BinaryMarketsModule `0x3ecC694Cef705358864a646142ac17A90E29e388` (proxy → impl `0xdf87ac5c…`)
Trader-facing wrappers that route to the market's pool (NOT wrapped by SDK v0.28.1 trader — use pool surface):
```solidity
// 0x47dfb781 VERIFIED   module orchestrates pool.mintSet(caller, caller, amount)
function mintCompleteSet(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint256 amount)
// 0xb6354afe VERIFIED   module orchestrates pool.burnSet(amount)
function mergeCompleteSet(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint256 amount)
// 0x5b1ffcf2 VERIFIED (redeem), 0x88cb9474 (redeemMany), 0x626cb257 (finalizeMarket), 0xbddb5def (pokeOracle), 0x7564912b (markets), 0x9e48ee0b (marketNonce)
```

### BinarySettlement `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` (proxy → impl `0x1e333215…`) — redemption home
```solidity
// 0x17a10e13 VERIFIED — finalizes-if-needed then burns caller's outcome tokens (ERC-6909) and pays `to`
function finalizeAndRedeem(address pool, uint256 outcomeId, uint256 amount, address to)
// 0x049104e5 VERIFIED; 0x4c582380 getSettlement(uint256 marketKey) VERIFIED (fee frozen at finalize)
function redeem(uint256 outcomeId, uint256 amount, address to)
```

### OutcomeToken6909 singleton `0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9` (proxy → impl `0x2e769a68…`)
```solidity
// 0x558a7297 VERIFIED (one grant covers EVERY id/market), 0xb6363cf2 isOperator VERIFIED, balanceOf(address,uint256) eth_call OK
function setOperator(address spender, bool approved)
```

### CollateralRouter `0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C` (direct contract)
NATIVE-collateral path only (msg.value → wNative). NOT applicable to the tUSDC/USDso ERC-20 venue.
`mintCompleteSetNative(uint32,bytes32,bytes32)` payable 0xbb173121 VERIFIED; `redeemNative(uint32,bytes32,bytes32,uint8,uint256)` 0xc429b81a VERIFIED. Ignore for Sentric.

## 2. Collateral flow / approvals

| Step | Approval needed | Spender |
|---|---|---|
| Mint set (pool path) | ERC-20 `approve(collateral, pool)` — pool pulls | **POOL** |
| Burn set / merge | ERC-6909 `setOperator(outcome6909, pool, true)` — pool burns both halves | POOL (as operator) |
| BUY_YES / BUY_NO order | ERC-20 `approve(collateral, pool)` (ceil: qty×price/1e6, qty×(1e6−price)/1e6) | **POOL** |
| SELL_YES / SELL_NO order | ERC-6909 `setOperator(outcome6909, pool, true)` | POOL (as operator) |
| Redeem (module path) | ERC-6909 `setOperator(outcome6909, module, true)` (SDK auto) | MODULE |
| Redeem (settlement path) | ERC-6909 `setOperator(outcome6909, settlement, true)` | SETTLEMENT |

- Mint/merge/burn/orders/redeem are all **permissionless** — no whitelist; the only gate is paying collateral.
- The SDK's trader auto-does all of the above (`approveIfNeeded` maxUint256-cached; `ensureOperator` cached) —
  Sentric only needs raw calls if going contract-direct.
- Nothing is approved to the CollateralRouter for this venue (it is the native/STT path).

## 3. How the bot-kit / SDK actually LP

From `dreamdex-bot-kit/packages/ec-core/src/` (inventory.ts, orders.ts, settlement.ts) + SDK v0.28.1 `dist/trade.js`/`binary/sets.js`:

1. **Fund** `exchange.trader.faucet()` (testnet, 10k cap) / read `exchange.client.getErc20Balance(collateral, addr)`.
2. **Mint** `exchange.mintSet(market.symbol, inventory)` → `trader.mintSet({pool, amount})` → pool `mintSet(you, you, amount)`; auto-approves the pool. Re-check `receipt.status` — the SDK does NOT throw on revert (`assertTxOk`).
3. **Quote** `trader.placeOrder({pool, side, price, quantity, outcomeToken, yesId, noId, orderType, expireTimestampNs})`:
   `side` ∈ {BUY_YES, SELL_YES, BUY_NO, SELL_NO}; `price` is ALWAYS the YES-side price (NO = 1e6 − yes); `orderType: ORDER_TYPE.POST_ONLY (3)` — rests or reverts `PostOnlyWouldCross()`, never takes; `expireTimestampNs = min(now+300s, market expiry)×1e9`; sizes/price snapped to tick 1000 / lot 1000 (`toSteps`). Escrow: buys → collateral (pool pulls); sells → outcome tokens (pool pulls under operator grant).
4. **Monitor** `res.fills` (sum `quantityFilled`), `res.orderId` (resting), `exchange.client.getOutcomeBalance({outcomeToken, account, id})`, `getBookLevels`.
5. **Redeem** `exchange.trader.redeem({marketId, market, outcomeToken, outcomeIdx, amount})` → module `redeem` (auto-operator). Payout math via `estPayoutFor` — winner pays `1 − fee`, voided pays 0.5 each side, loser 0.

## 4. Recommended minimal LP flow for Sentric (per market, per window)

Per live market (`module.markets(marketId)` → pool, yesId, noId, expiry — all fresh each window; never cache ids):

1. **Read params:** `getBinaryPoolParams()` → oneCollateral=1e6, maker/taker/settlement fees (all 0 on testnet — VERIFIED live), nonce. `getBookLevels` for the touch.
2. **Fund + approve once:** faucet if tUSDC low; `approve(pool, maxUint256)` (SDK does it lazily).
3. **Mint N sets:** `pool.mintSet(you, you, N)` — cost N×1 collateral → N YES + N NO.
4. **Quote both sides, post-only:** `placeBinaryOrder(0 BUY_YES, fair−s, qty, expiryNs, 3 POST_ONLY, 0, 0, 0, 0)` and `placeBinaryOrder(2 BUY_NO, 1e6−(fair−s), qty, …)` — same qty, same spread s, so a full double fill costs `(p_yes+p_no)` per pair < 1 and profits `1−(p_yes+p_no)−fees` regardless of outcome.
5. **Monitor fills:** poll receipts/`OrderFilled`; track filled YES vs NO. Resting orders self-expire at `expireTimestampNs` (≤ market expiry — the venue rejects later).
6. **At settlement** (auto on testnet via reactivity; else `finalizeMarket(marketId)` permissionless): redeem the winning leg (`trader.redeem` or settlement `finalizeAndRedeem`); **merge the leftover pair** (`pool.burnSet`) if you still hold both sides of unfilled inventory; losing leg is worth 0 — skip it.

**Edge cases:**
- **Partial fills (the core risk):** one leg fills, the other doesn't → naked YES or NO exposure, no longer neutral. Unwind by re-quoting the missing leg, or `SELL_*` the filled leg at the touch, or hold to expiry (winning → redeem; losing → 0). Cap qty so a one-sided fill is survivable.
- **Pool recycling:** the same pool address serves successive windows with a NEW nonce → new yesId/noId per market (`(uint160(pool)<<72)|(nonce<<8)|idx`). Read the market record + nonce every window; stale ids are dead.
- **Expiry:** orders must expire ≤ market expiry; escrow of expired resting orders returns to the owner via permissionless `cancelExpiredOrders`/`sweepExpiredAtLevel`. Minted-but-unquoted inventory is never escrowed.
- **Voided market:** both sides redeem at 0.5, no fee (claim whichever you hold).
- **Fees:** testnet verified 0 everywhere; mainnet may skim `settlementFeeBpsTimes1k` from winners + maker/taker fees — read pool params before quoting.

## 5. Costs, risks, and recommendation

**Costs/risks:**
- **Gas:** Somnia's gas schedule is expensive — observed 253k gas for a faucet tx, 10M limit + explicit 8 gwei gas price needed. A full LP cycle ≈ 5–7 txs (faucet, approve, mint, 2 orders, redeem/merge). Free on testnet; real SOMI on mainnet.
- **Adverse selection / fill asymmetry:** neutral only if both legs fill at symmetric prices. Partial fills leave naked inventory on a 5-minute window where the oracle can move materially — the classic MM problem, amplified by short windows.
- **Settlement fee (mainnet):** winner redeems at `1 − fee`; `getSettlement`/pool params carry `settlementFeeBpsTimes1k`. 0 on testnet.
- **Window churn:** 5-min windows force constant re-mint/re-quote; per-window inventory is tiny (1:1 backing).

**Recommendation: keep LP mode a documented stretch — do NOT build it for the demo unless Phases 1–3 are done and stable.**
The primitives are all verified and a minimal demo is genuinely feasible (it reuses the exact `placeBinaryOrder` path already built for hedging — an afternoon of work), but its marginal demo value is low next to the core agent-hedge story, and the fill-asymmetry/neutrality edge cases add real complexity for a hackathon. If time remains after the hedge flow is demonstrably working, ship only the 3-call demo (mintSet → 2× post-only → redeem) with fixed small size; leave full inventory-managed LP for post-hackathon.
