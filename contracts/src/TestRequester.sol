// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AgentTypes, IAgentRequester, IAgentRequesterHandler} from "./lib/IAgentRequester.sol";

/// @notice TEST UTILITY (not part of the product): a minimal requester that
///         lets an EOA drive raw Somnia Agents requests and read the async
///         callback result — used to validate agent payloads live on testnet
///         before the armed brain runs its first cycle.
contract TestRequester is IAgentRequesterHandler {
    IAgentRequester public immutable platform;

    event Callback(uint256 indexed requestId, uint8 status, bytes result);

    error NotPlatform();

    constructor(IAgentRequester platform_) {
        platform = platform_;
    }

    /// @notice Fire a request; msg.value funds the agent call.
    function request(uint256 agentId, bytes calldata payload)
        external
        payable
        returns (uint256 requestId)
    {
        return platform.createRequest{value: msg.value}(
            agentId,
            address(this),
            this.handleResponse.selector,
            payload
        );
    }

    /// @notice Store the consensus result for the EOA to read back.
    function handleResponse(
        uint256 requestId,
        AgentTypes.Response[] memory responses,
        AgentTypes.ResponseStatus status,
        AgentTypes.Request memory
    ) external override {
        if (msg.sender != address(platform)) revert NotPlatform();
        lastRequestId = requestId;
        lastStatus = status;
        for (uint256 i = 0; i < responses.length; i++) {
            if (responses[i].status == AgentTypes.ResponseStatus.Success) {
                lastResult = responses[i].result;
            }
        }
        emit Callback(requestId, uint8(status), lastResult);
    }

    uint256 public lastRequestId;
    AgentTypes.ResponseStatus public lastStatus;
    bytes public lastResult;

    receive() external payable {}
}
