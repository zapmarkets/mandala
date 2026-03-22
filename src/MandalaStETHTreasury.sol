// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IMandalaTask } from "./interfaces/IMandalaTask.sol";
import { IMandalaStETHTreasury } from "./interfaces/IMandalaStETHTreasury.sol";
import { IMandalaPolicy } from "./interfaces/IMandalaPolicy.sol";
import { IWstETH } from "./interfaces/IWstETH.sol";
import { TaskLib } from "./libraries/TaskLib.sol";

/// @title MandalaStETHTreasury — Yield-bearing wstETH treasury for Mandala tasks
/// @author Mandala Protocol
/// @notice Coordinators deposit wstETH to fund tasks. Because wstETH is a
///         non-rebasing wrapper around Lido's stETH, the stETH-denominated value
///         of every deposit grows passively as Ethereum staking rewards accrue.
///
///         When a task is **finalized**, the winner claims the full wstETH balance
///         (original deposit + embedded yield). When a task is **cancelled**, the
///         coordinator reclaims everything.
///
/// @dev    Yield tracking works by snapshotting the stETH value of the wstETH
///         deposit at funding time. The difference between the current stETH
///         value and the snapshot is the accrued yield — no rebasing tokens are
///         held directly.
contract MandalaStETHTreasury is IMandalaStETHTreasury, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Time after deposit before emergency withdrawal is allowed.
    uint256 public constant EMERGENCY_TIMEOUT = 365 days;

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice Mandala governance / policy contract.
    IMandalaPolicy public immutable policy;

    /// @notice Mandala agent registry contract.
    address public immutable registry;

    /// @notice Lido wstETH token contract.
    IWstETH public immutable wstETH;

    /// @notice Mandala factory contract (for task validation).
    address public immutable factoryAddress;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Per-task deposit records.  taskAddress => TaskDeposit
    mapping(address => TaskDeposit) private _deposits;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param policyAddress   Address of the MandalaPolicy contract.
    /// @param registryAddress Address of the MandalaAgentRegistry contract.
    /// @param wstETHAddress   Address of the Lido wstETH token.
    /// @param _factory        Address of the MandalaFactory contract.
    constructor(address policyAddress, address registryAddress, address wstETHAddress, address _factory) {
        require(policyAddress != address(0), "policy = zero");
        require(registryAddress != address(0), "registry = zero");
        require(wstETHAddress != address(0), "wstETH = zero");
        require(_factory != address(0), "factory = zero");

        policy         = IMandalaPolicy(policyAddress);
        registry       = registryAddress;
        wstETH         = IWstETH(wstETHAddress);
        factoryAddress = _factory;
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier notPaused() {
        if (policy.isPaused()) revert TaskLib.PolicyPaused();
        _;
    }

    // -------------------------------------------------------------------------
    // External — State-changing
    // -------------------------------------------------------------------------

    /// @inheritdoc IMandalaStETHTreasury
    function fundTask(address taskAddress, uint256 amount) external nonReentrant notPaused {
        if (amount == 0) revert ZeroAmount();
        if (_deposits[taskAddress].wstETHAmount != 0) revert TaskAlreadyFunded();

        // M-01: Validate taskAddress is a legitimate Mandala task
        _validateTask(taskAddress);

        // Verify caller is the task's coordinator
        TaskLib.TaskConfig memory cfg = IMandalaTask(taskAddress).getConfig();
        if (msg.sender != cfg.coordinator) revert NotCoordinator();

        // Snapshot the stETH value at deposit time for yield tracking
        uint256 stETHValue = wstETH.getStETHByWstETH(amount);

        // Record the deposit
        _deposits[taskAddress] = TaskDeposit({
            depositor:        msg.sender,
            wstETHAmount:     amount,
            stETHAtDeposit:   stETHValue,
            depositTimestamp:  block.timestamp,
            claimed:          false
        });

        // Pull wstETH from the coordinator
        IERC20(address(wstETH)).safeTransferFrom(msg.sender, address(this), amount);

        emit TaskFunded(taskAddress, msg.sender, amount, stETHValue);
    }

    /// @inheritdoc IMandalaStETHTreasury
    function claimReward(address taskAddress) external nonReentrant notPaused {
        TaskDeposit storage dep = _deposits[taskAddress];
        if (dep.wstETHAmount == 0) revert TaskNotFunded();
        if (dep.claimed) revert AlreadyClaimed();

        // Task must be finalized
        TaskLib.TaskConfig memory cfg = IMandalaTask(taskAddress).getConfig();
        if (cfg.status != TaskLib.TaskStatus.Finalized) revert TaskNotFinalized();

        // Only the winner can claim
        // pendingWinner is a public variable on MandalaTask (auto-getter)
        address winner = IMandalaTask(taskAddress).pendingWinner();
        if (msg.sender != winner) revert NotWinner();

        // Calculate yield for the event
        uint256 currentStETHValue = wstETH.getStETHByWstETH(dep.wstETHAmount);
        uint256 yieldStETH = currentStETHValue > dep.stETHAtDeposit
            ? currentStETHValue - dep.stETHAtDeposit
            : 0;

        // Mark as claimed and transfer the full wstETH balance
        dep.claimed = true;
        uint256 payout = dep.wstETHAmount;

        IERC20(address(wstETH)).safeTransfer(winner, payout);

        emit RewardClaimed(taskAddress, winner, payout, yieldStETH);
    }

    /// @inheritdoc IMandalaStETHTreasury
    function refund(address taskAddress) external nonReentrant notPaused {
        TaskDeposit storage dep = _deposits[taskAddress];
        if (dep.wstETHAmount == 0) revert TaskNotFunded();
        if (dep.claimed) revert AlreadyClaimed();

        // Task must be cancelled
        TaskLib.TaskConfig memory cfg = IMandalaTask(taskAddress).getConfig();
        if (cfg.status != TaskLib.TaskStatus.Cancelled) revert TaskNotCancelled();

        // Only the original depositor (coordinator) can reclaim
        if (msg.sender != dep.depositor) revert NotCoordinator();

        // Mark as claimed and return the full wstETH balance
        dep.claimed = true;
        uint256 payout = dep.wstETHAmount;

        IERC20(address(wstETH)).safeTransfer(dep.depositor, payout);

        emit TaskRefunded(taskAddress, dep.depositor, payout);
    }

    /// @inheritdoc IMandalaStETHTreasury
    function emergencyWithdraw(address taskAddress) external nonReentrant {
        TaskDeposit storage dep = _deposits[taskAddress];
        if (dep.wstETHAmount == 0) revert TaskNotFunded();
        if (dep.claimed) revert AlreadyClaimed();
        if (msg.sender != dep.depositor) revert NotCoordinator();
        if (block.timestamp < dep.depositTimestamp + EMERGENCY_TIMEOUT) revert TooEarly();

        dep.claimed = true;
        uint256 payout = dep.wstETHAmount;

        IERC20(address(wstETH)).safeTransfer(dep.depositor, payout);

        emit EmergencyWithdraw(taskAddress, dep.depositor, payout);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /// @dev Validates that taskAddress is a legitimate Mandala task by checking
    ///      it has code and responds to getConfig() with a non-zero coordinator.
    function _validateTask(address taskAddress) internal view {
        if (taskAddress.code.length == 0) revert InvalidTask();
        try IMandalaTask(taskAddress).getConfig() returns (TaskLib.TaskConfig memory cfg) {
            if (cfg.coordinator == address(0)) revert InvalidTask();
        } catch {
            revert InvalidTask();
        }
    }

    // -------------------------------------------------------------------------
    // External — View
    // -------------------------------------------------------------------------

    /// @inheritdoc IMandalaStETHTreasury
    function getYieldAccrued(address taskAddress) external view returns (uint256 yieldStETH) {
        TaskDeposit memory dep = _deposits[taskAddress];
        if (dep.wstETHAmount == 0) return 0;

        uint256 currentStETHValue = wstETH.getStETHByWstETH(dep.wstETHAmount);
        yieldStETH = currentStETHValue > dep.stETHAtDeposit
            ? currentStETHValue - dep.stETHAtDeposit
            : 0;
    }

    /// @inheritdoc IMandalaStETHTreasury
    function getDeposit(address taskAddress) external view returns (TaskDeposit memory deposit) {
        deposit = _deposits[taskAddress];
    }
}
