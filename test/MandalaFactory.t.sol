// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { MandalaPolicy }        from "../src/MandalaPolicy.sol";
import { MandalaAgentRegistry } from "../src/MandalaAgentRegistry.sol";
import { MandalaTask }          from "../src/MandalaTask.sol";
import { MandalaFactory }       from "../src/MandalaFactory.sol";
import { IMandalaFactory }      from "../src/interfaces/IMandalaFactory.sol";
import { TaskLib }              from "../src/libraries/TaskLib.sol";

contract MandalaFactoryTest is Test {

    MandalaPolicy        pol;
    MandalaAgentRegistry registry;
    MandalaTask          taskImpl;
    MandalaFactory       factory;

    address admin       = makeAddr("admin");
    address treasury    = makeAddr("treasury");
    address human       = makeAddr("human");
    address coordinator = makeAddr("coordinator");
    address nobody      = makeAddr("nobody");
    address verifier    = makeAddr("verifier");

    uint256 constant REWARD      = 0.05 ether;
    uint256 constant STAKE       = 0.001 ether;
    uint256 constant GATE_THRESH = 0.1 ether;
    uint256 constant FEE_BPS     = 100; // 1%

    function setUp() public {
        vm.startPrank(admin);

        pol      = new MandalaPolicy(admin, GATE_THRESH, STAKE);
        registry = new MandalaAgentRegistry(admin, address(pol));
        taskImpl = new MandalaTask();
        factory  = new MandalaFactory(
            admin,
            address(taskImpl),
            address(registry),
            address(pol),
            treasury,
            FEE_BPS
        );

        registry.grantRole(keccak256("MANAGER_ROLE"), address(factory));
        pol.addHuman(human);

        vm.stopPrank();

        vm.deal(coordinator, 10 ether);

        vm.prank(coordinator);
        registry.register(keccak256("coord-8004"), "ipfs://coord");
    }

    function _defaultParams() internal view returns (IMandalaFactory.DeployParams memory) {
        return IMandalaFactory.DeployParams({
            verifier:         verifier,
            token:            address(0),
            stakeRequired:    STAKE,
            deadline:         block.timestamp + 1 days,
            disputeWindow:    1 hours,
            criteriaHash:     keccak256("criteria"),
            criteriaURI:      "ipfs://criteria",
            humanGateEnabled: false
        });
    }

    // -------------------------------------------------------------------------
    // Constructor validation
    // -------------------------------------------------------------------------

    function test_constructorRevertsZeroAdmin() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaFactory(address(0), address(taskImpl), address(registry), address(pol), treasury, FEE_BPS);
    }

    function test_constructorRevertsZeroTaskImpl() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaFactory(admin, address(0), address(registry), address(pol), treasury, FEE_BPS);
    }

    function test_constructorRevertsZeroRegistry() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaFactory(admin, address(taskImpl), address(0), address(pol), treasury, FEE_BPS);
    }

    function test_constructorRevertsZeroPolicy() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaFactory(admin, address(taskImpl), address(registry), address(0), treasury, FEE_BPS);
    }

    function test_constructorRevertsZeroTreasury() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaFactory(admin, address(taskImpl), address(registry), address(pol), address(0), FEE_BPS);
    }

    function test_constructorRevertsFeeTooHigh() public {
        vm.expectRevert(TaskLib.InvalidThreshold.selector);
        new MandalaFactory(admin, address(taskImpl), address(registry), address(pol), treasury, 1001);
    }

    // -------------------------------------------------------------------------
    // deployTask success
    // -------------------------------------------------------------------------

    function test_deployTask_success() public {
        IMandalaFactory.DeployParams memory p = _defaultParams();

        uint256 treasuryBefore = treasury.balance;

        vm.prank(coordinator);
        address t = factory.deployTask{value: REWARD}(p);

        assertTrue(t != address(0));
        assertEq(factory.taskCount(), 1);

        uint256 fee = REWARD * FEE_BPS / 10_000;
        assertEq(treasury.balance - treasuryBefore, fee);

        TaskLib.TaskConfig memory cfg = MandalaTask(payable(t)).getConfig();
        assertEq(cfg.coordinator, coordinator);
        assertEq(cfg.reward, REWARD - fee);
        assertEq(uint256(cfg.status), uint256(TaskLib.TaskStatus.Open));
    }

    function test_deployTask_feeCalculation() public {
        IMandalaFactory.DeployParams memory p = _defaultParams();
        uint256 expectedFee = REWARD * FEE_BPS / 10_000; // 0.05 * 100 / 10000 = 0.0005
        uint256 expectedNet = REWARD - expectedFee;

        uint256 treasuryBefore = treasury.balance;

        vm.prank(coordinator);
        address t = factory.deployTask{value: REWARD}(p);

        assertEq(treasury.balance - treasuryBefore, expectedFee);
        assertEq(MandalaTask(payable(t)).getConfig().reward, expectedNet);
    }

    // -------------------------------------------------------------------------
    // deployTask reverts
    // -------------------------------------------------------------------------

    function test_deployTask_revert_paused() public {
        vm.prank(admin);
        pol.pause();

        IMandalaFactory.DeployParams memory p = _defaultParams();
        vm.prank(coordinator);
        vm.expectRevert(TaskLib.PolicyPaused.selector);
        factory.deployTask{value: REWARD}(p);
    }

    function test_deployTask_revert_unregistered() public {
        IMandalaFactory.DeployParams memory p = _defaultParams();
        vm.deal(nobody, 1 ether);
        vm.prank(nobody);
        vm.expectRevert(TaskLib.AgentNotRegistered.selector);
        factory.deployTask{value: REWARD}(p);
    }

    function test_deployTask_revert_suspended() public {
        vm.prank(admin);
        registry.grantRole(keccak256("HUMAN_ROLE"), admin);
        vm.prank(admin);
        registry.suspend(coordinator);

        IMandalaFactory.DeployParams memory p = _defaultParams();
        vm.prank(coordinator);
        vm.expectRevert(TaskLib.AgentSuspended.selector);
        factory.deployTask{value: REWARD}(p);
    }

    function test_deployTask_revert_zeroReward() public {
        IMandalaFactory.DeployParams memory p = _defaultParams();
        vm.prank(coordinator);
        vm.expectRevert(TaskLib.InsufficientReward.selector);
        factory.deployTask{value: 0}(p);
    }

    function test_deployTask_revert_pastDeadline() public {
        IMandalaFactory.DeployParams memory p = _defaultParams();
        p.deadline = block.timestamp - 1;
        vm.prank(coordinator);
        vm.expectRevert(TaskLib.TaskExpired.selector);
        factory.deployTask{value: REWARD}(p);
    }

    // -------------------------------------------------------------------------
    // setProtocolFee
    // -------------------------------------------------------------------------

    function test_setProtocolFee() public {
        vm.prank(admin); // admin has HUMAN_ROLE
        factory.setProtocolFee(500);
        assertEq(factory.protocolFeeBps(), 500);
    }

    function test_setProtocolFee_revert_tooHigh() public {
        vm.prank(admin);
        vm.expectRevert(TaskLib.InvalidThreshold.selector);
        factory.setProtocolFee(1001);
    }

    function test_setProtocolFee_revert_nonHuman() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        factory.setProtocolFee(200);
    }

    // -------------------------------------------------------------------------
    // setTreasury
    // -------------------------------------------------------------------------

    function test_setTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(admin);
        factory.setTreasury(newTreasury);
        assertEq(factory.treasury(), newTreasury);
    }

    function test_setTreasury_revert_zero() public {
        vm.prank(admin);
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        factory.setTreasury(address(0));
    }

    function test_setTreasury_revert_nonHuman() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        factory.setTreasury(makeAddr("x"));
    }

    // -------------------------------------------------------------------------
    // Views: allTasks, tasksByCoordinator, taskCount
    // -------------------------------------------------------------------------

    function test_views_multipleTasks() public {
        IMandalaFactory.DeployParams memory p = _defaultParams();

        vm.prank(coordinator);
        address t1 = factory.deployTask{value: REWARD}(p);
        vm.prank(coordinator);
        address t2 = factory.deployTask{value: REWARD}(p);
        vm.prank(coordinator);
        address t3 = factory.deployTask{value: REWARD}(p);

        assertEq(factory.taskCount(), 3);

        address[] memory all = factory.allTasks();
        assertEq(all.length, 3);
        assertEq(all[0], t1);
        assertEq(all[1], t2);
        assertEq(all[2], t3);

        address[] memory byCoord = factory.tasksByCoordinator(coordinator);
        assertEq(byCoord.length, 3);
    }

    function test_tasksByCoordinator_differentCoordinators() public {
        address coord2 = makeAddr("coord2");
        vm.deal(coord2, 10 ether);
        vm.prank(coord2);
        registry.register(keccak256("coord2-8004"), "ipfs://coord2");

        IMandalaFactory.DeployParams memory p = _defaultParams();

        vm.prank(coordinator);
        factory.deployTask{value: REWARD}(p);

        vm.prank(coord2);
        factory.deployTask{value: REWARD}(p);

        assertEq(factory.tasksByCoordinator(coordinator).length, 1);
        assertEq(factory.tasksByCoordinator(coord2).length, 1);
        assertEq(factory.taskCount(), 2);
    }
}
