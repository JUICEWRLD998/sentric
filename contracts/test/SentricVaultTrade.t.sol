// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SentricVault} from "../src/SentricVault.sol";
import {SentricBrain} from "../src/SentricBrain.sol";
import {IAgentRequester, AgentTypes} from "../src/lib/IAgentRequester.sol";
import {IBinaryPool, IBinarySettlement, IERC20} from "../src/lib/IBinaryVenue.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/interfaces/SomniaExtensions.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaReactivityPrecompile.sol";
import {ISomniaEventHandler} from "@somnia-chain/reactivity-contracts/interfaces/ISomniaEventHandler.sol";

/// @dev Minimal tUSDC stand-in.
contract MockERC20 {
    string public name = "TestUSDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Records placeBinaryOrder calls; exposes the same reads as the real pool.
contract MockBinaryPool {
    struct OrderCall {
        uint8 kind;
        uint256 price;
        uint256 quantity;
        uint64 expireTimestampNs;
        uint8 orderType;
        uint8 selfMatchingOption;
        address builder;
        uint96 builderFeeBpsTimes1k;
        uint64 userData;
    }
    OrderCall internal _lastCall;
    uint128 public lastOrderId;
    uint64 public expiryNs = 1_800_000_000_000_000; // ~30 min in ns
    uint64 public nonce = 1;
    // Real pool params (verified live, docs/venue-live-recipe.md §1): prices and
    // quantities are raw 6-dec collateral units on a 1000-tick grid; 1e6 raw =
    // 1 whole outcome token; min 1000 raw, lot 1000 raw.
    uint256 public tickSize = 1000;
    uint256 public minQuantity = 1000;
    uint256 public lotSize = 1000;

    /// @dev Explicit struct getter (a `public` field would flatten).
    function getLastCall() external view returns (OrderCall memory) {
        return _lastCall;
    }

    function placeBinaryOrder(
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k,
        uint64 userData
    ) external payable returns (bool, uint128) {
        _lastCall = OrderCall(
            kind, price, quantity, expireTimestampNs, orderType,
            selfMatchingOption, builder, builderFeeBpsTimes1k, userData
        );
        lastOrderId++;
        return (true, lastOrderId);
    }

    function cancelOrder(uint128) external pure {}

    function getOrderBookParameters()
        external
        view
        returns (uint256, uint256, uint256)
    {
        return (tickSize, minQuantity, lotSize);
    }

    function marketExpiryNs() external view returns (uint64) {
        return expiryNs;
    }

    function marketNonce() external view returns (uint64) {
        return nonce;
    }

    function market() external pure returns (address) {
        return address(0);
    }
}

/// @dev Records finalizeAndRedeem calls.
contract MockSettlement {
    address public lastPool;
    uint256 public lastOutcomeId;
    uint256 public lastAmount;
    address public lastTo;
    uint256 public collateralOut = 1;

    function finalizeAndRedeem(address pool, uint256 outcomeId, uint256 amount, address to)
        external
        returns (uint256)
    {
        lastPool = pool;
        lastOutcomeId = outcomeId;
        lastAmount = amount;
        lastTo = to;
        return collateralOut;
    }

    function redeem(uint256, uint256, address) external pure returns (uint256) {
        return 0;
    }

    function finalize(address) external pure returns (uint256) {
        return 0;
    }
}

/// @dev Stand-in for the reactivity precompile (arm/disarm).
contract MockPrecompile2 {
    ISomniaReactivityPrecompile.SubscriptionData private _d;
    uint256 public lastUnsubscribedId;

    function subscribe(ISomniaReactivityPrecompile.SubscriptionData calldata data)
        external
        returns (uint256)
    {
        _d = data;
        return 1;
    }

    function unsubscribe(uint256 id) external {
        lastUnsubscribedId = id;
    }
}

/// @dev Records createRequest; can finalize as the platform.
contract MockAgentPlatform2 {
    struct Record {
        uint256 agentId;
        bytes payload;
        address callback;
        bytes4 selector;
    }
    uint256 public nextRequestId = 1;
    mapping(uint256 => Record) internal _records;

    function getRequestDeposit() external pure returns (uint256) {
        return 0.12 ether;
    }
    function getAdvancedRequestDeposit(uint256) external pure returns (uint256) {
        return 0.12 ether;
    }
    function getRecord(uint256 id) external view returns (Record memory) {
        return _records[id];
    }
    function createRequest(uint256 agentId, address cb, bytes4 sel, bytes calldata payload)
        external
        payable
        returns (uint256)
    {
        uint256 id = nextRequestId++;
        _records[id] = Record(agentId, payload, cb, sel);
        return id;
    }
    function createAdvancedRequest(
        uint256, address cb, bytes4 sel, bytes calldata payload, uint256,
        uint256, AgentTypes.ConsensusType, uint256
    ) external payable returns (uint256) {
        uint256 id = nextRequestId++;
        _records[id] = Record(0, payload, cb, sel);
        return id;
    }
    function getRequest(uint256) external pure returns (AgentTypes.Request memory r) {
        r.requester = address(0);
    }
    function hasRequest(uint256) external pure returns (bool) {
        return true;
    }
    function finalize(uint256 requestId, AgentTypes.ResponseStatus status, bytes memory result)
        external
    {
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
        IAgentRequesterHandler_2(r.callback).handleResponse(requestId, responses, status, details);
    }
}

interface IAgentRequesterHandler_2 {
    function handleResponse(
        uint256 requestId,
        AgentTypes.Response[] memory responses,
        AgentTypes.ResponseStatus status,
        AgentTypes.Request memory details
    ) external;
}

contract SentricVaultTradeTest is Test {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000100;

    SentricVault internal vault;
    SentricBrain internal brain;
    MockBinaryPool internal pool;
    MockSettlement internal settlement;
    MockERC20 internal usdc;
    MockAgentPlatform2 internal platform;
    uint256 internal constant ONE_MILLION_USDC = 1_000_000e6;

    function setUp() public {
        pool = new MockBinaryPool();
        settlement = new MockSettlement();
        usdc = new MockERC20();
        platform = new MockAgentPlatform2();

        vault = new SentricVault();
        vault.setVenue(
            IBinaryPool(address(pool)),
            IBinarySettlement(address(settlement)),
            IERC20(address(usdc)),
            bytes32("BTC-0-15M")
        );
        vault.setMaxPremiumPerWindow(1_000e6); // 1,000 USDC/window
        vault.approvePool(type(uint256).max);
        usdc.mint(address(vault), ONE_MILLION_USDC); // vault funded

        // Brain owned by this test; vault owned by the brain.
        brain = new SentricBrain(IAgentRequester(address(platform)));
        vm.deal(address(brain), 33 ether);
        brain.setAgentIds(1, 2);
        brain.setJsonParams("https://api-pub.bitfinex.com/v2/candles/trade:1D:tBTCUSD/last", "", 8);
        brain.setFetchMode(true);
        vault.transferOwnership(address(brain));

        vm.etch(PRECOMPILE, type(MockPrecompile2).runtimeCode);
    }

    // ------------------------------------------------------------------
    // Vault order placement
    // ------------------------------------------------------------------

    function test_placeHedge_buy_no_market_order() public {
        vm.prank(address(brain));
        uint128 id = vault.placeHedge(1000, 550000); // 1000 NO tokens, P(Up)=55%
        assertEq(id, 1, "order id");
        MockBinaryPool.OrderCall memory c = pool.getLastCall();
        assertEq(c.kind, 2, "BUY_NO");
        assertEq(c.price, 550000, "yes price (tick-aligned)");
        assertEq(c.orderType, 2, "MARKET/IOC");
        assertEq(c.selfMatchingOption, 0, "CANCEL_TAKER");
        assertEq(c.builder, address(0), "no builder");
        assertEq(c.builderFeeBpsTimes1k, 0, "no builder fee");
        assertEq(c.userData, 0, "userData opaque");
        assertEq(c.expireTimestampNs, pool.expiryNs(), "market expiry");
        // size 1000 whole tokens -> 1000 * 1e6 = 1e9 raw (the pool's qty unit)
        assertEq(c.quantity, 1_000_000_000, "qty raw (1000 whole tokens)");
        // premium = 1e9 raw * (1e6-550000) / 1e6 = 450_000_000 raw = 450 USDC
        assertEq(vault.windowPremiumSpent(), 450_000_000, "premium recorded");
        assertEq(vault.marketNonce(), 1, "nonce captured");
        assertEq(vault.lastOrderId(), 1, "last order id");
    }

    function test_placeHedge_snaps_price_to_tick() public {
        vm.prank(address(brain));
        vault.placeHedge(1234, 550123);
        MockBinaryPool.OrderCall memory c = pool.getLastCall();
        // price snaps UP to tick (1000): 550123 -> 551000
        assertEq(c.price, 551000, "price snapped up to tick");
        // whole-token inputs are always lot-aligned in raw units (lot 1000
        // divides 1e6), so the raw qty is preserved exactly
        assertEq(c.quantity, 1_234_000_000, "qty raw preserved (1234 whole)");
    }

    function test_placeHedge_floors_tiny_qty_to_minimum() public {
        vm.prank(address(brain));
        vault.placeHedge(0, 550000);
        MockBinaryPool.OrderCall memory c = pool.getLastCall();
        // qty 0 -> floored to minQuantity (1000 raw)
        assertEq(c.quantity, 1000, "qty floored to min");
        // premium = 1000 * 450000 / 1e6 = 450 raw
        assertEq(vault.windowPremiumSpent(), 450, "tiny premium recorded");
    }

    function test_placeHedge_premium_cap_reverts() public {
        vm.prank(address(brain));
        vault.setMaxPremiumPerWindow(100); // 100 micro-USDC cap
        vm.prank(address(brain));
        vm.expectRevert(SentricVault.MaxPremiumExceeded.selector);
        vault.placeHedge(1000, 550000); // premium 450 > 100
    }

    function test_placeHedge_insufficient_collateral_reverts() public {
        // Raise the cap so the balance check is what trips.
        vm.prank(address(brain));
        vault.setMaxPremiumPerWindow(1e30);
        vm.prank(address(brain));
        // premium = 3e12 * 0.45 = 1.35e12 micro-USDC > vault balance (1e12)
        vm.expectRevert(SentricVault.InsufficientCollateral.selector);
        vault.placeHedge(3_000_000_000_000, 550000);
    }

    function test_placeHedge_window_resets_guard() public {
        vm.prank(address(brain));
        vault.placeHedge(1000, 550000);
        assertEq(vault.windowPremiumSpent(), 450_000_000, "spent in window 1");
        vm.roll(block.number + 3000); // next epoch
        vm.prank(address(brain));
        vault.placeHedge(1000, 550000);
        assertEq(vault.windowPremiumSpent(), 450_000_000, "guard reset per epoch");
        assertEq(pool.lastOrderId(), 2, "second order placed");
    }

    function test_placeHedge_only_owner() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(SentricVault.NotOwner.selector);
        vault.placeHedge(1000, 550000);
    }

    function test_placeHedge_not_configured() public {
        SentricVault fresh = new SentricVault();
        fresh.setMaxPremiumPerWindow(1e30);
        vm.prank(address(fresh.owner()));
        vm.expectRevert(SentricVault.NotConfigured.selector);
        fresh.placeHedge(1000, 550000);
    }

    // ------------------------------------------------------------------
    // Redemption
    // ------------------------------------------------------------------

    function test_redeemSettled_builds_outcome_id() public {
        vm.prank(address(brain));
        vault.placeHedge(1000, 550000);
        vm.prank(address(brain));
        uint256 out = vault.redeemSettled(1, 500); // NO side won
        assertEq(out, 1, "collateral out");
        assertEq(settlement.lastPool(), address(pool), "pool");
        assertEq(settlement.lastAmount(), 500, "amount");
        assertEq(settlement.lastTo(), address(vault), "to vault");
        // outcomeId = (pool << 72) | (nonce 1 << 8) | idx 1
        uint256 expected = (uint256(uint160(address(pool))) << 72) | (uint256(1) << 8) | 1;
        assertEq(settlement.lastOutcomeId(), expected, "outcome id");
    }

    function test_redeemSettled_only_owner() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(SentricVault.NotOwner.selector);
        vault.redeemSettled(1, 500);
    }

    // ------------------------------------------------------------------
    // Brain -> vault redemption path (manualRedeem)
    // ------------------------------------------------------------------

    function test_manual_redeem_via_brain() public {
        brain.setHedgeConfig(vault, ONE_MILLION_USDC, 100e6, 200, 4500);
        vm.prank(address(brain));
        vault.placeHedge(1000, 550000);
        uint256 out = brain.manualRedeem(1, 500);
        assertEq(out, 1, "collateral out");
        assertEq(settlement.lastPool(), address(pool), "pool");
        assertEq(settlement.lastAmount(), 500, "amount");
        assertEq(settlement.lastTo(), address(vault), "to vault");
        assertEq(settlement.lastOutcomeId() & 0xff, 1, "NO outcome idx");
    }

    function test_manual_redeem_only_owner() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.manualRedeem(1, 500);
    }

    function test_manual_set_venue_repools_vault() public {
        brain.setHedgeConfig(vault, ONE_MILLION_USDC, 100e6, 200, 4500);
        MockBinaryPool pool2 = new MockBinaryPool();
        brain.manualSetVenue(
            IBinaryPool(address(pool2)),
            IBinarySettlement(address(settlement)),
            IERC20(address(usdc)),
            bytes32("BTC-1M")
        );
        assertEq(address(vault.pool()), address(pool2), "pool re-pointed");
        assertEq(vault.marketId(), bytes32("BTC-1M"), "market id updated");
        // the re-point must grant the NEW pool escrow approval (per-pool allowance)
        assertEq(usdc.allowance(address(vault), address(pool2)), type(uint256).max, "new pool approved");
        assertEq(usdc.allowance(address(vault), address(pool)), type(uint256).max, "old pool allowance kept (setUp approval)");
    }

    function test_manual_set_venue_only_owner() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.manualSetVenue(IBinaryPool(address(pool)), IBinarySettlement(address(settlement)), IERC20(address(usdc)), bytes32("x"));
    }

    function test_manual_hedge_now_repools_approves_and_places() public {
        brain.setHedgeConfig(vault, ONE_MILLION_USDC, 100e6, 200, 4500);
        MockBinaryPool pool2 = new MockBinaryPool();
        // One tx: re-point + approve + size + place BUY_NO at the crossing price.
        brain.manualHedgeNow(IBinaryPool(address(pool2)), bytes32("BTC-5M"), 4500, 550000);
        assertEq(address(vault.pool()), address(pool2), "pool re-pointed");
        assertEq(usdc.allowance(address(vault), address(pool2)), type(uint256).max, "pool approved");
        MockBinaryPool.OrderCall memory c = pool2.getLastCall();
        assertEq(c.kind, 2, "BUY_NO");
        assertEq(c.price, 550000, "crossing yes price");
        assertEq(c.quantity, 222_000_000, "qty raw (222 whole tokens)");
        assertEq(brain.downPriceBps(), 4500, "down price updated");
    }

    function test_manual_hedge_now_guards_bad_down_price() public {
        brain.setHedgeConfig(vault, ONE_MILLION_USDC, 100e6, 200, 4500);
        vm.expectRevert(SentricBrain.NotConfigured.selector);
        brain.manualHedgeNow(IBinaryPool(address(pool)), bytes32("x"), 10_000, 1);
    }

    function test_manual_hedge_now_only_owner() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.manualHedgeNow(IBinaryPool(address(pool)), bytes32("x"), 4500, 550000);
    }

    // ------------------------------------------------------------------
    // Full cycle: tick -> fetch -> LLM HEDGE -> vault order
    // ------------------------------------------------------------------

    function test_full_cycle_with_hedge_execution() public {
        // Configure the brain's hedge knobs: 1M USDC exposure, 100 USDC/window cap,
        // 2% move, P(Down)=45%.
        brain.setHedgeConfig(vault, ONE_MILLION_USDC, 100e6, 200, 4500);

        _fireTick();
        platform.finalize(1, AgentTypes.ResponseStatus.Success, abi.encode(_candle(100000, 101000)));
        platform.finalize(2, AgentTypes.ResponseStatus.Success, abi.encode("HEDGE"));
        // size = sizeHedge(1e12, 0.45e18, 100e6, 200) -> 6-dec 222222222 -> /1e6 = 222 whole
        // (AuditEvent is emitted first, then HedgeExecuted — assert via the pool call.)
        platform.finalize(3, AgentTypes.ResponseStatus.Success, abi.encode(int256(90)));

        MockBinaryPool.OrderCall memory c = pool.getLastCall();
        assertEq(c.kind, 2, "BUY_NO executed");
        assertEq(c.quantity, 222_000_000, "qty raw (222 whole tokens)");
        assertEq(c.price, 550000, "P(Up) 55%");
        assertEq(vault.windowPremiumSpent(), 99_900_000, "premium = 222e6*0.45 = 99.9 USDC");
        assertEq(uint256(brain.state()), uint256(SentricBrain.State.Idle), "idle after cycle");
    }

    function test_full_cycle_hold_does_not_hedge() public {
        brain.setHedgeConfig(vault, ONE_MILLION_USDC, 100e6, 200, 4500);
        _fireTick();
        platform.finalize(1, AgentTypes.ResponseStatus.Success, abi.encode(_candle(100000, 100500)));
        platform.finalize(2, AgentTypes.ResponseStatus.Success, abi.encode("STAND_DOWN"));
        platform.finalize(3, AgentTypes.ResponseStatus.Success, abi.encode(int256(60)));
        assertEq(pool.lastOrderId(), 0, "no order on non-HEDGE");
    }

    function test_manual_hedge_triggers_order() public {
        brain.setHedgeConfig(vault, ONE_MILLION_USDC, 100e6, 200, 4500);
        brain.manualHedge();
        MockBinaryPool.OrderCall memory c = pool.getLastCall();
        assertEq(c.kind, 2, "BUY_NO executed");
        assertEq(c.quantity, 222_000_000, "qty raw (222 whole tokens)");
        assertEq(vault.windowPremiumSpent(), 99_900_000, "premium tracked");
    }

    function test_manual_hedge_only_owner() public {
        brain.setHedgeConfig(vault, ONE_MILLION_USDC, 100e6, 200, 4500);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(SentricBrain.NotOwner.selector);
        brain.manualHedge();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _candle(uint256 openUsd, uint256 closeUsd) internal pure returns (uint256[] memory c) {
        c = new uint256[](6);
        c[0] = 123;
        c[1] = openUsd * 1e8;
        c[2] = closeUsd * 1e8;
        c[3] = closeUsd * 1e8 + 1e10;
        c[4] = openUsd * 1e8 - 1e10;
        c[5] = 1000;
    }

    function _fireTick() internal {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = ISomniaReactivityPrecompile.EpochTick.selector;
        topics[1] = bytes32(uint256(1));
        topics[2] = bytes32(uint256(block.number));
        vm.prank(PRECOMPILE);
        brain.onEvent(PRECOMPILE, topics, "");
    }
}
