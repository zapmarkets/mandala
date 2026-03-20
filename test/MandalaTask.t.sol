// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { MandalaPolicy }        from "../src/MandalaPolicy.sol";
import { MandalaAgentRegistry } from "../src/MandalaAgentRegistry.sol";
import { MandalaTask }          from "../src/MandalaTask.sol";
import { MandalaFactory }       from "../src/MandalaFactory.sol";
import { IMandalaFactory }      from "../src/interfaces/IMandalaFactory.sol";
import { IMandalaAgentRegistry } from "../src/interfaces/IMandalaAgentRegistry.sol";
import { TaskLib }              from "../src/libraries/TaskLib.sol";

contract MandalaTaskTest is Test {

    MandalaPolicy        pol;
    MandalaAgentRegistry registry;
    MandalaTask          taskImpl;
    MandalaFactory       factory;

    address admin     = makeAddr("admin");
    address treasury  = makeAddr("treasury");
    address human     = makeAddr("human");

    // agents
    address coordinator = makeAddr("coordinator");
    address agentA      = makeAddr("agentA");
    address agentB      = makeAddr("agentB");
    address agentC      = makeAddr("agentC");
    address verifier    = makeAddr("verifier");

    uint256 constant REWARD       = 0.05 ether;
    uint256 constant STAKE        = 0.001 ether;
    uint256 constant GATE_THRESH  = 0.1 ether;

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
            100 // 1% fee
        );

        // grant factory manager role on registry
        registry.grantRole(keccak256("MANAGER_ROLE"), address(factory));

        // add human
        pol.addHuman(human);

        vm.stopPrank();

        // fund accounts
        vm.deal(coordinator, 10 ether);
        vm.deal(agentA,      1 ether);
        vm.deal(agentB,      1 ether);
        vm.deal(agentC,      1 ether);

        // register agents
        vm.prank(coordinator); registry.register(keccak256("coord-8004"),  "ipfs://coord");
        vm.prank(agentA);      registry.register(keccak256("agentA-8004"), "ipfs://agentA");
        vm.prank(agentB);      registry.register(keccak256("agentB-8004"), "ipfs://agentB");
        vm.prank(agentC);      registry.register(keccak256("agentC-8004"), "ipfs://agentC");
        vm.prank(verifier);    registry.register(keccak256("verifier-8004"), "ipfs://verifier");
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _deployTask() internal returns (address taskAddr) {
        IMandalaFactory.DeployParams memory p = IMandalaFactory.DeployParams({
            verifier:         verifier,
            token:            address(0),
            stakeRequired:    STAKE,
            deadline:         block.timestamp + 1 days,
            disputeWindow:    1 hours,
            criteriaHash:     keccak256("write a solidity ERC20"),
            criteriaURI:      "ipfs://criteria",
            humanGateEnabled: false
        });

        vm.prank(coordinator);
        taskAddr = factory.deployTask{value: REWARD}(p);
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    function test_deployTask() public {
        address t = _deployTask();
        assertTrue(t != address(0));
        assertEq(factory.taskCount(), 1);

        TaskLib.TaskConfig memory cfg = MandalaTask(payable(t)).getConfig();
        assertEq(cfg.coordinator, coordinator);
        assertEq(uint256(cfg.status), uint256(TaskLib.TaskStatus.Open));
        // reward = 0.05 ETH minus 1% fee = 0.0495 ETH
        assertEq(cfg.reward, REWARD - (REWARD * 100 / 10_000));
    }

    function test_multipleAgentsSubmit() public {
        address t = _deployTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("proofA"), "ipfs://proofA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("proofB"), "ipfs://proofB");
        vm.prank(agentC); task.submitProof{value: STAKE}(keccak256("proofC"), "ipfs://proofC");

        assertEq(task.submissionCount(), 3);
    }

    function test_verifierSelectsWinner() public {
        address t = _deployTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("proofA"), "ipfs://proofA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("proofB"), "ipfs://proofB");

        vm.prank(verifier); task.selectWinner(agentB);

        assertEq(task.pendingWinner(), agentB);
        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Verifying));
    }

    function test_finalizeAfterDisputeWindow() public {
        address t = _deployTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("proofA"), "ipfs://proofA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("proofB"), "ipfs://proofB");

        vm.prank(verifier); task.selectWinner(agentA);

        // fast forward past dispute window
        vm.warp(block.timestamp + 2 hours);

        uint256 agentABefore = agentA.balance;
        task.finalize();

        // agentA should receive reward + their stake back, agentB gets stake back too
        assertGt(agentA.balance, agentABefore);
        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Finalized));
    }

    function test_disputeAndHumanResolves() public {
        address t = _deployTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("proofA"), "ipfs://proofA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("proofB"), "ipfs://proofB");

        vm.prank(verifier); task.selectWinner(agentA);

        // agentB disputes
        vm.prank(agentB); task.dispute(agentA, "agentA's proof is incomplete");

        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Disputed));

        // human resolves in favor of agentB
        vm.prank(human); task.resolveDispute(agentB);

        // now dispute window restarts, warp and finalize
        vm.warp(block.timestamp + 2 hours);
        task.finalize();

        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Finalized));
    }

    function test_cannotSubmitAfterDeadline() public {
        address t = _deployTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.warp(block.timestamp + 2 days);

        vm.prank(agentA);
        vm.expectRevert(TaskLib.TaskExpired.selector);
        task.submitProof{value: STAKE}(keccak256("proofA"), "ipfs://proofA");
    }

    function test_cannotSubmitTwice() public {
        address t = _deployTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.startPrank(agentA);
        task.submitProof{value: STAKE}(keccak256("proofA"), "ipfs://proofA");
        vm.expectRevert(TaskLib.AlreadySubmitted.selector);
        task.submitProof{value: STAKE}(keccak256("proofA2"), "ipfs://proofA2");
        vm.stopPrank();
    }

    function test_coordinatorCancelsWithNoSubmissions() public {
        address t = _deployTask();
        MandalaTask task = MandalaTask(payable(t));

        uint256 before = coordinator.balance;
        vm.prank(coordinator); task.cancel();

        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Cancelled));
        assertGt(coordinator.balance, before);
    }

    function test_reputationTracked() public {
        address t = _deployTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("proofA"), "ipfs://proofA");
        vm.prank(verifier); task.selectWinner(agentA);
        vm.warp(block.timestamp + 2 hours);
        task.finalize();

        TaskLib.AgentInfo memory info = registry.getAgent(agentA);
        assertEq(info.wins, 1);
    }
}
