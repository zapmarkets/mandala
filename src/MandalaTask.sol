// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IMandalaTask } from "./interfaces/IMandalaTask.sol";
import { IMandalaAgentRegistry } from "./interfaces/IMandalaAgentRegistry.sol";
import { IMandalaPolicy } from "./interfaces/IMandalaPolicy.sol";
import { TaskLib } from "./libraries/TaskLib.sol";

/// @title MandalaTask
/// @notice One task = one contract. Agents compete to submit the best proof.
///         Verifier picks the winner. Humans can gate high-value finalization.
///         Deployed as EIP-1167 minimal proxy clones by MandalaFactory.
contract MandalaTask is IMandalaTask, Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    TaskLib.TaskConfig private _config;
    IMandalaAgentRegistry public agentRegistry;
    IMandalaPolicy public policy;

    // submissions by agent address
    mapping(address => TaskLib.Submission) private _submissions;
    address[] private _submitters;

    // dispute tracking
    address public disputant;
    address public disputedAgainst;
    string  public disputeReason;
    uint256 public winnerSelectedAt;
    address public pendingWinner;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier notPaused() {
        if (policy.isPaused()) revert TaskLib.PolicyPaused();
        _;
    }

    modifier onlyCoordinator() {
        if (msg.sender != _config.coordinator) revert TaskLib.NotCoordinator();
        _;
    }

    modifier onlyVerifier() {
        address v = _config.verifier;
        // if verifier is 0x0, any registered non-suspended agent can verify
        if (v != address(0)) {
            if (msg.sender != v) revert TaskLib.NotVerifier();
        } else {
            if (!agentRegistry.isRegistered(msg.sender)) revert TaskLib.NotRegisteredAgent();
            if (agentRegistry.isSuspended(msg.sender)) revert TaskLib.AgentSuspended();
        }
        _;
    }

    modifier onlyHuman() {
        if (!policy.isHuman(msg.sender)) revert TaskLib.NotHuman();
        _;
    }

    modifier onlyOpen() {
        if (_config.status != TaskLib.TaskStatus.Open) revert TaskLib.TaskNotOpen();
        _;
    }

    modifier onlyVerifying() {
        if (_config.status != TaskLib.TaskStatus.Verifying) revert TaskLib.TaskNotVerifying();
        _;
    }

    modifier onlyDisputed() {
        if (_config.status != TaskLib.TaskStatus.Disputed) revert TaskLib.TaskNotDisputed();
        _;
    }

    // -------------------------------------------------------------------------
    // Initializer (called by factory after clone)
    // -------------------------------------------------------------------------

    function initialize(IMandalaTask.InitParams calldata p) external payable initializer {
        if (p.coordinator == address(0)) revert TaskLib.ZeroAddress();
        if (p.deadline <= block.timestamp) revert TaskLib.TaskExpired();
        if (p.reward == 0) revert TaskLib.InsufficientReward();

        // ETH reward: msg.value must match
        if (p.token == address(0)) {
            if (msg.value != p.reward) revert TaskLib.InsufficientReward();
        }

        agentRegistry = IMandalaAgentRegistry(p.agentRegistry);
        policy = IMandalaPolicy(p.policy);

        _config = TaskLib.TaskConfig({
            coordinator:      p.coordinator,
            verifier:         p.verifier,
            token:            p.token,
            reward:           p.reward,
            stakeRequired:    p.stakeRequired,
            deadline:         p.deadline,
            disputeWindow:    p.disputeWindow == 0 ? 48 hours : p.disputeWindow,
            criteriaHash:     p.criteriaHash,
            criteriaURI:      p.criteriaURI,
            humanGateEnabled: p.humanGateEnabled || policy.requiresHumanGate(p.reward),
            status:           TaskLib.TaskStatus.Open
        });

        // ERC20 reward: transfer from factory (factory approved task first)
        if (p.token != address(0)) {
            IERC20(p.token).safeTransferFrom(msg.sender, address(this), p.reward);
        }
    }

    // -------------------------------------------------------------------------
    // Agent: submit proof
    // -------------------------------------------------------------------------

    /// @notice Registered agents submit their proof with a stake.
    ///         Multiple agents can submit. Verifier picks the best.
    function submitProof(
        bytes32 proofHash,
        string calldata evidenceURI
    ) external payable nonReentrant notPaused onlyOpen {
        if (block.timestamp > _config.deadline) revert TaskLib.TaskExpired();
        if (!agentRegistry.isRegistered(msg.sender)) revert TaskLib.NotRegisteredAgent();
        if (agentRegistry.isSuspended(msg.sender)) revert TaskLib.AgentSuspended();
        if (policy.isBlacklisted(msg.sender)) revert TaskLib.AgentSuspended();
        if (_submissions[msg.sender].agent != address(0)) revert TaskLib.AlreadySubmitted();

        // stake check -- use whichever is higher: task requirement or protocol floor
        uint256 required = _config.stakeRequired > policy.minStakeRequired()
            ? _config.stakeRequired
            : policy.minStakeRequired();

        uint256 stakeProvided;

        if (_config.token == address(0)) {
            // ETH stake
            stakeProvided = msg.value;
        } else {
            // ERC20 stake -- agent must send ETH 0, token transferred separately
            // stakeProvided tracked via token transfer
            if (required > 0) {
                IERC20(_config.token).safeTransferFrom(msg.sender, address(this), required);
            }
            stakeProvided = required;
        }

        if (stakeProvided < required) revert TaskLib.InsufficientStake();

        _submissions[msg.sender] = TaskLib.Submission({
            agent:        msg.sender,
            proofHash:    proofHash,
            evidenceURI:  evidenceURI,
            submittedAt:  block.timestamp,
            stake:        stakeProvided,
            disqualified: false
        });

        _submitters.push(msg.sender);

        agentRegistry.recordTaskParticipation(msg.sender);
        emit ProofSubmitted(msg.sender, proofHash, evidenceURI);
    }

    // -------------------------------------------------------------------------
    // Verifier: select winner
    // -------------------------------------------------------------------------

    /// @notice Verifier reviews all proofs and selects the best one.
    ///         Moves task to Verifying state, starts dispute window.
    function selectWinner(address agent) external notPaused onlyVerifier {
        // can call from Open (if deadline passed) or already Verifying (revote)
        if (
            _config.status != TaskLib.TaskStatus.Open &&
            _config.status != TaskLib.TaskStatus.Verifying
        ) revert TaskLib.TaskAlreadyFinalized();

        if (_submitters.length == 0) revert TaskLib.NoSubmissions();
        if (_submissions[agent].agent == address(0)) revert TaskLib.InvalidWinner();
        if (_submissions[agent].disqualified) revert TaskLib.InvalidWinner();

        pendingWinner    = agent;
        winnerSelectedAt = block.timestamp;
        _config.status   = TaskLib.TaskStatus.Verifying;

        emit WinnerSelected(agent, _submissions[agent].proofHash);
    }

    // -------------------------------------------------------------------------
    // Dispute
    // -------------------------------------------------------------------------

    /// @notice Any registered agent (or coordinator) can dispute within the window
    function dispute(
        address against,
        string calldata reason
    ) external notPaused {
        if (_config.status != TaskLib.TaskStatus.Verifying) revert TaskLib.TaskNotVerifying();
        if (block.timestamp > winnerSelectedAt + _config.disputeWindow) revert TaskLib.DisputeWindowExpired();
        if (!agentRegistry.isRegistered(msg.sender) && msg.sender != _config.coordinator) {
            revert TaskLib.NotRegisteredAgent();
        }

        disputant       = msg.sender;
        disputedAgainst = against;
        disputeReason   = reason;
        _config.status  = TaskLib.TaskStatus.Disputed;

        agentRegistry.recordDispute(against);
        emit TaskDisputed(msg.sender, against);
    }

    // -------------------------------------------------------------------------
    // Human: resolve dispute
    // -------------------------------------------------------------------------

    /// @notice Human reviews dispute and picks the actual winner (or cancels)
    function resolveDispute(address winner) external nonReentrant notPaused onlyHuman onlyDisputed {
        if (winner == address(0)) {
            // human rules: cancel the task, refund coordinator, slash disputed agent
            _slashAndRefund();
            return;
        }

        if (_submissions[winner].agent == address(0)) revert TaskLib.InvalidWinner();
        pendingWinner  = winner;
        _config.status = TaskLib.TaskStatus.Verifying;
        winnerSelectedAt = block.timestamp; // restart dispute window from now

        emit DisputeResolved(msg.sender, winner);
    }

    // -------------------------------------------------------------------------
    // Finalize
    // -------------------------------------------------------------------------

    /// @notice Anyone can trigger finalization once dispute window passes.
    ///         If humanGate is enabled, only humans can finalize.
    function finalize() external nonReentrant notPaused {
        if (_config.status != TaskLib.TaskStatus.Verifying) revert TaskLib.TaskNotVerifying();
        if (block.timestamp <= winnerSelectedAt + _config.disputeWindow) revert TaskLib.DisputeWindowActive();

        if (_config.humanGateEnabled) {
            if (!policy.isHuman(msg.sender)) revert TaskLib.HumanGateRequired();
        }

        address winner = pendingWinner;
        if (winner == address(0)) revert TaskLib.InvalidWinner();

        _config.status = TaskLib.TaskStatus.Finalized;

        // return stakes to all losing agents
        _returnLosingStakes(winner);

        // pay winner: reward + their own stake back
        uint256 winnerStake = _submissions[winner].stake;
        uint256 totalPayout = _config.reward + winnerStake;

        agentRegistry.recordWin(winner);

        if (_config.token == address(0)) {
            (bool ok, ) = winner.call{value: totalPayout}("");
            if (!ok) revert TaskLib.TransferFailed();
        } else {
            IERC20(_config.token).safeTransfer(winner, totalPayout);
        }

        emit TaskFinalized(winner, _config.reward);
    }

    // -------------------------------------------------------------------------
    // Cancel
    // -------------------------------------------------------------------------

    /// @notice Coordinator can cancel if no submissions yet, or after deadline with no winner
    function cancel() external nonReentrant notPaused onlyCoordinator {
        if (
            _config.status == TaskLib.TaskStatus.Finalized ||
            _config.status == TaskLib.TaskStatus.Cancelled
        ) revert TaskLib.TaskAlreadyFinalized();

        // if there are submissions, can only cancel after deadline
        if (_submitters.length > 0) {
            if (block.timestamp <= _config.deadline) revert TaskLib.DeadlineNotPassed();
        }

        _config.status = TaskLib.TaskStatus.Cancelled;

        // return all stakes
        for (uint256 i = 0; i < _submitters.length; i++) {
            _returnStake(_submitters[i]);
        }

        // refund reward to coordinator
        if (_config.token == address(0)) {
            (bool ok, ) = _config.coordinator.call{value: _config.reward}("");
            if (!ok) revert TaskLib.TransferFailed();
        } else {
            IERC20(_config.token).safeTransfer(_config.coordinator, _config.reward);
        }

        emit TaskCancelled(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function getSubmissions() external view returns (TaskLib.Submission[] memory) {
        TaskLib.Submission[] memory subs = new TaskLib.Submission[](_submitters.length);
        for (uint256 i = 0; i < _submitters.length; i++) {
            subs[i] = _submissions[_submitters[i]];
        }
        return subs;
    }

    function getConfig() external view returns (TaskLib.TaskConfig memory) {
        return _config;
    }

    function getSubmission(address agent) external view returns (TaskLib.Submission memory) {
        return _submissions[agent];
    }

    function submissionCount() external view returns (uint256) {
        return _submitters.length;
    }

    function timeRemaining() external view returns (uint256) {
        if (block.timestamp >= _config.deadline) return 0;
        return _config.deadline - block.timestamp;
    }

    function disputeTimeRemaining() external view returns (uint256) {
        if (_config.status != TaskLib.TaskStatus.Verifying) return 0;
        uint256 end = winnerSelectedAt + _config.disputeWindow;
        if (block.timestamp >= end) return 0;
        return end - block.timestamp;
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _returnLosingStakes(address winner) internal {
        for (uint256 i = 0; i < _submitters.length; i++) {
            address a = _submitters[i];
            if (a != winner) {
                _returnStake(a);
            }
        }
    }

    function _returnStake(address agent) internal {
        uint256 stake = _submissions[agent].stake;
        if (stake == 0) return;
        _submissions[agent].stake = 0;

        if (_config.token == address(0)) {
            (bool ok, ) = agent.call{value: stake}("");
            if (!ok) {
                // don't revert full tx -- mark as lost, agent can't claim
                emit StakeSlashed(agent, stake);
                return;
            }
        } else {
            IERC20(_config.token).safeTransfer(agent, stake);
        }
        emit StakeReturned(agent, stake);
    }

    function _slashAndRefund() internal {
        _config.status = TaskLib.TaskStatus.Cancelled;

        // slash the disputed agent's stake (stays in contract / sent to treasury)
        uint256 slashedStake = _submissions[disputedAgainst].stake;
        _submissions[disputedAgainst].stake = 0;
        _submissions[disputedAgainst].disqualified = true;

        if (slashedStake > 0) {
            emit StakeSlashed(disputedAgainst, slashedStake);
            // TODO: send slashed stake to protocol treasury (wired up via policy)
        }

        // return stakes to all other agents
        for (uint256 i = 0; i < _submitters.length; i++) {
            if (_submitters[i] != disputedAgainst) {
                _returnStake(_submitters[i]);
            }
        }

        // refund reward to coordinator
        if (_config.token == address(0)) {
            (bool ok, ) = _config.coordinator.call{value: _config.reward}("");
            if (!ok) revert TaskLib.TransferFailed();
        } else {
            IERC20(_config.token).safeTransfer(_config.coordinator, _config.reward);
        }

        emit TaskCancelled(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Receive ETH (for ETH reward deposits)
    // -------------------------------------------------------------------------

    receive() external payable {}
}
