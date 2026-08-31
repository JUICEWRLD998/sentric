// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SentricVault} from "../src/SentricVault.sol";

contract SentricSizingTest is Test {
    SentricVault internal vault;

    function setUp() public {
        vault = new SentricVault();
    }

    function test_size_need_binds_without_cap() public {
        // 1,000,000 USDC exposure, P(Down)=45%, huge cap (effectively none), 2% move
        uint256 downPrice = 0.45e18;
        uint256 size = vault.sizeHedge(1_000_000e6, downPrice, 1e30, 200);
        // need = 1e12*200*1e18 / (10000 * 0.55e18) = 36,363,636,363
        uint256 expectedNeed = (1e12 * 200 * 1e18) / (10_000 * (1e18 - downPrice));
        assertEq(size, expectedNeed, "need formula");
        // premium = size * P(Down) must stay under the cap
        uint256 premium = (size * downPrice) / 1e18;
        assertTrue(premium <= 1_000_000e6, "premium sane");
    }

    function test_size_premium_cap_binds() public {
        // 1,000,000 USDC exposure, P(Down)=45%, cap 100 USDC, 2% move
        uint256 downPrice = 0.45e18;
        uint256 size = vault.sizeHedge(1_000_000e6, downPrice, 100e6, 200);
        // cap = 100e6 * 1e18 / 0.45e18 = 222,222,222
        uint256 expectedCap = (100e6 * 1e18) / downPrice;
        assertEq(size, expectedCap, "cap binds");
        uint256 premium = (size * downPrice) / 1e18;
        assertLe(premium, 100e6, "premium never exceeds the cap");
        assertGe(premium, 100e6 - 1, "premium within 1 unit of the cap (floor rounding)");
    }

    function test_size_hedges_cover_the_move() public {
        // With no cap, a 2% down move on 1M exposure is covered by the hedge gain.
        uint256 downPrice = 0.45e18;
        uint256 exposure = 1_000_000e6;
        uint256 size = vault.sizeHedge(exposure, downPrice, 1e30, 200);
        uint256 loss = (exposure * 200) / 10_000; // 2% of exposure
        uint256 hedgeGain = (size * (1e18 - downPrice)) / 1e18;
        // Floor rounding can leave the gain 1 unit short of the exact loss — safe direction.
        assertGe(hedgeGain, loss - 1, "hedge covers the insured move (within rounding)");
    }

    function test_size_degenerate_inputs_return_zero() public {
        assertEq(vault.sizeHedge(0, 0.45e18, 1e30, 200), 0, "zero exposure");
        assertEq(vault.sizeHedge(1e12, 0, 1e30, 200), 0, "zero down price");
        assertEq(vault.sizeHedge(1e12, 1e18, 1e30, 200), 0, "down price 100%");
        assertEq(vault.sizeHedge(1e12, 0.45e18, 1e30, 0), 0, "zero move");
    }

    function test_size_scales_with_probability() public {
        // Lower P(Down) => more upside per token => FEWER tokens cover the move.
        uint256 expensive = vault.sizeHedge(1e12, 0.45e18, 1e30, 200);
        uint256 cheap = vault.sizeHedge(1e12, 0.25e18, 1e30, 200);
        assertLt(cheap, expensive, "lower P(Down) needs smaller size (more upside/token)");
    }
}
