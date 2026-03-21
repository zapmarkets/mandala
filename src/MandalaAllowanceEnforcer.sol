// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { CaveatEnforcer } from "@delegation-framework/enforcers/CaveatEnforcer.sol";
import { ModeCode } from "@delegation-framework/utils/Types.sol";

/// @title MandalaAllowanceEnforcer
/// @notice Custom caveat enforcer for the MetaMask Delegation Framework.
///         Scopes delegations for AI agent task coordination in Mandala.
///
///         A coordinator agent signs a delegation to a sub-agent with this enforcer,
///         restricting: which token, how much, which contracts, deadline, and taskId.
///         The sub-agent redeems the delegation to execute scoped on-chain actions.
///
/// @dev Terms encode a TaskAllowance struct set by the delegator (coordinator).
///      State is tracked per DelegationManager + delegationHash.
///      Works with MetaMask Delegation Framework v1.3.0+.
contract MandalaAllowanceEnforcer is CaveatEnforcer {

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Delegation scope for a single task
    /// @param token ERC20 token address (address(0) = ETH)
    /// @param maxAmount Maximum spend allowed under this delegation
    /// @param allowedTargets Contracts the sub-agent can call
    /// @param deadline Unix timestamp — delegation expires after this
    /// @param taskId Mandala task identifier (keccak256 of task address or criteria)
    struct TaskAllowance {
        address token;
        uint256 maxAmount;
        address[] allowedTargets;
        uint256 deadline;
        bytes32 taskId;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Amount spent per delegation (delegationManager => delegationHash => spent)
    mapping(address => mapping(bytes32 => uint256)) public spentMap;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event TaskSpend(
        bytes32 indexed taskId,
        bytes32 indexed delegationHash,
        address indexed redeemer,
        uint256 amount,
        uint256 totalSpent
    );

    event DelegationUsed(
        bytes32 indexed taskId,
        bytes32 indexed delegationHash,
        address target,
        address redeemer
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error TaskExpired();
    error InvalidTarget();
    error AllowanceExceeded();
    error NoTargetsSpecified();

    // -------------------------------------------------------------------------
    // Hooks
    // -------------------------------------------------------------------------

    /// @notice Validates delegation scope before each execution
    /// @dev msg.sender is always the DelegationManager
    function beforeHook(
        bytes calldata _terms,
        bytes calldata,
        ModeCode _mode,
        bytes calldata _executionCallData,
        bytes32 _delegationHash,
        address,
        address _redeemer
    ) public override onlySingleCallTypeMode(_mode) {
        TaskAllowance memory allowance = abi.decode(_terms, (TaskAllowance));

        // 1. Check deadline
        if (block.timestamp > allowance.deadline) revert TaskExpired();

        // 2. Must have at least one allowed target
        if (allowance.allowedTargets.length == 0) revert NoTargetsSpecified();

        // 3. Decode execution target from calldata
        //    ERC-7579 single execution: abi.encodePacked(target, value, callData)
        //    First 20 bytes = target address
        address target = address(bytes20(_executionCallData[:20]));

        // 4. Validate target is in allowed list
        bool targetAllowed = false;
        for (uint256 i = 0; i < allowance.allowedTargets.length; i++) {
            if (target == allowance.allowedTargets[i]) {
                targetAllowed = true;
                break;
            }
        }
        if (!targetAllowed) revert InvalidTarget();

        // 5. Track ERC20 spending if target is the token contract
        if (target == allowance.token && _executionCallData.length >= 20 + 32 + 68) {
            // Skip target (20) + value (32) to get calldata
            bytes calldata innerCallData = _executionCallData[52:];
            bytes4 selector = bytes4(innerCallData[:4]);

            // ERC20.transfer(to, amount) or ERC20.approve(spender, amount)
            if (selector == bytes4(0xa9059cbb) || selector == bytes4(0x095ea7b3)) {
                uint256 amount = uint256(bytes32(innerCallData[36:68]));
                uint256 newSpent = spentMap[msg.sender][_delegationHash] + amount;
                if (newSpent > allowance.maxAmount) revert AllowanceExceeded();
                spentMap[msg.sender][_delegationHash] = newSpent;
                emit TaskSpend(allowance.taskId, _delegationHash, _redeemer, amount, newSpent);
            }
        }

        // 6. Track native ETH value transfers
        if (allowance.token == address(0) && _executionCallData.length >= 52) {
            uint256 value = uint256(bytes32(_executionCallData[20:52]));
            if (value > 0) {
                uint256 newSpent = spentMap[msg.sender][_delegationHash] + value;
                if (newSpent > allowance.maxAmount) revert AllowanceExceeded();
                spentMap[msg.sender][_delegationHash] = newSpent;
                emit TaskSpend(allowance.taskId, _delegationHash, _redeemer, value, newSpent);
            }
        }

        emit DelegationUsed(allowance.taskId, _delegationHash, target, _redeemer);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Decode terms to inspect a delegation's allowance configuration
    function getTermsInfo(bytes calldata _terms) external pure returns (TaskAllowance memory) {
        return abi.decode(_terms, (TaskAllowance));
    }

    /// @notice Get remaining allowance for a delegation
    function remainingAllowance(
        address _delegationManager,
        bytes32 _delegationHash,
        bytes calldata _terms
    ) external view returns (uint256) {
        TaskAllowance memory allowance = abi.decode(_terms, (TaskAllowance));
        uint256 spent = spentMap[_delegationManager][_delegationHash];
        if (spent >= allowance.maxAmount) return 0;
        return allowance.maxAmount - spent;
    }

    /// @notice Check if a delegation has expired
    function isExpired(bytes calldata _terms) external view returns (bool) {
        TaskAllowance memory allowance = abi.decode(_terms, (TaskAllowance));
        return block.timestamp > allowance.deadline;
    }
}
