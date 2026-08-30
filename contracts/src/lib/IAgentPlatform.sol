// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IAgentPlatform
/// @notice Somnia Agents platform interface (stub).
/// @dev Results return ASYNCHRONOUSLY via a callback (`handleResponse`) that the
///      caller implements; anyone can call that callback, so the callee MUST
///      validate `msg.sender == platform`. The platform runs each request on a
///      validator subcommittee (default 3) and emits consensus-verified audit
///      receipts. Requests can end in Success / Failed / TimedOut.
///
///      Base agents (same agentId on testnet + mainnet; platform address differs):
///        1. JSON API Request — fetch/parse any public HTTP endpoint.
///        2. LLM Inference    — deterministic Qwen3-30B, seed fixed, temp 0,
///                              constrained output set.
///        3. LLM Parse Website.
///
///      TODO(Phase 2): confirm the exact request/response ABI, the platform
///      contract address per network, and the agentIds before coding.
interface IAgentPlatform {
    /// @notice Request a JSON API fetch (e.g. live BTC/ETH price + a vol proxy).
    /// @return requestId Correlates the async callback with this request.
    /// TODO(Phase 2): confirm exact argument encoding (endpoint, method,
    /// headers, JSONPath, subcommittee size, pricePerAgent).
    function requestJsonApi(bytes calldata request) external returns (uint256 requestId);

    /// @notice Request deterministic LLM inference (constrained output set).
    /// @return requestId Correlates the async callback with this request.
    /// TODO(Phase 2): confirm exact argument encoding (prompt/system, constrained
    /// output set, seed, temperature 0, subcommittee size, pricePerAgent).
    function requestLlm(bytes calldata request) external returns (uint256 requestId);
}
