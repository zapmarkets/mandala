// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { TaskLib } from "../libraries/TaskLib.sol";

interface IMandalaTask {

    struct InitParams {
        address coordinator;
        address verifier;
        address agentRegistry;
        address policy;
        address token;
        uint256 reward;
        uint256 stakeRequired;
        uint256 deadline;
        uint256 disputeWindow;
        bytes32 criteriaHash;
        string  criteriaURI;
        bool    humanGateEnabled;
    }

    event ProofSubmitted(address indexed agent, bytes32 proofHash, string evidenceURI);
    event WinnerSelected(address indexed winner, bytes32 proofHash);
    event TaskFinalized(address indexed winner, uint256 reward);
    event TaskDisputed(address indexed disputant, address indexed against);
    event DisputeResolved(address indexed human, address indexed winner);
    event TaskCancelled(address indexed by);
    event StakeReturned(address indexed agent, uint256 amount);
    event StakeSlashed(address indexed agent, uint256 amount);

    function initialize(InitParams calldata p) external payable;
    function submitProof(bytes32 proofHash, string calldata evidenceURI) external payable;
    function selectWinner(address agent) external;
    function dispute(address against, string calldata reason) external;
    function resolveDispute(address winner) external;
    function finalize() external;
    function cancel() external;
    function getSubmissions() external view returns (TaskLib.Submission[] memory);
    function getConfig() external view returns (TaskLib.TaskConfig memory);
    function getSubmission(address agent) external view returns (TaskLib.Submission memory);
    function pendingWinner() external view returns (address);
}
