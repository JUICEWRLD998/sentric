// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/interfaces/SomniaExtensions.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaReactivityPrecompile.sol";
import {AgentTypes, IAgentRequester, IAgentRequesterHandler, IAgentMethods} from "./lib/IAgentRequester.sol";
import {IBinaryPool, IBinarySettlement, IBinaryMarket, IERC20} from "./lib/IBinaryVenue.sol";
import {SentricVault} from "./SentricVault.sol";

/// @title SentricBrain
/// @notice The reactive "brain" of Sentric — Phase 2: self-wake (reactivity) +
///         on-chain AI decision cycle (JSON price fetch -> LLM action ->
///         LLM confidence) with a consensus-verified AuditEvent per cycle.
/// @dev Extends the official SomniaEventHandler (precompile 0x0100 gates
///      onEvent). Each EpochTick (every 3000 blocks ≈ 5 min) with no cycle in
///      flight starts: 1x JSON-API fetch of BTC price, then 2x LLM calls
///      (action from {HEDGE, STAND_DOWN, HOLD} + confidence 0-100). Results
///      arrive asynchronously via handleResponse (gated to the platform).
///      Phase 3 will place the hedge order on DreamDEX when action == HEDGE.
contract SentricBrain is SomniaEventHandler, IAgentRequesterHandler {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Async decision-cycle state machine.
    enum State {
        Idle, // no cycle in flight
        Fetching, // JSON-API price request outstanding
        Deciding, // LLM action request outstanding
        Scoring // LLM confidence request outstanding
    }

    /// @notice What a pending platform request is for (correlates callbacks).
    enum Stage {
        None,
        Fetching,
        Deciding,
        Scoring
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event TickObserved(uint256 indexed blockNumber, uint256 timestamp);
    event Armed(address indexed owner, uint256 subscriptionId);
    event Disarmed(address indexed owner, uint256 subscriptionId);
    event CycleStarted(uint256 indexed blockNumber, uint256 requestId);
    event CycleFailed(uint256 indexed requestId, AgentTypes.ResponseStatus status);
    event AuditEvent(
        bytes32 inputsHash,
        string decision,
        uint8 confidence,
        address indexed asset
    );
    event AgentIdsSet(uint256 jsonFetchId, uint256 llmId);
    event JsonParamsSet(string url, string priceSelector, uint8 decimals);
    event FetchModeSet(bool arrayFetch);
    event AgentFeesSet(uint256 jsonFee, uint256 llmFee);
    event HedgeConfigSet(
        address vault,
        uint256 exposureNotional,
        uint256 maxPremiumPerWindow,
        uint256 expectedMoveBps,
        uint256 downPriceBps
    );
    event HedgeExecuted(uint256 size, uint256 yesPrice, uint8 confidence);
    event HedgeRedeemed(uint8 outcomeIdx, uint256 amount, uint256 collateralOut);
    event PositionOpened(uint64 nonce, uint256 qtyRaw, address pool);
    event HedgeExpired(uint64 nonce);
    event HedgeFailed(uint256 size, uint256 yesPrice);
    event HedgeRedeemFailed(uint64 nonce);
    event StopLossEngaged(uint256 lossStreak);
    event Swept(address indexed owner, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotOwner();
    error AlreadySubscribed();
    error NotSubscribed();
    error NotPlatform();
    error NotRequester();
    error UnknownRequest();
    error NotConfigured();
    error StillArmed();

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @dev Placeholder market asset id (real venue markets arrive in Phase 3).
    address public constant ASSET_BTC = address(1);

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public immutable owner;
    IAgentRequester public immutable platform;

    uint256 public subscriptionId;
    bool public isSubscribed;

    State public state = State.Idle;
    mapping(uint256 => Stage) public pendingRequests;

    /// @dev Somnia Agents agentIds (set via setAgentIds).
    uint256 public jsonFetchAgentId;
    uint256 public llmAgentId;

    /// @dev msg.value per agent call: getRequestDeposit() floor + pricePerAgent x
    ///      subcommittee(3) — 0.03+0.03*3 = 0.12 (json), 0.03+0.07*3 = 0.24 (llm).
    ///      Over-deposits are rebated by the platform. Owner-tunable.
    uint256 public jsonFee = 0.12 ether;
    uint256 public llmFee = 0.24 ether;

    /// @dev JSON price-fetch config (set via setJsonParams).
    string public jsonUrl;
    string public priceSelector;
    uint8 public jsonDecimals;

    /// @dev true = one fetchUintArray(url, "", decimals) returning
    ///      [mts, open, close, high, low, volume] (Bitfinex candle);
    ///      false = one fetchUint(url, priceSelector, decimals) (CoinGecko).
    bool public arrayFetch;

    /// @dev Last cycle inputs (for the audit receipt + the LLM prompt).
    uint256 internal _lastPrice;
    int256 internal _lastChangeBps; // 24h change, basis points (close vs open, or vs prev cycle)
    int256 internal _lastVolBps; // (high-low)/close basis points (0 in scalar mode)

    /// @dev Phase 3: the vault the agent executes hedges through + sizing knobs.
    SentricVault public vault;
    uint256 public exposureNotional; // 6-dec tUSDC units (1_000_000 = 1 USDC)
    uint256 public maxPremiumPerWindow; // 6-dec tUSDC units
    uint256 public expectedMoveBps = 200; // insure against a 2% adverse move
    uint256 public downPriceBps = 4500; // P(Down) = 45% (operator-set from the book)

    /// @dev Phase 4: open-position tracking (auto-redeem) + stop-loss.
    address public lastOrderPool;
    uint64 public lastOrderNonce;
    uint256 public lastOrderQtyRaw;
    bool public positionOpen;
    uint256 public lossStreak;
    /// @dev Consecutive losing windows before hedging stops (resets on a win).
    uint256 internal constant STOP_LOSS_STREAK = 3;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(IAgentRequester platform_) {
        owner = msg.sender;
        platform = platform_;
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ---------------------------------------------------------------------
    // Configuration (owner)
    // ---------------------------------------------------------------------

    function setAgentIds(uint256 jsonFetchId, uint256 llmId) external onlyOwner {
        jsonFetchAgentId = jsonFetchId;
        llmAgentId = llmId;
        emit AgentIdsSet(jsonFetchId, llmId);
    }

    function setJsonParams(string calldata url, string calldata selector, uint8 decimals)
        external
        onlyOwner
    {
        jsonUrl = url;
        priceSelector = selector;
        jsonDecimals = decimals;
        emit JsonParamsSet(url, selector, decimals);
    }

    /// @notice Switch the JSON fetch mode (Bitfinex array vs CoinGecko scalar).
    function setFetchMode(bool useArray) external onlyOwner {
        arrayFetch = useArray;
        emit FetchModeSet(useArray);
    }

    /// @notice Tune the per-call agent fees (see storage comment for sizing).
    function setAgentFees(uint256 jsonFee_, uint256 llmFee_) external onlyOwner {
        jsonFee = jsonFee_;
        llmFee = llmFee_;
        emit AgentFeesSet(jsonFee_, llmFee_);
    }

    /// @notice Point the agent at its execution vault + sizing parameters.
    function setHedgeConfig(
        SentricVault vault_,
        uint256 exposureNotional_,
        uint256 maxPremiumPerWindow_,
        uint256 expectedMoveBps_,
        uint256 downPriceBps_
    ) external onlyOwner {
        vault = vault_;
        exposureNotional = exposureNotional_;
        maxPremiumPerWindow = maxPremiumPerWindow_;
        expectedMoveBps = expectedMoveBps_;
        downPriceBps = downPriceBps_;
        emit HedgeConfigSet(
            address(vault_),
            exposureNotional_,
            maxPremiumPerWindow_,
            expectedMoveBps_,
            downPriceBps_
        );
    }

    /// @notice Whether a full decision cycle can run (ids + fetch config set).
    /// @dev Array mode uses an EMPTY selector (whole-body array) — so the
    ///      selector requirement only applies to scalar (fetchUint) mode.
    function cycleEnabled() public view returns (bool) {
        if (
            jsonFetchAgentId == 0 ||
            llmAgentId == 0 ||
            bytes(jsonUrl).length == 0
        ) {
            return false;
        }
        return arrayFetch || bytes(priceSelector).length != 0;
    }

    // ---------------------------------------------------------------------
    // Reactivity lifecycle
    // ---------------------------------------------------------------------

    /// @notice Arm the guardian: subscribe to EpochTick so the chain self-wakes
    ///         this contract every epoch — no keeper.
    /// @dev Payable so one tx can both fund the >= 32 STT gas reserve required
    ///      by the precompile and create the subscription.
    function arm() external payable onlyOwner {
        if (isSubscribed) revert AlreadySubscribed();

        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions
            .SubscriptionFilter({
                eventTopics: [
                    ISomniaReactivityPrecompile.EpochTick.selector,
                    bytes32(0),
                    bytes32(0),
                    bytes32(0)
                ],
                origin: address(0),
                emitter: SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
            });

        subscriptionId = SomniaExtensions.subscribe(
            address(this),
            filter,
            SomniaExtensions.defaultSubscriptionOptions()
        );
        isSubscribed = true;
        emit Armed(owner, subscriptionId);
    }

    /// @notice Disarm the guardian: cancel the reactivity subscription.
    function disarm() external onlyOwner {
        if (!isSubscribed) revert NotSubscribed();
        SomniaExtensions.unsubscribe(subscriptionId);
        isSubscribed = false;
        emit Disarmed(owner, subscriptionId);
    }

    /// @notice Recover the gas reserve. Only callable while disarmed (the
    ///         precompile requires >= 32 STT on the owner while subscribed).
    function sweep() external onlyOwner {
        if (isSubscribed) revert StillArmed();
        uint256 balance = address(this).balance;
        payable(owner).transfer(balance);
        emit Swept(owner, balance);
    }

    // ---------------------------------------------------------------------
    // Reactivity callback (precompile 0x0100 calls onEvent -> _onEvent)
    // ---------------------------------------------------------------------

    /// @inheritdoc SomniaEventHandler
    function _onEvent(
        address,
        bytes32[] calldata eventTopics,
        bytes calldata
    ) internal override {
        if (
            eventTopics.length == 0 ||
            eventTopics[0] != ISomniaReactivityPrecompile.EpochTick.selector
        ) {
            return;
        }

        emit TickObserved(block.number, block.timestamp);

        // Phase 4: settle any open position from a previous window first
        // (before a new cycle can place another order).
        if (positionOpen) {
            _tryRedeemPosition();
        }

        // One decision cycle at a time; skip if one is in flight or unconfigured.
        if (state != State.Idle || !cycleEnabled()) return;

        // ---- Stage 1: fetch BTC price via the JSON API agent -----------------
        bytes memory payload = arrayFetch
            ? abi.encodeCall(IAgentMethods.fetchUintArray, (jsonUrl, "", jsonDecimals))
            : abi.encodeCall(IAgentMethods.fetchUint, (jsonUrl, priceSelector, jsonDecimals));
        uint256 fee = jsonFee;
        uint256 requestId = platform.createRequest{value: fee}(
            jsonFetchAgentId,
            address(this),
            IAgentRequesterHandler.handleResponse.selector,
            payload
        );
        pendingRequests[requestId] = Stage.Fetching;
        state = State.Fetching;
        emit CycleStarted(block.number, requestId);
    }

    // ---------------------------------------------------------------------
    // Async agent callback (called by the platform only)
    // ---------------------------------------------------------------------

    /// @inheritdoc IAgentRequesterHandler
    function handleResponse(
        uint256 requestId,
        AgentTypes.Response[] memory responses,
        AgentTypes.ResponseStatus status,
        AgentTypes.Request memory details
    ) external override {
        if (msg.sender != address(platform)) revert NotPlatform();
        if (details.requester != address(this)) revert NotRequester();

        Stage stage = pendingRequests[requestId];
        if (stage == Stage.None) revert UnknownRequest();

        // Any non-success end state resets the cycle (Failed / TimedOut).
        if (status != AgentTypes.ResponseStatus.Success) {
            delete pendingRequests[requestId];
            state = State.Idle;
            emit CycleFailed(requestId, status);
            return;
        }

        bytes memory result = _firstSuccessResult(responses);

        if (stage == Stage.Fetching) {
            _onFetched(requestId, result);
        } else if (stage == Stage.Deciding) {
            _onDecided(requestId, result);
        } else if (stage == Stage.Scoring) {
            _onScored(requestId, result);
        }
    }

    // ---------------------------------------------------------------------
    // Decision-cycle stages
    // ---------------------------------------------------------------------

    function _onFetched(uint256 requestId, bytes memory result) internal {
        delete pendingRequests[requestId];

        uint256 price;
        int256 changeBps;
        int256 volBps;

        if (arrayFetch) {
            // Bitfinex 1D candle: [mts, open, close, high, low, volume]
            uint256[] memory arr = abi.decode(result, (uint256[]));
            if (arr.length < 6 || arr[1] == 0 || arr[2] == 0) {
                state = State.Idle;
                emit CycleFailed(requestId, AgentTypes.ResponseStatus.Failed);
                return;
            }
            price = arr[2];
            changeBps = (int256(arr[2]) - int256(arr[1])) * 10_000 / int256(arr[1]);
            volBps = (int256(arr[3]) - int256(arr[4])) * 10_000 / int256(arr[2]);
        } else {
            price = abi.decode(result, (uint256));
            if (price == 0) {
                // Zero price = garbage fetch; abort the cycle, wait for next tick.
                state = State.Idle;
                emit CycleFailed(requestId, AgentTypes.ResponseStatus.Failed);
                return;
            }
            // On-chain volatility proxy: % change vs the previous cycle's price.
            if (_lastPrice != 0) {
                changeBps =
                    (int256(price) - int256(_lastPrice)) * 10_000 / int256(_lastPrice);
            } else {
                changeBps = 0;
            }
            volBps = 0;
        }
        _lastPrice = price;
        _lastChangeBps = changeBps;
        _lastVolBps = volBps;

        // ---- Stage 2: LLM action (constrained output set) --------------------
        bytes memory payload = abi.encodeCall(
            IAgentMethods.inferString,
            (
                _buildDecisionPrompt(price, changeBps, volBps),
                "You are a deterministic risk controller. Output exactly one token from the allowed set. No commentary.",
                false,
                _allowedActions()
            )
        );
        uint256 fee = llmFee;
        uint256 nextId = platform.createRequest{value: fee}(
            llmAgentId,
            address(this),
            IAgentRequesterHandler.handleResponse.selector,
            payload
        );
        pendingRequests[nextId] = Stage.Deciding;
        state = State.Deciding;
    }

    function _onDecided(uint256 requestId, bytes memory result) internal {
        delete pendingRequests[requestId];

        string memory decision = abi.decode(result, (string));
        bytes memory decisionBytes = bytes(decision);

        // ---- Stage 3: LLM confidence (0-100) ----------------------------------
        // The model is stateless across requests — it MUST see its own decision
        // in the prompt or it cannot score confidence meaningfully.
        bytes memory payload = abi.encodeCall(
            IAgentMethods.inferNumber,
            (
                string.concat(
                    "You decided: ",
                    decision,
                    ". Given: BTC price $",
                    _toDecimal(_lastPrice, jsonDecimals, 2),
                    ", 24h change ",
                    _formatSignedBps(_lastChangeBps),
                    "%, intraday range ",
                    _formatSignedBps(_lastVolBps),
                    "%. How confident (0-100) are you in this decision? Return only the number."
                ),
                "You are a deterministic risk scorer. Output only an integer between 0 and 100.",
                0,
                100,
                false
            )
        );
        uint256 fee = llmFee;
        uint256 nextId = platform.createRequest{value: fee}(
            llmAgentId,
            address(this),
            IAgentRequesterHandler.handleResponse.selector,
            payload
        );
        pendingRequests[nextId] = Stage.Scoring;

        // Keep the decision on hand until the confidence callback lands.
        _pendingDecision = decisionBytes;
        state = State.Scoring;
    }

    function _onScored(uint256 requestId, bytes memory result) internal {
        delete pendingRequests[requestId];

        int256 score = abi.decode(result, (int256));
        uint8 confidence = uint8(score < 0 ? 0 : (score > 100 ? 100 : uint256(score)));

        string memory decision = string(_pendingDecision);
        _pendingDecision = new bytes(0);

        bytes32 inputsHash = keccak256(
            abi.encode(_lastPrice, _lastChangeBps, _lastVolBps, block.number, ASSET_BTC)
        );
        state = State.Idle;
        emit AuditEvent(inputsHash, decision, confidence, ASSET_BTC);

        // Phase 3: if the model says HEDGE, size and execute a Down order.
        if (keccak256(bytes(decision)) == keccak256("HEDGE")) {
            _executeHedge(confidence);
        }
    }

    /// @notice Size and place the Down-contract hedge via the vault.
    function _executeHedge(uint8 confidence) internal {
        if (address(vault) == address(0) || exposureNotional == 0 || maxPremiumPerWindow == 0) {
            return;
        }
        // One unsettled position at a time: the next tick settles it first.
        if (positionOpen) return;
        // Stop-loss rail: after 3 consecutive losing windows, stop hedging
        // until a win resets the streak (or the owner resets it manually).
        if (lossStreak >= STOP_LOSS_STREAK) {
            emit StopLossEngaged(lossStreak);
            return;
        }
        uint256 downPrice = (downPriceBps * 1e18) / 10_000; // bps -> 1e18
        uint256 size = vault.sizeHedge(
            exposureNotional,
            downPrice,
            maxPremiumPerWindow,
            expectedMoveBps
        );
        if (size == 0) return;
        uint256 sizeWhole = size / 1e6; // 6-dec units -> whole outcome tokens
        if (sizeWhole == 0) return;
        uint256 yesPrice = 1e6 - downPriceBps * 100; // P(Up) raw 6-dec (1 - P(Down))
        try vault.placeHedge(sizeWhole, yesPrice) returns (uint128) {
            _recordPosition();
            emit HedgeExecuted(sizeWhole, yesPrice, confidence);
        } catch {
            // Order rejected (window rolled, book drained, paused...) — the
            // cycle still completes and the next tick retries. Never wedge the
            // state machine on an order failure.
            emit HedgeFailed(sizeWhole, yesPrice);
        }
    }

    /// @dev Record the just-placed order so the next tick can auto-redeem it.
    function _recordPosition() internal {
        lastOrderPool = address(vault.pool());
        lastOrderNonce = vault.marketNonce();
        lastOrderQtyRaw = vault.lastOrderQtyRaw();
        positionOpen = true;
        emit PositionOpened(lastOrderNonce, lastOrderQtyRaw, lastOrderPool);
    }

    /// @notice Settle an open position once its window has resolved (NO side).
    /// @dev Runs at the top of each tick, before any new cycle/order. On a NO
    ///      win it redeems through the vault (explicit pool + order-time nonce)
    ///      and resets the loss streak; on a YES win the hedge expired
    ///      (premium = insurance cost) and the streak advances.
    function _tryRedeemPosition() internal {
        if (lastOrderPool == address(0)) return;
        address market = IBinaryPool(lastOrderPool).market();
        if (market == address(0)) return;
        if (!IBinaryMarket(market).isResolved()) return;
        uint256[] memory nums = IBinaryMarket(market).payoutNumerators();
        if (nums.length >= 2 && nums[1] > 0) {
            try vault.redeemSettled(
                IBinaryPool(lastOrderPool), 1, lastOrderQtyRaw, lastOrderNonce
            ) returns (uint256 out) {
                positionOpen = false;
                lossStreak = 0;
                emit HedgeRedeemed(1, lastOrderQtyRaw, out);
            } catch {
                // Settlement not final yet — keep the position and retry on the
                // next tick (never wedge the cycle on a redeem revert).
                emit HedgeRedeemFailed(lastOrderNonce);
            }
        } else {
            positionOpen = false;
            lossStreak++;
            emit HedgeExpired(lastOrderNonce);
            if (lossStreak >= STOP_LOSS_STREAK) emit StopLossEngaged(lossStreak);
        }
    }

    /// @notice Manual override: the owner can trigger the sized hedge now
    ///         (the demo's "manual pulse" fallback and an operator safety rail).
    function manualHedge() external onlyOwner {
        _executeHedge(0);
    }

    /// @notice Redeem a settled position through the vault (owner/ops path;
    ///         Phase 4 auto-redeems on tick, this is the manual fallback).
    /// @dev Uses the vault's CURRENT pool + market nonce — correct when no
    ///      re-point/order happened since the position was opened.
    function manualRedeem(uint8 outcomeIdx, uint256 amount)
        external
        onlyOwner
        returns (uint256 out)
    {
        if (address(vault) == address(0)) revert NotConfigured();
        out = vault.redeemSettled(
            IBinaryPool(vault.pool()), outcomeIdx, amount, vault.marketNonce()
        );
        emit HedgeRedeemed(outcomeIdx, amount, out);
    }

    /// @notice Re-point the vault at a live market (owner/ops path — lets the
    ///         operator follow rolling windows without redeploying the vault).
    /// @dev Grants the new pool a fresh escrow approval — the vault's
    ///      allowance is per-pool, and placeBinaryOrder pulls collateral from
    ///      the vault via transferFrom.
    function manualSetVenue(
        IBinaryPool pool_,
        IBinarySettlement settlement_,
        IERC20 collateral_,
        bytes32 marketId_
    ) external onlyOwner {
        if (address(vault) == address(0)) revert NotConfigured();
        vault.setVenue(pool_, settlement_, collateral_, marketId_);
        vault.approvePool(type(uint256).max);
    }

    /// @notice One-tx hedge: re-point the vault at a live window, approve its
    ///         pool, size from the config knobs and place the BUY_NO order.
    /// @param pool_         The live window's BinaryPool.
    /// @param marketId_     Module marketId (record-keeping).
    /// @param downPriceBps_ P(Down) implied by the live book (drives sizing +
    ///                      the premium cap via downPriceBps).
    /// @param yesPrice      YES-side price that crosses the book (raw 6-dec).
    function manualHedgeNow(
        IBinaryPool pool_,
        bytes32 marketId_,
        uint256 downPriceBps_,
        uint256 yesPrice
    ) external onlyOwner {
        if (address(vault) == address(0)) revert NotConfigured();
        if (downPriceBps_ >= 10_000) revert NotConfigured();
        downPriceBps = downPriceBps_;
        vault.setVenue(pool_, vault.settlement(), vault.collateral(), marketId_);
        vault.approvePool(type(uint256).max);
        uint256 downPrice = (downPriceBps * 1e18) / 10_000;
        uint256 size = vault.sizeHedge(
            exposureNotional, downPrice, maxPremiumPerWindow, expectedMoveBps
        );
        if (size == 0) return;
        uint256 sizeWhole = size / 1e6;
        if (sizeWhole == 0) return;
        vault.placeHedge(sizeWhole, yesPrice);
        _recordPosition();
        emit HedgeExecuted(sizeWhole, yesPrice, 0);
    }

    /// @notice Reset the stop-loss streak (owner override after a regime change).
    function resetLossStreak() external onlyOwner {
        lossStreak = 0;
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    bytes internal _pendingDecision;

    function _allowedActions() internal pure returns (string[] memory actions) {
        actions = new string[](3);
        actions[0] = "HEDGE";
        actions[1] = "STAND_DOWN";
        actions[2] = "HOLD";
    }

    function _firstSuccessResult(AgentTypes.Response[] memory responses)
        internal
        pure
        returns (bytes memory)
    {
        for (uint256 i = 0; i < responses.length; i++) {
            if (responses[i].status == AgentTypes.ResponseStatus.Success) {
                return responses[i].result;
            }
        }
        // Fallback (defensive): overall status is Success, take the first.
        return responses.length == 0 ? new bytes(0) : responses[0].result;
    }

    function _buildDecisionPrompt(uint256 price, int256 changeBps, int256 volBps)
        internal
        view
        returns (string memory)
    {
        return string.concat(
            "You are SENTRIC, a portfolio insurance risk controller for a long BTC position. ",
            "Current BTC/USD price: $",
            _toDecimal(price, jsonDecimals, 2),
            ". Recent change: ",
            _formatSignedBps(changeBps),
            "%. Recent range: ",
            _formatSignedBps(volBps),
            "%. Decide whether to buy a Down Event Contract to hedge the position for the next 5 minutes. ",
            "HEDGE if downside risk is elevated (sharp drop or high volatility). ",
            "STAND_DOWN if the market is calm or rising. ",
            "HOLD if uncertain. Respond with exactly one allowed value."
        );
    }

    function _formatSignedBps(int256 bps) internal pure returns (string memory) {
        if (bps == 0) return "+0.00";
        bool neg = bps < 0;
        uint256 abs = neg ? uint256(-bps) : uint256(bps);
        uint256 whole = abs / 100;
        uint256 frac = abs % 100;
        string memory fracStr = _uintToString(frac);
        if (bytes(fracStr).length == 1) fracStr = string.concat("0", fracStr);
        return string.concat(neg ? "-" : "+", _uintToString(whole), ".", fracStr);
    }

    /// @dev `value` scaled by 10^decimals -> "W.DD" with `display` fraction digits.
    function _toDecimal(uint256 value, uint8 decimals, uint8 display)
        internal
        pure
        returns (string memory)
    {
        if (decimals == 0) return _uintToString(value);
        uint256 scale = 10 ** uint256(decimals);
        uint256 whole = value / scale;
        uint256 fracPart = ((value % scale) * (10 ** uint256(display))) / scale;
        string memory fracStr = _uintToString(fracPart);
        uint256 fracLen = bytes(fracStr).length;
        bytes memory padded = new bytes(display);
        for (uint256 i = 0; i < display; i++) {
            if (i < display - fracLen) {
                padded[i] = bytes1("0");
            } else {
                padded[i] = bytes(fracStr)[i - (display - fracLen)];
            }
        }
        return string.concat(_uintToString(whole), ".", string(padded));
    }

    function _uintToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v;
        uint256 digits;
        while (n != 0) {
            digits++;
            n /= 10;
        }
        bytes memory b = new bytes(digits);
        while (v != 0) {
            digits--;
            b[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }

    /// @notice Accept pushed agent rebates (request finalisation) + gas top-ups.
    receive() external payable {}
}
