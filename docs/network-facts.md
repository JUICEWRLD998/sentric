# SENTRIC — Confirmed Network Facts (verified against Somnia/DreamDEX docs, Aug 2026)

> Source of truth for addresses, RPC, interfaces, and fee sizing. Update if the docs change.
> These were pulled directly from the official docs; re-confirm on-chain before mainnet.

## 1. Somnia network info

| Property | Mainnet | Testnet |
|---|---|---|
| Chain ID | 5031 | **50312** |
| RPC (HTTPS) | https://api.infra.mainnet.somnia.network | **https://api.infra.testnet.somnia.network** |
| RPC (WSS) | wss://api.infra.mainnet.somnia.network/ws | wss://api.infra.testnet.somnia.network/ws |
| Native token | SOMI | **STT** |
| Block explorer | https://explorer.somnia.network | **https://shannon-explorer.somnia.network** |
| Alt explorer | — | https://somnia-testnet.socialscan.io |
| Faucet | stakely.io/faucet/somnia-somi | **https://testnet.somnia.network** |
| MultiCallV3 | 0x5e44F178E8cF9B2F5409B6f18ce936aB817C5a11 | 0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223 |

- Mainnet is LIVE. Deploy on testnet (50312) for the hackathon; require STT for gas + agent fees.
- Public node RPC alt: https://somnia.publicnode.com (also for testnet per providers table).

## 2. DreamDEX Event Contracts — protocol core (CREATE3 → identical testnet = mainnet)

| Contract | Address |
|---|---|
| BinaryMarketsModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| MarketsCore | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` |
| BinarySettlement | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| OutcomeToken6909 | `0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9` |
| OracleHub | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b` |
| CollateralRouter | `0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C` |

- **Never hardcode a per-market / pool address** — read from the module registry (`markets(marketId)`) or the SDK; pools are recycled across windows.
- The SDK exports ABIs directly: `binaryModuleReadAbi`, `binaryModuleWriteAbi`, `binarySettlementAbi`, `erc6909Abi`, `oracleHubAbi`. Pull them via `npm pack @somnia-chain/markets-sdk` and read `src/` (human-readable signatures mirror Solidity). **TODO: read the exact `placeOrder` full signature from `binaryModuleWriteAbi`** (the bot-kit shows it truncated: `placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 ...)`).

## 3. Collateral (per venue)

| Network | Token | Address | Decimals |
|---|---|---|---|
| Mainnet | USDso | `0x00000022dA000002656c64D9eA6011ea952D008A` | 18 |
| Testnet | tUSDC | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | 6 |

- **They differ by 10^12.** Derive scale from the collateral's `decimals()` — never from a literal constant.
- Testnet collateral mints on demand: `faucet(uint256 amount)` credits `msg.sender`, capped at **10,000 tUSDC** per call (reverts `FaucetCapExceeded`). SDK convenience: `exchange.trader.faucet()` (10,000) or `faucet({amount: 500n*10n**6n})`.
- **Complete sets:** 1 USDso = 1 Up + 1 Down (mint/merge for sell-side inventory). Up price = probability in (0,1); Down price = 1 − Up price (single book).

## 4. Somnia Agents — platform contract (AgentRequester / SomniaAgents)

| Network | Address |
|---|---|
| Mainnet (5031) | `0x5E5205CF39E766118C01636bED000A54D93163E6` |
| Testnet (50312) | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |

### 4.1 Core interfaces (copy verbatim into contracts)

```solidity
enum ConsensusType { Majority, Threshold }
enum ResponseStatus { None, Pending, Success, Failed, TimedOut } // 0,1,2,3,4

struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;
    uint256 threshold;
    uint256 createdAt;
    uint256 deadline;
    ResponseStatus status;
    ConsensusType consensusType;
    uint256 remainingBudget;   // escrow remaining at any point in lifecycle
    uint256 perAgentBudget;    // max each elected member can claim (set at creation)
}

interface IAgentRequester {
    event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, uint256 perAgentBudget, bytes payload, address[] subcommittee);
    event RequestFinalized(uint256 indexed requestId, ResponseStatus status);
    event SubcommitteePaid(uint256 indexed requestId, uint256 totalPaid, uint256 perMember);
    event CommitteeDepositFailed(uint256 indexed requestId, uint256 attemptedAmount);

    function createRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes calldata payload)
        external payable returns (uint256 requestId);
    function createAdvancedRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes calldata payload,
        uint256 subcommitteeSize, uint256 threshold, ConsensusType consensusType, uint256 timeout)
        external payable returns (uint256 requestId);
    function getRequest(uint256 requestId) external view returns (Request memory);
    function hasRequest(uint256 requestId) external view returns (bool);
    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);
}

interface IAgentRequesterHandler {
    function handleResponse(uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory details) external;
}
```

- **Flow:** contract → `createRequest{value: deposit}(agentId, callback, selector, payload)` → validators execute → consensus → platform calls your `handleResponse(requestId, responses, status, details)` → rebate of unused budget to requester.
- **Gate `handleResponse`**: it's external and anyone can call it → require `msg.sender == PLATFORM`.
- **Implement `receive() external payable`** (rebates are pushed on finalisation; without it the transfer fails silently).
- **Handle every status:** `Success` (2) / `Failed` (3) / `TimedOut` (4).

### 4.2 Base agent methods (payload = ABI-encoded call to these)

**JSON API Request** (price/data feed):
```solidity
fetchString(string url, string selector) returns (string)
fetchUint(string url, string selector, uint8 decimals) returns (uint256)
fetchInt(string url, string selector, uint8 decimals) returns (int256)
fetchBool(string url, string selector) returns (bool)
fetchStringArray(string url, string selector) returns (string[])
fetchUintArray(string url, string selector, uint8 decimals) returns (uint256[])
```
- `selector` is dot-notation, e.g. `bitcoin.usd`, `items[0].name`. `decimals` multiplies by 10^decimals.
- Example (viem `encodeFunctionData`): fetch BTC price → url `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`, selector `bitcoin.usd`, decimals 8.

**LLM Inference** (the decision):
```solidity
inferString(string prompt, string system, bool chainOfThought, string[] allowedValues) returns (string)
inferNumber(string prompt, string system, int256 minValue, int256 maxValue, bool chainOfThought) returns (int256)
inferChat(string[] roles, string[] messages, bool chainOfThought) returns (string)
inferToolsChat(string[] roles, string[] messages, string[] mcpServerUrls, OnchainTool[] onchainTools, uint256 maxIterations, bool chainOfThought)
    returns (string finishReason, string response, string[] updatedRoles, string[] updatedMessages, string[] pendingToolCallIds, bytes[] pendingToolCalls)
```
- **`inferString` with `allowedValues`** = constrained deterministic output. This is the SENTRIC decision: `inferString(prompt, system, false, ["HEDGE","STAND_DOWN","HOLD"])`.
- **`inferNumber` with clamp** = confidence: `inferNumber(prompt, system, 0, 100, false)`.
- Deterministic: fixed seeds + controlled temperature → byte-identical across validators → consensus.

### 4.3 Fee / deposit sizing (subcommittee default 3, minPerAgentDeposit = 0.01)

| Agent Type | Per-agent price | Practical msg.value (subSize 3) |
|---|---|---|
| JSON API Request (`json-fetch`) | 0.03 SOMI/STT | **0.12** |
| LLM Inference (`llm-inference`) | 0.07 SOMI/STT | **0.24** |
| LLM Parse Website | 0.10 SOMI/STT | 0.33 |

- `msg.value = minPerAgentDeposit×subSize + per_agent_price×subSize`. Depositing only the floor → runners skip → timeout. Over-deposit is rebated.
- One SENTRIC decision cycle = 1 JSON fetch (0.12) + 1 LLM infer (0.24) ≈ **0.36 STT** per window (sub-cent; testnet STT is free from faucet anyway).

### 4.4 Agent IDs (TODO — fetch at Phase 2)
- The literal `agentId` values are NOT in the docs text; discover them via the **Agent Explorer**:
  - Testnet: https://agents.testnet.somnia.network
  - Mainnet: https://agents.somnia.network
- The explorer lists all agents, their methods, lets you invoke + view receipts + generate Solidity/TS snippets. Copy the agentIds for `json-fetch` and `llm-inference` from there.

## 5. Key gotchas (consolidated)

- Event Contracts: indexer lags → gate writes on live `onchain.status === 1` (Trading); row ids are strings but client wants hex-typed; receipt rides on `order.info`; use IOC; SDK ≥ 0.28.0.
- Markets die on schedule and respawn; settled markets leave the live list; scan recently-settled to redeem.
- Reactivity: precompile `0x0100`; contract must hold ≥ 32 SOMI/STT; min base fee 6 gWei (6,000,000,000 wei); no on-chain wildcard subscriptions; avoid recursive re-triggers.
- Agents: implement `receive()`; gate `handleResponse`; handle Success/Failed/TimedOut; deposit more than the floor.

## 6. Reactivity — CONFIRMED interfaces (from `@somnia-chain/reactivity-contracts@0.2.1`, verified in `contracts/lib/reactivity-contracts/`)

- **Base class:** `SomniaEventHandler` — external `onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data)` gates `msg.sender == 0x0100` (reverts `OnlyReactivityPrecompile` otherwise), then calls the internal `_onEvent(emitter, eventTopics, data)` you override. Also implements ERC-165.
- **Subscribe (library `SomniaExtensions`, internal):**
  `subscribe(address handler, SubscriptionFilter memory filter, SubscriptionOptions memory options) returns (uint256 subscriptionId)`
  - `SubscriptionFilter { bytes32[4] eventTopics; address origin; address emitter; }` — at least ONE non-wildcard criterion required (`EmptyFilter`).
  - `SubscriptionOptions { uint64 priorityFeePerGas; uint64 maxFeePerGas; uint64 gasLimit; }` — `defaultSubscriptionOptions()` = {0, 20 gwei, 10M gas}. Validation: `priorityFeePerGas + 6 gwei <= maxFeePerGas` (`InvalidMaxFeePerGas`).
  - Requires `address(this).balance >= 32 ether` on the **subscribing contract itself** (checked inside `_subscribe`) — reverts `InsufficientBalance`. The owner is the contract that calls `subscribe`; callbacks are paid from its balance.
  - Convenience: `scheduleSubscriptionAtBlock/AtEpoch/AtTimestamp`, `unsubscribe(uint256)`, `getSubscriptionInfo(uint256)`.
- **System events (emitter = 0x0100):** `BlockTick(uint64 indexed blockNumber)` — every block (~100ms); `EpochTick(uint64 indexed epochNumber, uint64 indexed blockNumber)` — every **3000 ledger blocks ≈ 5 minutes** (testnet + mainnet, per docs.somnia.network sustained-use-gas-discounts); `Schedule(uint256 indexed timestampMillis)`. Topic0 = `EventName.selector`.
- **Callback gas math (6 gwei base, ~45k gas emit-event callback):** ~0.00027 STT/callback. BlockTick ≈ 233 STT/day (drains the 32 STT reserve in hours — NOT viable as a standing subscription); EpochTick ≈ 0.078 STT/day (negligible). → **Subscribe to EpochTick, not BlockTick.**
- **Constants:** precompile address `0x0100`; `SUBSCRIPTION_OWNER_MINIMUM_BALANCE = 32 ether`; `MINIMUM_BASE_FEE_PER_GAS = 6 gwei`; `MAXIMUM_HANDLER_GAS_LIMIT = 200_000_000`; defaults above.
- **Phase 1 implementation (SentricBrain):** `arm()` (payable, owner-only) subscribes to `EpochTick.selector` with wildcard epoch + emitter 0x0100; `_onEvent` emits `TickObserved(block.number, block.timestamp)`; `disarm()` unsubscribes. Deploy funds 33 STT (32 reserve + callback gas).
