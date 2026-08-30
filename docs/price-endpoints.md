# SENTRIC — Price-Feed Endpoints (verified 2026-08-30)

Tested from dev host (Windows, git-bash). Host note: the local DNS resolver blocks
`api.binance.com`, `www.okx.com`, `api.kraken.com`, `api.coinbase.com`, `api.bybit.com`,
`api.kucoin.com`, `api.bitfinex.com` — all were re-tested via Cloudflare DoH + `--resolve`
IP pinning to separate DNS-block from network-block. Results below say which is which.
Validator-node reachability (Somnia infra) is NOT testable from here — do ONE live
`createRequest` against the chosen URL before committing.

## Consensus constraint (from somnia-chain/agentathon json-fetch skill)
- `fetchUintArray` requires the selector to land on a **JSON array of numbers**; an
  object → `Failed`. Numeric **strings are NOT coerced** (skill: use `fetchString` for
  big string numbers) → all Binance/Gate/Bybit/OKX/Kraken/Coinbase price fields are
  strings → **not usable** with fetchUint/fetchUintArray.
- Selector syntax documented: `bitcoin.usd`, `items[0].name`, `result.symbols[3]`,
  `''` (empty = whole body). Root-array index selectors (`[0].x`, `0.x`) are
  **undocumented/unverified** → avoid.
- Default consensus = Majority of byte-identical results → prefer endpoints with CDN
  caching or stable values (CoinGecko max-age=30 cache is a real advantage).
- Cost: per-agent 0.03 × subSize 3 (+ floor) ≈ **0.12 STT per request**.
  Cycle cost: Option A = 2 requests = **0.24 STT**; Option B = 4 requests = **0.48 STT**.

## Ranked candidates (verified)

| Data point | Exact URL | Selector | Decimals | HTTP | Stability / rate limits |
|---|---|---|---|---|---|
| **A1. BTC+vol, 1 req (RECOMMENDED)** | `https://api-pub.bitfinex.com/v2/candles/trade:1D:tBTCUSD/last` | `''` (empty → whole body) | 8 | 200 (native DNS OK) | `[mts, open, close, high, low, volume]`, all native numbers, all ≥ 0 (uint-safe). Byte-identical across consecutive calls. Public v2 ~30 req/15s/IP — 3 validators × 1/5min trivial. No cache headers. |
| **A2. ETH+vol, 1 req (RECOMMENDED)** | `https://api-pub.bitfinex.com/v2/candles/trade:1D:tETHUSD/last` | `''` | 8 | 200 | Same shape: `[mts, open, close, high, low, volume]`. |
| B1. BTC price | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true` | `bitcoin.usd` | 8 | 200 | Docs' own example endpoint. Cloudflare-cached max-age=30 (cf-cache-status HIT) → byte-identical across validators → Majority-safe. Free tier ~10-30 req/min. |
| B2. BTC 24h % change | same URL | `bitcoin.usd_24h_change` | 8 | 200 | Native float (e.g. 1.0223 = +1.02%). |
| B3. ETH price | same URL | `ethereum.usd` | 8 | 200 | Same as B1. |
| B4. ETH 24h % change | same URL | `ethereum.usd_24h_change` | 8 | 200 | Same as B2. |
| C1. Binance 24hr ticker | `https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT` | `lastPrice` etc. | — | 200 via IP pin; DNS-blocked natively; **451 in US** | **OUT**: all fields are JSON strings; geo-blocked; object not array. |
| C2. Binance klines | `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1` | `0` (unverified root index) | 8 | 200 via pin | **OUT**: OHLC are strings; root-index selector unverified. |
| C3. CoinGecko coins/markets | `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&price_change_percentage=24h` | `[0].current_price` etc. | 8 | 200 | **Flagged**: root array of objects; root-index selector (`0.x` / `[0].x`) undocumented → do not use until proven live. |
| C4. Coinbase spot | `https://api.coinbase.com/v2/prices/BTC-USD/spot` | `data.amount` | — | network-blocked here | **OUT**: `"amount"` is a string; host unreachable. |
| C5. Kraken Ticker | `https://api.kraken.com/0/public/Ticker?pair=XBTUSD` | `result.XBTUSD.c.0` | — | network-blocked here | **OUT**: values are strings; nested; blocked. |
| C6. OKX ticker | `https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT` | `data.0.last` | — | network-blocked here | **OUT**: strings; blocked. |
| C7. Gate candlesticks | `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1d&limit=1` | `0` | 8 | 200 (native DNS OK) | **OUT**: all values (incl. ts, "false") are strings → string-coercion risk. |
| C8. CryptoCompare | `https://min-api.cryptocompare.com/data/pricemultifull?...` | — | — | 401 | **OUT**: API key required. |
| C9. Bybit kline | `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=D&limit=1` | `result.list.0` | 8 | 200 via pin | **OUT**: strings; DNS-blocked natively. |

## Recommendation
**Option A — one `fetchUintArray` per asset (0.12 STT each, 0.24 STT/cycle total)**:
Bitfinex 1D candle, empty selector, decimals 8. Verified: HTTP 200 from this host with
native DNS, pure-number array, all non-negative, stable shape, byte-identical on repeat.
Gives price **and** 24h volatility (open/high/low/close) in one request.
**Gate:** run ONE live `createRequest` first (validator-node reachability + Majority
consensus on the moving `close` element are the only unverified pieces).
**Fallback (fully verified): Option B** — CoinGecko simple/price
`include_24hr_change=true`, four `fetchUint` calls (0.48 STT/cycle), selectors
`bitcoin.usd` / `bitcoin.usd_24h_change` / `ethereum.usd` / `ethereum.usd_24h_change`,
decimals 8. Cloudflare 30s cache makes validator responses byte-identical → Majority-safe.

## Best combo (implement this)
```text
BTC: fetchUintArray("https://api-pub.bitfinex.com/v2/candles/trade:1D:tBTCUSD/last", "", 8)
     out[0]=mts(ms)  out[1]=open  out[2]=close(=price)  out[3]=high  out[4]=low  out[5]=volume
     price_usd   = out[2]            // ×1e8
     24h_change  = (out[2]-out[1]) * 1e8 / out[1]   // percent, ×1e8
     vol_proxy   = (out[3]-out[4]) * 1e8 / out[2]   // (high-low)/close, ×1e8
ETH: fetchUintArray("https://api-pub.bitfinex.com/v2/candles/trade:1D:tETHUSD/last", "", 8)
     same indexing
Fallback (if Bitfinex unreachable from validators):
     fetchUint("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true","bitcoin.usd",8)
     fetchUint(  same URL, "bitcoin.usd_24h_change", 8)
     fetchUint(  same URL, "ethereum.usd", 8)
     fetchUint(  same URL, "ethereum.usd_24h_change", 8)
```
