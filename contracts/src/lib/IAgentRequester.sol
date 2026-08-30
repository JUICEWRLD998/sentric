// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Somnia Agents platform + base agent method interfaces.
/// @dev Verified Aug 2026 (docs/network-facts.md §4.1). Platform addresses:
///      testnet 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776,
///      mainnet 0x5E5205CF39E766118C01636bED000A54D93163E6.
///      We never CALL the base agent methods — abi.encodeCall(IAgentMethods.xxx)
///      only builds the `payload` for createRequest.

library AgentTypes {
    enum ConsensusType { Majority, Threshold }
    enum ResponseStatus { None, Pending, Success, Failed, TimedOut }

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
        uint256 remainingBudget;
        uint256 perAgentBudget;
    }
}

interface IAgentRequester {
    event RequestCreated(
        uint256 indexed requestId,
        uint256 indexed agentId,
        uint256 perAgentBudget,
        bytes payload,
        address[] subcommittee
    );
    event RequestFinalized(uint256 indexed requestId, AgentTypes.ResponseStatus status);
    event SubcommitteePaid(uint256 indexed requestId, uint256 totalPaid, uint256 perMember);
    event CommitteeDepositFailed(uint256 indexed requestId, uint256 attemptedAmount);

    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function createAdvancedRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        AgentTypes.ConsensusType consensusType,
        uint256 timeout
    ) external payable returns (uint256 requestId);

    function getRequest(uint256 requestId) external view returns (AgentTypes.Request memory);
    function hasRequest(uint256 requestId) external view returns (bool);
    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);
}

/// @notice The callback a requester contract implements; the platform calls it
///         asynchronously with the final result. Anyone can call it, so the
///         callee MUST validate msg.sender == platform.
interface IAgentRequesterHandler {
    function handleResponse(
        uint256 requestId,
        AgentTypes.Response[] memory responses,
        AgentTypes.ResponseStatus status,
        AgentTypes.Request memory details
    ) external;
}

/// @notice Base agent methods — payload targets only (never called directly).
interface IAgentMethods {
    // JSON API Request agent (`json-fetch`)
    function fetchString(string calldata url, string calldata selector)
        external
        returns (string memory);
    function fetchUint(string calldata url, string calldata selector, uint8 decimals)
        external
        returns (uint256);
    function fetchInt(string calldata url, string calldata selector, uint8 decimals)
        external
        returns (int256);
    function fetchBool(string calldata url, string calldata selector) external returns (bool);
    function fetchStringArray(string calldata url, string calldata selector)
        external
        returns (string[] memory);
    function fetchUintArray(string calldata url, string calldata selector, uint8 decimals)
        external
        returns (uint256[] memory);

    // LLM Inference agent (`llm-inference`) — deterministic (seed fixed, temp 0)
    function inferString(
        string calldata prompt,
        string calldata system,
        bool chainOfThought,
        string[] calldata allowedValues
    ) external returns (string memory);
    function inferNumber(
        string calldata prompt,
        string calldata system,
        int256 minValue,
        int256 maxValue,
        bool chainOfThought
    ) external returns (int256);
    function inferChat(string[] calldata roles, string[] calldata messages, bool chainOfThought)
        external
        returns (string memory);
}
