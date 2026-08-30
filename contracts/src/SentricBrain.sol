// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/interfaces/SomniaExtensions.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaReactivityPrecompile.sol";
import {AgentTypes, IAgentRequester, IAgentRequesterHandler, IAgentMethods} from "./lib/IAgentRequester.sol";

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
        bytes memory payload = abi.encodeCall(
            IAgentMethods.inferNumber,
            (
                string.concat(
                    "Given: BTC price $",
                    _toDecimal(_lastPrice, jsonDecimals, 2),
                    ", 24h change ",
                    _formatSignedBps(_lastChangeBps),
                    "%, intraday range ",
                    _formatSignedBps(_lastVolBps),
                    "%. How confident (0-100) are you in the previous action decision? Return only the number."
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
        // TODO(Phase 3): if decision == "HEDGE" -> vault.placeHedge(...) with
        // size = f(exposure, P(Down)) capped by max premium per window.
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
            ". 24h change: ",
            _formatSignedBps(changeBps),
            "%. Intraday range: ",
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
