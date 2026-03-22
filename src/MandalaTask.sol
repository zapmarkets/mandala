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

    uint256 public constant MAX_SUBMISSIONS = 100;

    // submissions by agent address
    mapping(address => TaskLib.Submission) private _submissions;
    address[] private _submitters;

    // H-02: pending withdrawals for failed ERC20 stake returns
    mapping(address => uint256) public pendingWithdrawals;

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

    /// @dev If p.verifier == address(0), any registered non-suspended agent can act as verifier (L-04)
    function initialize(IMandalaTask.InitParams calldata p) external payable initializer {
        if (p.coordinator == address(0)) revert TaskLib.ZeroAddress();
        if (p.deadline <= block.timestamp) revert TaskLib.TaskExpired();
        if (p.reward == 0) revert TaskLib.InsufficientReward();
        if (p.criteriaHash == bytes32(0)) revert TaskLib.InvalidCriteriaHash();

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
        // C-01: use balance-delta to handle fee-on-transfer tokens
        if (p.token != address(0)) {
            uint256 before = IERC20(p.token).balanceOf(address(this));
            IERC20(p.token).safeTransferFrom(msg.sender, address(this), p.reward);
            _config.reward = IERC20(p.token).balanceOf(address(this)) - before;
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
        if (_submitters.length >= MAX_SUBMISSIONS) revert TaskLib.TooManySubmissions();
        if (_config.token != address(0) && msg.value > 0) revert TaskLib.UnexpectedETH();
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
        // C-03: only allow from Open state
        if (_config.status != TaskLib.TaskStatus.Open) revert TaskLib.TaskAlreadyFinalized();
        // H-03: deadline must have passed before selecting winner
        if (block.timestamp <= _config.deadline) revert TaskLib.DeadlineNotPassed();

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
        // H-01: validate target is actually a submitter
        if (_submissions[against].agent == address(0)) revert TaskLib.DisputeTargetNotSubmitter();
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
        // H-05: disqualified agents cannot be selected as winner
        if (_submissions[winner].disqualified) revert TaskLib.InvalidWinner();
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
        // C-04: only allow cancel from Open state
        if (_config.status != TaskLib.TaskStatus.Open) revert TaskLib.CancelNotAllowed();

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
            // H-02: wrap ERC20 transfer in try/catch; on failure, add to pendingWithdrawals
            try IERC20(_config.token).transfer(agent, stake) returns (bool success) {
                if (!success) {
                    pendingWithdrawals[agent] += stake;
                    return;
                }
            } catch {
                pendingWithdrawals[agent] += stake;
                return;
            }
        }
        emit StakeReturned(agent, stake);
    }

    /// @notice Claim any pending ERC20 withdrawals from failed stake returns
    function claimPendingWithdrawal() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert TaskLib.InsufficientStake();
        pendingWithdrawals[msg.sender] = 0;
        IERC20(_config.token).safeTransfer(msg.sender, amount);
        emit StakeReturned(msg.sender, amount);
    }

    function _slashAndRefund() internal {
        _config.status = TaskLib.TaskStatus.Cancelled;

        // slash the disputed agent's stake (stays in contract / sent to treasury)
        uint256 slashedStake = _submissions[disputedAgainst].stake;
        _submissions[disputedAgainst].stake = 0;
        _submissions[disputedAgainst].disqualified = true;

        if (slashedStake > 0) {
            // C-02: send slashed stake to treasury
            address treasuryAddr = address(policy) != address(0) ? policy.treasury() : address(this);
            if (_config.token == address(0)) {
                (bool ok, ) = treasuryAddr.call{value: slashedStake}("");
                if (!ok) revert TaskLib.TransferFailed();
            } else {
                IERC20(_config.token).safeTransfer(treasuryAddr, slashedStake);
            }
            emit StakeSlashed(disputedAgainst, slashedStake);
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
    // Receive ETH (for ETH reward + stake deposits)
    // -------------------------------------------------------------------------

    receive() external payable {}

    /// @notice Admin rescue function for stuck tokens (H-07)
    function rescueERC20(address token, address to, uint256 amount) external onlyCoordinator {
        if (_config.status != TaskLib.TaskStatus.Finalized && _config.status != TaskLib.TaskStatus.Cancelled) {
            revert TaskLib.TaskNotTerminal();
        }
        IERC20(token).safeTransfer(to, amount);
    }
}
