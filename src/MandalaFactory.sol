// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IMandalaFactory } from "./interfaces/IMandalaFactory.sol";
import { IMandalaTask } from "./interfaces/IMandalaTask.sol";
import { IMandalaAgentRegistry } from "./interfaces/IMandalaAgentRegistry.sol";
import { IMandalaPolicy } from "./interfaces/IMandalaPolicy.sol";
import { TaskLib } from "./libraries/TaskLib.sol";

/// @title MandalaFactory
/// @notice Deploys MandalaTask clones via EIP-1167.
///         Charges a protocol fee on each task deployment.
///         Grants TASK_CONTRACT_ROLE to each new task so it can update registry.
contract MandalaFactory is IMandalaFactory, AccessControl {
    using SafeERC20 for IERC20;
    using Clones for address;

    bytes32 public constant HUMAN_ROLE   = keccak256("HUMAN_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    address public immutable taskImplementation;
    IMandalaAgentRegistry public immutable agentRegistry;
    IMandalaPolicy        public immutable policy;

    address public treasury;
    uint256 public protocolFeeBps; // basis points e.g. 100 = 1%

    address[] private _allTasks;
    mapping(address => address[]) private _tasksByCoordinator;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address admin,
        address _taskImpl,
        address _agentRegistry,
        address _policy,
        address _treasury,
        uint256 _feeBps
    ) {
        if (admin == address(0) || _taskImpl == address(0)) revert TaskLib.ZeroAddress();
        if (_agentRegistry == address(0) || _policy == address(0)) revert TaskLib.ZeroAddress();
        if (_treasury == address(0)) revert TaskLib.ZeroAddress();
        if (_feeBps > 1000) revert TaskLib.InvalidThreshold(); // max 10%

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(HUMAN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);

        taskImplementation = _taskImpl;
        agentRegistry      = IMandalaAgentRegistry(_agentRegistry);
        policy             = IMandalaPolicy(_policy);
        treasury           = _treasury;
        protocolFeeBps     = _feeBps;
    }

    // -------------------------------------------------------------------------
    // Deploy task
    // -------------------------------------------------------------------------

    /// @notice Deploy a new task. Send ETH as reward for ETH tasks.
    ///         For ERC20 tasks, approve the factory first then call with value=0.
    function deployTask(
        DeployParams calldata params
    ) external payable returns (address taskAddress) {
        if (policy.isPaused()) revert TaskLib.PolicyPaused();
        if (!agentRegistry.isRegistered(msg.sender)) revert TaskLib.AgentNotRegistered();
        if (agentRegistry.isSuspended(msg.sender)) revert TaskLib.AgentSuspended();

        uint256 reward = params.token == address(0) ? msg.value : _pullERC20Reward(params.token);

        if (reward == 0) revert TaskLib.InsufficientReward();
        if (params.deadline <= block.timestamp) revert TaskLib.TaskExpired();

        // take protocol fee
        uint256 fee    = (reward * protocolFeeBps) / 10_000;
        uint256 netReward = reward - fee;

        if (fee > 0) {
            _transferOut(params.token, treasury, fee);
        }

        // deploy clone
        taskAddress = taskImplementation.clone();

        // initialize -- pass ETH if ETH task
        uint256 initValue = params.token == address(0) ? netReward : 0;

        if (params.token != address(0)) {
            IERC20(params.token).forceApprove(taskAddress, netReward);
        }

        IMandalaTask(taskAddress).initialize{value: initValue}(
            IMandalaTask.InitParams({
                coordinator:      msg.sender,
                verifier:         params.verifier,
                agentRegistry:    address(agentRegistry),
                policy:           address(policy),
                token:            params.token,
                reward:           netReward,
                stakeRequired:    params.stakeRequired,
                deadline:         params.deadline,
                disputeWindow:    params.disputeWindow,
                criteriaHash:     params.criteriaHash,
                criteriaURI:      params.criteriaURI,
                humanGateEnabled: params.humanGateEnabled
            })
        );

        // grant task contract role so it can update agent reputation
        agentRegistry.grantTaskRole(taskAddress);

        _allTasks.push(taskAddress);
        _tasksByCoordinator[msg.sender].push(taskAddress);

        emit TaskDeployed(taskAddress, msg.sender, params.token, netReward, params.deadline);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function allTasks() external view returns (address[] memory) {
        return _allTasks;
    }

    function tasksByCoordinator(address coordinator) external view returns (address[] memory) {
        return _tasksByCoordinator[coordinator];
    }

    function taskCount() external view returns (uint256) {
        return _allTasks.length;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setProtocolFee(uint256 feeBps) external onlyRole(HUMAN_ROLE) {
        if (feeBps > 1000) revert TaskLib.InvalidThreshold();
        protocolFeeBps = feeBps;
        emit ProtocolFeeUpdated(feeBps);
    }

    function setTreasury(address _treasury) external onlyRole(HUMAN_ROLE) {
        if (_treasury == address(0)) revert TaskLib.ZeroAddress();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _pullERC20Reward(address token) internal returns (uint256) {
        // caller must have approved factory for reward amount
        // we check balance delta to handle fee-on-transfer tokens
        uint256 before = IERC20(token).balanceOf(address(this));
        // amount is inferred from allowance -- caller approves exact amount
        uint256 allowance = IERC20(token).allowance(msg.sender, address(this));
        if (allowance == 0) revert TaskLib.InsufficientReward();
        IERC20(token).safeTransferFrom(msg.sender, address(this), allowance);
        uint256 after_ = IERC20(token).balanceOf(address(this));
        return after_ - before;
    }

    function _transferOut(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TaskLib.TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    receive() external payable {}
}
