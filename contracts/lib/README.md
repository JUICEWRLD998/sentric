# lib/

Foundry dependencies live here. `forge-std` is required for tests (`Test.sol`)
and scripts (`Script.sol`).

- `forge-std/` — https://github.com/foundry-rs/forge-std (cloned during scaffold).
- (Phase 1+) `@somnia-chain/reactivity-contracts` — Somnia on-chain reactivity.
- (Phase 3+) DreamDEX venue ABI — for the real `placeOrder`/`redeem` calls.
