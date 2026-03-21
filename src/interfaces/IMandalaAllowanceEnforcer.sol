// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { MandalaAllowanceEnforcer } from "../MandalaAllowanceEnforcer.sol";

interface IMandalaAllowanceEnforcer {

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

    error TaskExpired();
    error InvalidTarget();
    error AllowanceExceeded();
    error NoTargetsSpecified();

    function spentMap(address delegationManager, bytes32 delegationHash) external view returns (uint256);
    function getTermsInfo(bytes calldata _terms) external pure returns (MandalaAllowanceEnforcer.TaskAllowance memory);
    function remainingAllowance(address _delegationManager, bytes32 _delegationHash, bytes calldata _terms) external view returns (uint256);
    function isExpired(bytes calldata _terms) external view returns (bool);
}
