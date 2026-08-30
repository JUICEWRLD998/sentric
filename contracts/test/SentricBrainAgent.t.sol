// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SentricBrain} from "../src/SentricBrain.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/interfaces/SomniaExtensions.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaReactivityPrecompile.sol";
import {ISomniaEventHandler} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaEventHandler.sol";
import {AgentTypes, IAgentRequester, IAgentRequesterHandler, IAgentMethods} from "../src/lib/IAgentRequester.sol";

/// @dev Minimal stand-in for the Somnia reactivity precompile (0x0100): records
///      subscriptions and can replay an EpochTick at the handler.
contract MockPrecompile {
    ISomniaReactivityPrecompile.SubscriptionData private _lastData;
    uint256 public lastSubscriptionId;
    uint256 public lastUnsubscribedId;

    function subscribe(ISomniaReactivityPrecompile.SubscriptionData calldata data)
        external
        returns (uint256 subscriptionId)
    {
        _lastData = data;
        lastSubscriptionId = 1;
        return 1;
    }

    function unsubscribe(uint256 id) external {
        lastUnsubscribedId = id;
    }

    /// @dev Simulate the chain dispatching an EpochTick to the handler.
    function fireEpochTick(uint64 epochNumber, uint64 blockNumber, address handler) external {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = ISomniaReactivityPrecompile.EpochTick.selector;
        topics[1] = bytes32(uint256(epochNumber));
        topics[2] = bytes32(uint256(blockNumber));
        ISomniaEventHandler(handler).onEvent(
            SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS,
            topics,
            ""
        );
    }
}

/// @dev Minimal stand-in for the Somnia Agents platform: records createRequest
///      calls and can finalize them as the platform (so the brain sees
///      msg.sender == platform).
contract MockAgentPlatform {
    struct Record {
        uint256 agentId;
        bytes payload;
        address callback;
        bytes4 selector;
    }

    uint256 public deposit = 0.12 ether;
    uint256 public nextRequestId = 1;
    mapping(uint256 => Record) internal _records;

    function getRequestDeposit() external view returns (uint256) {
        return deposit;
    }

    function getAdvancedRequestDeposit(uint256) external view returns (uint256) {
        return deposit;
    }

    /// @dev Explicit struct getter (a `public` mapping would flatten fields).
    function getRecord(uint256 id) external view returns (Record memory) {
        return _records[id];
    }

    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId) {
        requestId = nextRequestId++;
        _records[requestId] = Record(agentId, payload, callbackAddress, callbackSelector);
    }

    function createAdvancedRequest(
        uint256,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256,
        uint256,
        AgentTypes.ConsensusType,
        uint256
    ) external payable returns (uint256 requestId) {
        requestId = nextRequestId++;
        _records[requestId] = Record(0, payload, callbackAddress, callbackSelector);
    }

    function getRequest(uint256) external pure returns (AgentTypes.Request memory r) {
        r.requester = address(0);
    }

    function hasRequest(uint256) external pure returns (bool) {
        return true;
    }

    /// @dev Fire the platform's async callback for `requestId` as the platform.
    function finalize(
        uint256 requestId,
        AgentTypes.ResponseStatus status,
        bytes memory result
    ) external {
        Record memory r = _records[requestId];
        AgentTypes.Response[] memory responses = new AgentTypes.Response[](1);
        responses[0] = AgentTypes.Response({
            validator: address(this),
            result: result,
            status: AgentTypes.ResponseStatus.Success,
            receipt: 0,
            timestamp: block.timestamp,
            executionCost: 0
        });

        AgentTypes.Request memory details = AgentTypes.Request({
            id: requestId,
            requester: r.callback,
            callbackAddress: r.callback,
            callbackSelector: r.selector,
            subcommittee: new address[](0),
            responses: responses,
            responseCount: 1,
            failureCount: 0,
            threshold: 1,
            createdAt: block.timestamp,
            deadline: block.timestamp + 1000,
            status: status,
            consensusType: AgentTypes.ConsensusType.Majority,
            remainingBudget: 0,
            perAgentBudget: 0
        });

        IAgentRequesterHandler(r.callback).handleResponse(requestId, responses, status, details);
    }
}

contract SentricBrainAgentTest is Test {
    /// @dev The sweep test transfers the reserve to the owner (this contract).
    receive() external payable {}

    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000100;
    uint256 internal constant JSON_AGENT_ID = 1;
    uint256 internal constant LLM_AGENT_ID = 2;
    string internal constant JSON_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
    string internal constant PRICE_SELECTOR = "bitcoin.usd";

    SentricBrain internal brain;
    MockAgentPlatform internal platform;
    MockPrecompile internal precompile;
    address internal owner;

    function setUp() public {
        owner = address(this);
        platform = new MockAgentPlatform();
        brain = new SentricBrain(IAgentRequester(address(platform)));
        vm.deal(address(brain), 33 ether);
        brain.setAgentIds(JSON_AGENT_ID, LLM_AGENT_ID);
        brain.setJsonParams(JSON_URL, PRICE_SELECTOR, 8);

        // Reactivity mock for arm/disarm/sweep tests.
        vm.etch(PRECOMPILE, type(MockPrecompile).runtimeCode);
        precompile = MockPrecompile(PRECOMPILE);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _fireTick() internal {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = ISomniaReactivityPrecompile.EpochTick.selector;
        topics[1] = bytes32(uint256(1));
        topics[2] = bytes32(uint256(block.number));
        vm.prank(PRECOMPILE);
        brain.onEvent(PRECOMPILE, topics, "");
    }

    function _finalizeFetch(uint256 requestId, uint256 price) internal {
        platform.finalize(requestId, AgentTypes.ResponseStatus.Success, abi.encode(price));
    }

    // ------------------------------------------------------------------
    // Full decision cycle
    // ------------------------------------------------------------------

    function test_full_cycle_emits_audit_event() public {
        address btc = address(1); // == SentricBrain.ASSET_BTC

        // Tick -> stage 1: JSON fetch
        _fireTick();
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Fetching), "state");
        assertEq(uint256(brain.pendingRequests(1)), uint256(SentricBrain.Stage.Fetching));
        MockAgentPlatform.Record memory r1 = platform.getRecord(1);
        assertEq(r1.agentId, JSON_AGENT_ID, "json agentId");
        assertEq(bytes4(r1.payload), IAgentMethods.fetchUint.selector, "fetchUint payload");
        (string memory url, string memory sel, uint8 dec) = abi.decode(
            _stripSelector(r1.payload),
            (string, string, uint8)
        );
        assertEq(url, JSON_URL, "url");
        assertEq(sel, PRICE_SELECTOR, "selector");
        assertEq(dec, 8, "decimals");

        // Stage 1 callback -> stage 2: LLM action
        _finalizeFetch(1, 105000000000);
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Deciding), "state->Deciding");
        MockAgentPlatform.Record memory r2 = platform.getRecord(2);
        assertEq(r2.agentId, LLM_AGENT_ID, "llm agentId");
        assertEq(bytes4(r2.payload), IAgentMethods.inferString.selector, "inferString payload");
        (string memory prompt, , bool cot, string[] memory allowed) = abi.decode(
            _stripSelector(r2.payload),
            (string, string, bool, string[])
        );
        assertTrue(bytes(prompt).length > 50, "prompt populated");
        assertFalse(cot, "no chain of thought (deterministic)");
        assertEq(allowed.length, 3, "3 allowed actions");
        assertEq(allowed[0], "HEDGE");

        // Stage 2 callback -> stage 3: LLM confidence
        platform.finalize(2, AgentTypes.ResponseStatus.Success, abi.encode("HEDGE"));
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Scoring), "state->Scoring");
        MockAgentPlatform.Record memory r3 = platform.getRecord(3);
        assertEq(bytes4(r3.payload), IAgentMethods.inferNumber.selector, "inferNumber payload");

        // Stage 3 callback -> AuditEvent, back to Idle
        vm.expectEmit(true, true, true, true);
        emit SentricBrain.AuditEvent(
            keccak256(abi.encode(105000000000, 0, 0, block.number, btc)),
            "HEDGE",
            81,
            btc
        );
        platform.finalize(3, AgentTypes.ResponseStatus.Success, abi.encode(int256(81)));
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Idle), "state->Idle");
    }

    function test_second_cycle_computes_onchain_change() public {
        // Cycle 1: price 100000 -> change 0
        _fireTick();
        _finalizeFetch(1, 100000000000);
        platform.finalize(2, AgentTypes.ResponseStatus.Success, abi.encode("STAND_DOWN"));
        platform.finalize(3, AgentTypes.ResponseStatus.Success, abi.encode(int256(50)));

        // Cycle 2: price 99000 -> change -1.00% (bps -100)
        _fireTick();
        _finalizeFetch(4, 99000000000);
        MockAgentPlatform.Record memory r2 = platform.getRecord(5);
        (string memory prompt2, , , ) = abi.decode(
            _stripSelector(r2.payload),
            (string, string, bool, string[])
        );
        assertTrue(
            _contains(prompt2, "-1.00"),
            string.concat("prompt should contain -1.00%, got: ", prompt2)
        );
        platform.finalize(5, AgentTypes.ResponseStatus.Success, abi.encode("HEDGE"));
        platform.finalize(6, AgentTypes.ResponseStatus.Success, abi.encode(int256(90)));
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Idle), "idle after cycle 2");
    }

    // ------------------------------------------------------------------
    // Gating & failure paths
    // ------------------------------------------------------------------

    function test_handleResponse_reverts_when_not_platform() public {
        _fireTick();
        AgentTypes.Response[] memory empty;
        AgentTypes.Request memory details;
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(SentricBrain.NotPlatform.selector);
        brain.handleResponse(1, empty, AgentTypes.ResponseStatus.Success, details);
    }

    function test_handleResponse_unknown_request_reverts() public {
        // Direct call with a details.requester that matches this brain.
        AgentTypes.Response[] memory empty;
        AgentTypes.Request memory details = _dummyDetails(address(brain));
        vm.prank(address(platform));
        vm.expectRevert(SentricBrain.UnknownRequest.selector);
        brain.handleResponse(999, empty, AgentTypes.ResponseStatus.Success, details);
    }

    function _dummyDetails(address requester)
        internal
        pure
        returns (AgentTypes.Request memory details)
    {
        details = AgentTypes.Request({
            id: 999,
            requester: requester,
            callbackAddress: requester,
            callbackSelector: IAgentRequesterHandler.handleResponse.selector,
            subcommittee: new address[](0),
            responses: new AgentTypes.Response[](0),
            responseCount: 0,
            failureCount: 0,
            threshold: 1,
            createdAt: 0,
            deadline: 0,
            status: AgentTypes.ResponseStatus.Success,
            consensusType: AgentTypes.ConsensusType.Majority,
            remainingBudget: 0,
            perAgentBudget: 0
        });
    }

    function test_failed_fetch_resets_to_idle() public {
        _fireTick();
        vm.expectEmit(true, true, false, false);
        emit SentricBrain.CycleFailed(1, AgentTypes.ResponseStatus.Failed);
        platform.finalize(1, AgentTypes.ResponseStatus.Failed, "");
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Idle), "idle after failure");
        assertEq(uint256(brain.pendingRequests(1)), uint256(SentricBrain.Stage.None));
    }

    function test_timed_out_resets_to_idle() public {
        _fireTick();
        platform.finalize(1, AgentTypes.ResponseStatus.TimedOut, "");
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Idle), "idle after timeout");
    }

    function test_tick_skips_new_cycle_while_in_flight() public {
        _fireTick(); // starts cycle, request 1
        assertEq(platform.nextRequestId(), 2, "one request so far");
        _fireTick(); // in-flight -> TickObserved only, no new request
        assertEq(platform.nextRequestId(), 2, "no second request while Fetching");
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Fetching), "still Fetching");
    }

    function test_no_cycle_when_not_configured() public {
        SentricBrain fresh = new SentricBrain(IAgentRequester(address(platform)));
        _fireTickOn(fresh);
        assertEq(platform.nextRequestId(), 1, "no requests when unconfigured");
        assertEq(uint256(fresh.state()), uint256(SentricBrain.State.Idle));
    }

    function _fireTickOn(SentricBrain b) internal {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = ISomniaReactivityPrecompile.EpochTick.selector;
        topics[1] = bytes32(uint256(1));
        topics[2] = bytes32(uint256(block.number));
        vm.prank(PRECOMPILE);
        b.onEvent(PRECOMPILE, topics, "");
    }

    function test_array_fetch_mode_computes_vol_and_change() public {
        // Bitfinex 1D candle mode: [mts, open, close, high, low, volume]
        brain.setFetchMode(true);
        brain.setJsonParams(
            "https://api-pub.bitfinex.com/v2/candles/trade:1D:tBTCUSD/last",
            "",
            8
        );

        _fireTick();
        MockAgentPlatform.Record memory r1 = platform.getRecord(1);
        assertEq(bytes4(r1.payload), IAgentMethods.fetchUintArray.selector, "fetchUintArray");
        (string memory url, string memory sel, uint8 dec) = abi.decode(
            _stripSelector(r1.payload),
            (string, string, uint8)
        );
        assertEq(sel, "", "empty selector = whole body");
        assertEq(dec, 8, "decimals");

        uint256[] memory candle = new uint256[](6);
        candle[0] = 123; // mts
        candle[1] = 100000000000; // open = 100000.00
        candle[2] = 101000000000; // close = 101000.00 (price)
        candle[3] = 102000000000; // high
        candle[4] = 99000000000; // low
        candle[5] = 1000; // volume
        platform.finalize(1, AgentTypes.ResponseStatus.Success, abi.encode(candle));

        MockAgentPlatform.Record memory r2 = platform.getRecord(2);
        (string memory prompt, , , ) = abi.decode(
            _stripSelector(r2.payload),
            (string, string, bool, string[])
        );
        // change = (101000-100000)/100000 = +1.00%; vol = (102000-99000)/101000 ≈ +2.97%
        assertTrue(_contains(prompt, "+1.00"), string.concat("want +1.00 in: ", prompt));
        assertTrue(_contains(prompt, "+2.97"), string.concat("want +2.97 in: ", prompt));

        platform.finalize(2, AgentTypes.ResponseStatus.Success, abi.encode("STAND_DOWN"));
        platform.finalize(3, AgentTypes.ResponseStatus.Success, abi.encode(int256(55)));
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Idle), "idle after array cycle");
    }

    function test_setFetchMode_only_owner() public {
        vm.prank(makeAddr("not-owner"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.setFetchMode(true);
    }

    function test_setAgentFees_only_owner_and_defaults() public {
        assertEq(brain.jsonFee(), 0.12 ether, "default json fee");
        assertEq(brain.llmFee(), 0.24 ether, "default llm fee");
        brain.setAgentFees(0.1 ether, 0.2 ether);
        assertEq(brain.jsonFee(), 0.1 ether, "json fee updated");
        vm.prank(makeAddr("not-owner"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.setAgentFees(1, 1);
    }

    // ------------------------------------------------------------------
    // Config & sweep
    // ------------------------------------------------------------------

    function test_setAgentIds_only_owner() public {
        vm.prank(makeAddr("not-owner"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.setAgentIds(9, 9);
    }

    function test_setJsonParams_only_owner() public {
        vm.prank(makeAddr("not-owner"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.setJsonParams("u", "s", 8);
    }

    function test_sweep_recovers_balance_when_disarmed() public {
        // arm (funded 33) then disarm then sweep -> owner gets the balance
        brain.arm();
        brain.disarm();
        uint256 bal = address(brain).balance;
        uint256 before = owner.balance;
        vm.expectEmit(true, true, false, false);
        emit SentricBrain.Swept(owner, bal);
        brain.sweep();
        assertEq(address(brain).balance, 0, "brain drained");
        assertEq(owner.balance, before + bal, "owner received");
    }

    function test_sweep_reverts_while_armed() public {
        brain.arm();
        vm.expectRevert(SentricBrain.StillArmed.selector);
        brain.sweep();
    }

    // ------------------------------------------------------------------
    // Utils
    // ------------------------------------------------------------------

    function _stripSelector(bytes memory payload) internal pure returns (bytes memory out) {
        require(payload.length >= 4, "payload too short");
        out = new bytes(payload.length - 4);
        for (uint256 i = 4; i < payload.length; i++) {
            out[i - 4] = payload[i];
        }
    }

    function _contains(string memory haystack, string memory needle)
        internal
        pure
        returns (bool)
    {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }
}
