# Somnia Base Agent IDs (TESTNET) — verified 2026-08-30

Platform (testnet): `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`
RPC: `https://api.infra.testnet.somnia.network` (chain 50312)

## The two agents we use

| Agent (slug) | Name | agentId (decimal) | agentId (hex) | price/req observed |
|---|---|---|---|---|
| `json-fetch` | JSON API Request | **13174292974160097713** | **0xb6d47da8dbbcb1b1** | 0.03 STT |
| `llm-inference` | LLM Inference | **12847293847561029384** | **0xb24ac1afbcefc708** | 0.07 STT |

IDs are the same on testnet and mainnet (only platform address differs).

## Confirmation sources
- https://github.com/somnia-chain/agentathon → `somnia-agents-examples/contracts/PriceOracle.sol`
  (`JSON_API_AGENT_ID = 13174292974160097713`), `somnia-agents-examples/contracts/SentimentAnalyzer.sol`
  (`LLM_AGENT_ID = 12847293847561029384`), `somnia-agents-examples/README.md` (table of all 3 base agents),
  `somnia-agents-skills/references/agents.json` (canonical registry, keys `json-fetch` / `llm-inference`).
- https://dev.to/kalidecoder/beyond-static-code-building-an-ai-powered-vc-critic-on-somnia-2jp3
  (LLM Inference agent, Agent ID: 12847293847561029384, testnet platform).
- On-chain (eth_getLogs on platform contract, `RequestCreated` event, topic2 = agentId):
  json-fetch seen 150×, llm-inference seen 201× in the last ~32k blocks.

## Worked examples (on-chain, status 0x1)
- json-fetch: tx `0x043a51caf202a47db8356b7ff8f7acf393970bcb9851b1816bc3f1bd2124d9f0`
  (blk 475280859) — agentId 0xb6d47da8dbbcb1b1, value 0.03 STT,
  payload selector `0xac0ea076` = `fetchInt(string,string,uint8)`:
  `fetchInt("https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDC&interval=1m&startTime=...&endTime=...&limit=1", "[0][4]", 2)`
  (batch of 12 such price requests in one tx: BTC/ETH x binance/okx/bybit/kucoin/gateio/mexc).
- llm-inference: tx `0x8603c26d05e5c7956b236a3e67e507eb6f061d7a361bb28f2dc0ab151221b9bc`
  (blk 475272553) — agentId 0xb24ac1afbcefc708, value 0.07 STT,
  payload selector `0xc6833c3d` = `inferNumber(string,string,int256,int256,bool)`:
  prompt "Question: Will Bitcoin dip to $52,500 in August 2026? ...", system momentum-forecaster prompt, min 0, max 10000.
  Also: `0x3fdf6b8231281d5060bf4b01d695da2a9f77c1b0a8aae7b108b20c90c34ddbe2` (blk 475281370).

## Deposits
- `getRequestDeposit()` = **30000000000000000 wei = 0.03 STT** (cast call, verified).
- Observed msg.value on-chain: 0.03 STT for json-fetch, 0.07 STT for llm-inference (matches per-agent pricing).

## CAVEAT — do NOT use these by mistake
A third agent id is heavily used on-chain: **9911223344556677889 (0x898bbd1eb5dc1b01)** — 3120 requests
in the last ~32k blocks, always with a 33-currency-pair payload and a custom method selector `0xd2451c2e`
(NOT part of the base json-fetch ABI). It is a custom/deployed agent (market-data aggregator), NOT the base
JSON API Request agent. Verify by selector before trusting any example code found online.
