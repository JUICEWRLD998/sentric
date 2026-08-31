# DreamDEX Event Contracts — LIVE testnet recipe (place → settle → redeem)

Chain: Somnia Shannon testnet, chainId `50312`, RPC `https://api.infra.testnet.somnia.network` (~10 blocks/s; `eth_getLogs` capped at 1000 blocks/call).
All values below were verified live on 2026-08-30 ~19:25–19:45 UTC (blocks ~475,447,000–475,484,000).

## 0. Contracts
| Contract | Address |
|---|---|
| BinaryMarketsModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| MarketsCore | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` |
| BinarySettlement | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| OutcomeToken6909 (ERC-6909 singleton) | `0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9` |
| OracleHub | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b2` |
| tUSDC (6 dp, faucet) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` |

`export RPC=https://api.infra.testnet.somnia.network` (source `../.env` for `DEPLOYER_PRIVATE_KEY`; never print it).

## 1. Current markets (verified live)
Two operators run BTC+ETH up/down series on testnet (both still live):
- **op 4 / venue `0x1a1e6821cde7d0159c0d293177871e09677b4e42307c7db3ba94f8648a5a050f` / creator `0xeE3AFf92812A2cb7bf801B500687BC97B55CaB34`** — "Pricefeed test: will BTC/USDC's price be at or above <strike> at unix <ts>", fixed-strike, **60 s and 300 s windows** (rolls every minute → always a fresh live market).
- **op 2 / venue `0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c` / creator `0x94D963B6670AB96E78C8d0C46ca35D196d606EFE`** — "BTC closes at or above its opening price", reference-mode, **300 s / 900 s (15 m) / 3600 s (1 h) / 14400 s (4 h)** windows. The 15-min series is the product series; it rolls at :00/:15/:30/:45.

**marketId encoding (verified):** the bytes32 `marketId` is **NOT a hash** — it is a plain sequential uint256 counter on the module (`0x…e2b0` = 58032). Asset/window/strike/expiry live in the on-chain `MarketRecord` and the oracle question, not in the id. Read a record:
```bash
cast call 0x3ecC694Cef705358864a646142ac17A90E29e388 \
  'markets(bytes32)(uint256,uint8,uint8,address,uint32,bytes32,address,address,address,address,uint256,uint256,uint64,uint64)' \
  0x000000000000000000000000000000000000000000000000000000000000e2b0 --rpc-url $RPC
# → oracleQuestionId, outcomeSlotCount, voidPolicy, collateral, originOperatorId, originVenueId,
#   oracleAdapter, creator, market, pool, yesId, noId, tradingStart, expiry
```
**Concrete live example (verified, 1-min BTC, marketId `0x…e2b0`):**
- marketId `0x000000000000000000000000000000000000000000000000000000000000e2b0` · market `0x2de2ccfd5498fcb53059e41bcd035efb96375055` · pool `0xc92dc97f3c1a9bcd63ea1d7294759bee6102bbc7` · nonce 1663
- collateral tUSDC · tradingStart 19:25:00 · **expiry 19:26:00** · `status()=1` (Trading) · `isResolved()=false` · `payoutNumerators()=[]`
- P(Up) ≈ YES mid = **(0.627+0.665)/2 ≈ 0.646** (book: bids 0.627@200, asks 0.665@200 in tokens); NO ≈ 0.354
- Pool params: oneCollateral `1e6`, tickSize **1000**, minQuantity **1000**, lotSize **1000** (raw), settlement `0xbF4a49e0…`

Discover the current market: `eth_getLogs` for `MarketCreated` (topic0 `0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd`) from the module over the last 800–1000 blocks, keep rows with `expiry > now`, decode the 19-field event (or read the indexer if `SOMNIA_INDEXER_URL` is set — it is empty in `.env`, so RPC is authoritative).

## 2. tUSDC faucet — VERIFIED
```bash
cast send 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E 'faucet(uint256)' 1000000000 \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url $RPC \
  --gas-limit 10000000 --gas-price 8000000000 --priority-gas-price 1000000000
cast call 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E 'balanceOf(address)(uint256)' $YOUR_ADDR --rpc-url $RPC
```
Verified run: tx `0x17836b25c086985d1babd86f6d3227725b3c4ed81ac6a0a8b77adf9db79f1792` → status 1, gasUsed 253,138, balance 0 → **1,000,000,000 (1,000.00 tUSDC)**.
⚠ Pitfalls (both hit live): **`--gas-limit 1000000` FAILS (status 0)** — use 10M (Somnia's gas schedule is expensive); without explicit `--gas-price/--priority-gas-price` the tx can be dropped. Mint cap is 10,000 per call.

## 3. Worked placeOrder example (decoded)
`placeBinaryOrder(uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k, uint64 userData)` — selector `0x718c2d4d`, called on the **pool**. kind: 0 BUY_YES · 1 SELL_YES · 2 BUY_NO · 3 SELL_NO. **price is always the YES-side price**; NO price = 1e6 − yesPrice.
Verified tx `0x9b6dfecab5b2b049b88fbc28ace5faf93d49bd91ff60a4894ccffd25c4f688db` (blk 475337919, direct pool call, filled as taker: OrderFilled + OrderPlaced in receipt):
`kind=0 (BUY_YES) · price=520000 (0.52) · quantity=38000000 (38 tokens) · expireTimestampNs=1788106860000000000 · orderType=0 (GTC) · selfMatchingOption=0 · builder=0x0 · builderFeeBpsTimes1k=0 · userData=0`

## 4. Settlement + redeem — VERIFIED, fully automated
- **Resolution:** the MarketCreator/OracleHub subscribe to the Somnia reactivity precompile (`0x0100`); at expiry the precompile calls back `onEvent(address,bytes32[],bytes)` (selector `0x53edf33d`, seen from `0xeE3AFf…` and `0xe40db…`), which resolves via the OracleHub and delivers the payout vector → `BinaryMarket.Resolved(denominator=10_000_000, numerators=[10_000_000, 0])` for a YES win. **No keeper needed on testnet.** Manual fallbacks: `pokeOracle(oracleQuestionId)` (0xbddb5def) and `finalizeMarket(marketId)` (0x626cb257) on the module.
- **Finalize:** same reactivity flow calls `finalizeMarket` → settlement `MarketFinalized` (module topic0 `0x8f396ac6…`).
- **Redeem (what live bots do):** `finalizeAndRedeem(address pool, uint256 outcomeId, uint256 amount, address to)` on BinarySettlement (selector `0x17a10e13`). Verified tx `0xb62b94d7ea48ffab9ea76ec5c8f8c6d1183fc7ed500cff65b884143c5ccf0bee`: pool `0xf77155dE9b96bd24A9c3D1E45Ed4547c990A8bDB`, outcomeId `6671042440433490767107755357300015129009480843570237758270711946833409`, amount `1500000000`, to bot `0xa8059aae…`. Receipt: ERC-6909 Transfer (burn) + `Redeemed`; winner got collateralOut = amount (**fee = 0** on this venue; `getSettlement` verified: finalized, voided=false, feeBps×1k=0, payoutNumerators=[10_000_000,0]).
- **Outcome-id formula (verified):** `outcomeId = (uint160(pool) << 72) | (uint64(nonce) << 8) | idx` (idx 0=YES, 1=NO); `marketKey = outcomeId >> 8`; nonce = pool's `marketNonce()`/`marketNonce(marketId)`.

## 5. THE RECIPE (small BUY_NO on a live BTC market)
(a) **Mint tUSDC** — section 2 (1e9 raw). 
(b) **Approve the pool** (it pulls collateral on placement):
```bash
cast send 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E 'approve(address,uint256)' $POOL 115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url $RPC --gas-limit 10000000 --gas-price 8000000000 --priority-gas-price 1000000000
```
(c) **Place a small Down (BUY_NO) order** on the live BTC pool. Get fresh values first:
```bash
cast call $POOL 'getBinaryPoolParams()((address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256,uint256,address,uint64,bool))' --rpc-url $RPC  # yesId/noId, oneCollateral, marketNonce
cast call $POOL 'getBookLevels(bool,uint64)((uint256,uint256)[])' true 3 --rpc-url $RPC   # YES bids → NO asks = 1e6 − yesBid
cast call $POOL 'getOrderBookParameters()((uint256,uint256,uint256))' --rpc-url $RPC      # (tickSize,minQuantity,lotSize) = (1000,1000,1000)
```
Example (live book at 19:25, BTC pool `0xc92dc97f3c1a9bcd63ea1d7294759bee6102bbc7`): best YES bid 627000 → NO ask 373000 (0.373). Cross it by one tick: BUY_NO at YES-price **626000** (= NO 0.374), qty **10000000** (10 tokens, ≥min 1000, lot-aligned), expiry = market expiry in ns:
```bash
cast send $POOL 'placeBinaryOrder(uint8,uint256,uint256,uint64,uint8,uint8,address,uint96,uint64)' \
  2 626000 10000000 $((EXPIRY_SEC * 1000000000)) 0 0 0x0000000000000000000000000000000000000000 0 0 \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url $RPC --gas-limit 10000000 --gas-price 8000000000 --priority-gas-price 1000000000
# cost ≈ qty × 373000 / 1e6 = 3.73 tUSDC; you now hold 1e7 NO tokens (id = (pool<<72)|(nonce<<8)|1)
```
(d) **Wait for settlement** (~1 min on the 60-s series; fully automatic). Check:
```bash
cast call $MARKET 'isResolved()(bool)' --rpc-url $RPC
cast call $MARKET 'payoutNumerators()(uint256[])' --rpc-url $RPC   # [10M,0] YES won, [0,10M] NO won
```
(e) **Redeem winnings.** NO-side wins (`outcomeIdx=1`). Direct path (what live bots use): first make the settlement an operator on the ERC-6909 singleton (one grant covers all ids), then:
```bash
cast send 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9 'setOperator(address,bool)' 0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23 true \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url $RPC --gas-limit 10000000 --gas-price 8000000000 --priority-gas-price 1000000000
OUTCOME_ID=$(python -c "print((int('$POOL',16)<<72) | ($NONCE<<8) | 1)")
cast send 0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23 'finalizeAndRedeem(address,uint256,uint256,address)' $POOL $OUTCOME_ID 10000000 $YOUR_ADDR \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url $RPC --gas-limit 10000000 --gas-price 8000000000 --priority-gas-price 1000000000
# → Redeemed(marketKey, holder, to, outcomeIdx=1, amountBurned=1e7, collateralOut≈1e7)  (fee 0)
```
Trader-facing alternative via the module: `setOperator(module,true)`, then `finalizeMarket(marketId)` and `redeem(operatorId=2, venueId=0x6797…, marketId, outcomeIdx=1, amount)` (or op=4/venue `0x1a1e…` for the Pricefeed-test series). If NO loses, payout is 0 — burn nothing; just skip redeeming the loser side.

## 6. Notes / gaps
- No public indexer URL is configured (`SOMNIA_INDEXER_URL` empty in `.env`; SDK defaults to none) — everything above is RPC/explorer-verified.
- Fee = 0 on this testnet venue; mainnet will skim `settlementFeeBpsTimes1k`.
- Pools are recycled across markets (nonce increments); always key by `marketId` and use the current `marketNonce` for outcome ids.
- SENTRIC relevance: a "buy Down (NO)" is exactly the payout leg of a put; the 15-min op-2 series is the one to hedge against; place orders at roll boundaries.
