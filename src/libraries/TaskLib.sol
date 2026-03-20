// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TaskLib - shared structs, enums, and errors for Mandala

library TaskLib {

    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    enum TaskStatus {
        Open,        // deployed, accepting submissions
        Verifying,   // verifier is reviewing proofs
        Disputed,    // human gate triggered
        Finalized,   // winner selected, escrow released
        Cancelled    // cancelled by coordinator or expired
    }

    enum TokenType {
        ETH,
        ERC20
    }

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct Submission {
        address agent;
        bytes32 proofHash;       // keccak256 of proof content
        string  evidenceURI;     // ipfs:// or https:// link to full proof
        uint256 submittedAt;
        uint256 stake;           // ETH/ERC20 staked by agent on this submission
        bool    disqualified;
    }

    struct TaskConfig {
        address coordinator;     // who created the task
        address verifier;        // address allowed to pick winner (0x0 = any registered verifier)
        address token;           // address(0) = ETH, else ERC20
        uint256 reward;          // total reward locked
        uint256 stakeRequired;   // agents must stake this to submit
        uint256 deadline;        // unix timestamp -- no submissions after this
        uint256 disputeWindow;   // seconds after winner selected before finalization
        bytes32 criteriaHash;    // keccak256 of off-chain criteria document
        string  criteriaURI;     // ipfs:// link to criteria
        bool    humanGateEnabled;// force human approval before finalization
        TaskStatus status;
    }

    struct AgentInfo {
        address agentAddress;
        bytes32 erc8004Id;
        string  metadataURI;
        uint256 totalTasks;
        uint256 wins;
        uint256 disputes;
        uint256 stakedBalance;
        bool    suspended;
        uint256 registeredAt;
    }

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotCoordinator();
    error NotVerifier();
    error NotRegisteredAgent();
    error TaskNotOpen();
    error TaskNotVerifying();
    error TaskNotDisputed();
    error TaskAlreadyFinalized();
    error TaskExpired();
    error DeadlineNotPassed();
    error InsufficientStake();
    error InsufficientReward();
    error AlreadySubmitted();
    error NoSubmissions();
    error InvalidWinner();
    error DisputeWindowActive();
    error DisputeWindowExpired();
    error HumanGateRequired();
    error HumanGatePending();
    error NotHuman();
    error ZeroAddress();
    error TransferFailed();
    error AgentNotRegistered();
    error AgentAlreadyRegistered();
    error AgentSuspended();
    error Unauthorized();
    error InvalidThreshold();
    error PolicyPaused();
}
