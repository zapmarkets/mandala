// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";
import { MandalaAllowanceEnforcer } from "../src/MandalaAllowanceEnforcer.sol";
import { ModeCode } from "@delegation-framework/utils/Types.sol";

contract MandalaAllowanceEnforcerTest is Test {
    MandalaAllowanceEnforcer enforcer;

    // Single default mode: callType=0x00, execType=0x00 => all zeros
    ModeCode constant SINGLE_DEFAULT_MODE = ModeCode.wrap(bytes32(0));

    // Test addresses
    address constant DELEGATOR = address(0xD1);
    address constant REDEEMER = address(0x2222);
    address constant TOKEN = address(0x3333);
    address constant TARGET_A = address(0xA1);
    address constant TARGET_B = address(0xB1);
    address constant TARGET_C = address(0xC1);

    bytes32 constant TASK_ID = keccak256("test-task-1");
    bytes32 constant DELEGATION_HASH = keccak256("delegation-1");
    bytes32 constant DELEGATION_HASH_2 = keccak256("delegation-2");

    function setUp() public {
        enforcer = new MandalaAllowanceEnforcer();
        // Set block.timestamp to something reasonable
        vm.warp(1000);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _makeTerms(
        address token,
        uint256 maxAmount,
        address[] memory targets,
        uint256 deadline,
        bytes32 taskId
    ) internal pure returns (bytes memory) {
        MandalaAllowanceEnforcer.TaskAllowance memory allowance = MandalaAllowanceEnforcer.TaskAllowance({
            token: token,
            maxAmount: maxAmount,
            allowedTargets: targets,
            deadline: deadline,
            taskId: taskId
        });
        return abi.encode(allowance);
    }

    function _singleTarget(address t) internal pure returns (address[] memory) {
        address[] memory targets = new address[](1);
        targets[0] = t;
        return targets;
    }

    function _twoTargets(address a, address b) internal pure returns (address[] memory) {
        address[] memory targets = new address[](2);
        targets[0] = a;
        targets[1] = b;
        return targets;
    }

    /// @dev Build ERC-7579 packed execution calldata: target(20) + value(32) + callData
    function _packExecution(address target, uint256 value, bytes memory callData) internal pure returns (bytes memory) {
        return abi.encodePacked(target, value, callData);
    }

    /// @dev ERC20 transfer(to, amount) calldata
    function _transferCallData(address to, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(bytes4(0xa9059cbb), to, amount);
    }

    /// @dev ERC20 approve(spender, amount) calldata
    function _approveCallData(address spender, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(bytes4(0x095ea7b3), spender, amount);
    }

    function _callBeforeHook(
        bytes memory terms,
        bytes memory execCallData,
        bytes32 delegationHash
    ) internal {
        enforcer.beforeHook(
            terms,
            "",                    // _args (unused)
            SINGLE_DEFAULT_MODE,
            execCallData,
            delegationHash,
            DELEGATOR,
            REDEEMER
        );
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    function test_beforeHook_validERC20Transfer() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 2000, TASK_ID);
        bytes memory execCallData = _packExecution(TOKEN, 0, _transferCallData(address(0x99), 500));

        _callBeforeHook(terms, execCallData, DELEGATION_HASH);

        // Spent should be 500
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 500);
    }

    function test_beforeHook_revertsTaskExpired() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 500, TASK_ID);
        bytes memory execCallData = _packExecution(TOKEN, 0, _transferCallData(address(0x99), 100));

        // block.timestamp is 1000, deadline is 500 => expired
        vm.expectRevert(MandalaAllowanceEnforcer.TaskExpired.selector);
        _callBeforeHook(terms, execCallData, DELEGATION_HASH);
    }

    function test_beforeHook_revertsInvalidTarget() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TARGET_A), 2000, TASK_ID);
        // Execute against TARGET_B which is not in allowedTargets
        bytes memory execCallData = _packExecution(TARGET_B, 0, "");

        vm.expectRevert(MandalaAllowanceEnforcer.InvalidTarget.selector);
        _callBeforeHook(terms, execCallData, DELEGATION_HASH);
    }

    function test_beforeHook_revertsAllowanceExceeded() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 2000, TASK_ID);
        bytes memory execCallData = _packExecution(TOKEN, 0, _transferCallData(address(0x99), 1001));

        vm.expectRevert(MandalaAllowanceEnforcer.AllowanceExceeded.selector);
        _callBeforeHook(terms, execCallData, DELEGATION_HASH);
    }

    function test_beforeHook_revertsNoTargetsSpecified() public {
        address[] memory empty = new address[](0);
        bytes memory terms = _makeTerms(TOKEN, 1000, empty, 2000, TASK_ID);
        bytes memory execCallData = _packExecution(TOKEN, 0, _transferCallData(address(0x99), 100));

        vm.expectRevert(MandalaAllowanceEnforcer.NoTargetsSpecified.selector);
        _callBeforeHook(terms, execCallData, DELEGATION_HASH);
    }

    function test_beforeHook_ethValueTracking() public {
        // ETH mode: token = address(0), target is some contract
        bytes memory terms = _makeTerms(address(0), 1 ether, _singleTarget(TARGET_A), 2000, TASK_ID);
        bytes memory execCallData = _packExecution(TARGET_A, 0.5 ether, "");

        _callBeforeHook(terms, execCallData, DELEGATION_HASH);

        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 0.5 ether);
    }

    function test_beforeHook_ethValueExceedsAllowance() public {
        bytes memory terms = _makeTerms(address(0), 1 ether, _singleTarget(TARGET_A), 2000, TASK_ID);
        bytes memory execCallData = _packExecution(TARGET_A, 1.5 ether, "");

        vm.expectRevert(MandalaAllowanceEnforcer.AllowanceExceeded.selector);
        _callBeforeHook(terms, execCallData, DELEGATION_HASH);
    }

    function test_beforeHook_multipleCallsAccumulateSpending() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 2000, TASK_ID);

        // First call: spend 400
        _callBeforeHook(terms, _packExecution(TOKEN, 0, _transferCallData(address(0x99), 400)), DELEGATION_HASH);
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 400);

        // Second call: spend 400 (total 800)
        _callBeforeHook(terms, _packExecution(TOKEN, 0, _transferCallData(address(0x99), 400)), DELEGATION_HASH);
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 800);

        // Third call: spend 201 would exceed 1000
        vm.expectRevert(MandalaAllowanceEnforcer.AllowanceExceeded.selector);
        _callBeforeHook(terms, _packExecution(TOKEN, 0, _transferCallData(address(0x99), 201)), DELEGATION_HASH);

        // Third call: spend exactly 200 (total 1000) should work
        _callBeforeHook(terms, _packExecution(TOKEN, 0, _transferCallData(address(0x99), 200)), DELEGATION_HASH);
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 1000);
    }

    function test_beforeHook_independentDelegationHashes() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 2000, TASK_ID);

        // Spend against delegation 1
        _callBeforeHook(terms, _packExecution(TOKEN, 0, _transferCallData(address(0x99), 600)), DELEGATION_HASH);
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 600);

        // Spend against delegation 2 - should be independent
        _callBeforeHook(terms, _packExecution(TOKEN, 0, _transferCallData(address(0x99), 800)), DELEGATION_HASH_2);
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH_2), 800);

        // Delegation 1 still at 600
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 600);
    }

    function test_beforeHook_multipleAllowedTargets() public {
        bytes memory terms = _makeTerms(address(0), 10 ether, _twoTargets(TARGET_A, TARGET_B), 2000, TASK_ID);

        // Both targets should work
        _callBeforeHook(terms, _packExecution(TARGET_A, 1 ether, ""), DELEGATION_HASH);
        _callBeforeHook(terms, _packExecution(TARGET_B, 2 ether, ""), DELEGATION_HASH);

        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 3 ether);

        // TARGET_C should fail
        vm.expectRevert(MandalaAllowanceEnforcer.InvalidTarget.selector);
        _callBeforeHook(terms, _packExecution(TARGET_C, 1 ether, ""), DELEGATION_HASH);
    }

    function test_beforeHook_deadlineEdgeCase() public {
        // deadline = 1000, block.timestamp = 1000 => NOT expired (check is >)
        bytes memory terms = _makeTerms(address(0), 1 ether, _singleTarget(TARGET_A), 1000, TASK_ID);
        bytes memory execCallData = _packExecution(TARGET_A, 0.1 ether, "");

        // Should succeed at timestamp == deadline
        _callBeforeHook(terms, execCallData, DELEGATION_HASH);

        // Advance past deadline
        vm.warp(1001);
        vm.expectRevert(MandalaAllowanceEnforcer.TaskExpired.selector);
        _callBeforeHook(terms, execCallData, DELEGATION_HASH);
    }

    function test_beforeHook_approveAlsoTracked() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 2000, TASK_ID);
        bytes memory execCallData = _packExecution(TOKEN, 0, _approveCallData(address(0x99), 750));

        _callBeforeHook(terms, execCallData, DELEGATION_HASH);
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 750);
    }

    function test_getTermsInfo() public {
        address[] memory targets = _twoTargets(TARGET_A, TARGET_B);
        bytes memory terms = _makeTerms(TOKEN, 5000, targets, 9999, TASK_ID);

        MandalaAllowanceEnforcer.TaskAllowance memory info = enforcer.getTermsInfo(terms);
        assertEq(info.token, TOKEN);
        assertEq(info.maxAmount, 5000);
        assertEq(info.allowedTargets.length, 2);
        assertEq(info.allowedTargets[0], TARGET_A);
        assertEq(info.allowedTargets[1], TARGET_B);
        assertEq(info.deadline, 9999);
        assertEq(info.taskId, TASK_ID);
    }

    function test_remainingAllowance() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 2000, TASK_ID);

        // Initially full
        assertEq(enforcer.remainingAllowance(address(this), DELEGATION_HASH, terms), 1000);

        // Spend 300
        _callBeforeHook(terms, _packExecution(TOKEN, 0, _transferCallData(address(0x99), 300)), DELEGATION_HASH);
        assertEq(enforcer.remainingAllowance(address(this), DELEGATION_HASH, terms), 700);

        // Spend 700 more
        _callBeforeHook(terms, _packExecution(TOKEN, 0, _transferCallData(address(0x99), 700)), DELEGATION_HASH);
        assertEq(enforcer.remainingAllowance(address(this), DELEGATION_HASH, terms), 0);
    }

    function test_isExpired() public {
        bytes memory termsNotExpired = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 2000, TASK_ID);
        bytes memory termsExpired = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 500, TASK_ID);

        // block.timestamp = 1000
        assertFalse(enforcer.isExpired(termsNotExpired)); // deadline 2000 > 1000
        assertTrue(enforcer.isExpired(termsExpired));      // deadline 500 < 1000

        // Advance time
        vm.warp(2001);
        assertTrue(enforcer.isExpired(termsNotExpired));   // deadline 2000 < 2001
    }

    function test_beforeHook_emitsEvents() public {
        bytes memory terms = _makeTerms(TOKEN, 1000, _singleTarget(TOKEN), 2000, TASK_ID);
        bytes memory execCallData = _packExecution(TOKEN, 0, _transferCallData(address(0x99), 250));

        vm.expectEmit(true, true, true, true);
        emit MandalaAllowanceEnforcer.TaskSpend(TASK_ID, DELEGATION_HASH, REDEEMER, 250, 250);

        vm.expectEmit(true, true, false, true);
        emit MandalaAllowanceEnforcer.DelegationUsed(TASK_ID, DELEGATION_HASH, TOKEN, REDEEMER);

        _callBeforeHook(terms, execCallData, DELEGATION_HASH);
    }

    function test_beforeHook_nonTokenTargetNoSpendingTracked() public {
        // Token is TOKEN, but target is TARGET_A (not the token) — no ERC20 spending tracked
        bytes memory terms = _makeTerms(TOKEN, 1000, _twoTargets(TOKEN, TARGET_A), 2000, TASK_ID);
        bytes memory execCallData = _packExecution(TARGET_A, 0, abi.encodeWithSelector(bytes4(0xdeadbeef)));

        _callBeforeHook(terms, execCallData, DELEGATION_HASH);

        // No spending tracked since target != token
        assertEq(enforcer.spentMap(address(this), DELEGATION_HASH), 0);
    }
}
