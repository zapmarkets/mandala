// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { MandalaPolicy }        from "../src/MandalaPolicy.sol";
import { MandalaAgentRegistry } from "../src/MandalaAgentRegistry.sol";
import { MandalaTask }          from "../src/MandalaTask.sol";
import { MandalaFactory }       from "../src/MandalaFactory.sol";
import { IMandalaFactory }      from "../src/interfaces/IMandalaFactory.sol";
import { IMandalaTask }         from "../src/interfaces/IMandalaTask.sol";
import { TaskLib }              from "../src/libraries/TaskLib.sol";

// =============================================================================
//  Mandala Protocol — Integration Test Suite
// =============================================================================
//
//  This file serves as both a comprehensive test AND living documentation of
//  the Mandala protocol lifecycle. Each test walks through a complete scenario
//  end-to-end, exercising all contracts in concert.
//
//  Architecture:
//    MandalaPolicy        — global rules: pause, blacklist, treasury, human gate
//    MandalaAgentRegistry — ERC-8004 agent identities + on-chain reputation
//    MandalaFactory       — deploys MandalaTask clones (EIP-1167), charges fee
//    MandalaTask          — one task = one contract, full lifecycle state machine
//
//  Task Lifecycle:
//    1. Coordinator deploys task via Factory (reward locked in escrow)
//    2. Registered agents submit proofs with stakes
//    3. After deadline, verifier selects the best submission
//    4. Dispute window opens — anyone can challenge the decision
//    5. If no dispute, anyone finalizes → winner gets reward + stake back
//    6. If disputed, a human resolves → new winner or cancellation
//
// =============================================================================

contract MandalaIntegrationTest is Test {

    // =========================================================================
    //  Contracts
    // =========================================================================

    MandalaPolicy        policy;
    MandalaAgentRegistry registry;
    MandalaTask          taskImpl;       // implementation (never called directly)
    MandalaFactory       factory;

    // =========================================================================
    //  Actors
    // =========================================================================

    address admin       = makeAddr("admin");        // protocol admin
    address treasury    = makeAddr("treasury");     // fee collector
    address human       = makeAddr("human");        // human overseer (dispute resolver)
    address coordinator = makeAddr("coordinator");  // task creator
    address verifier    = makeAddr("verifier");     // picks the winner
    address agent1      = makeAddr("agent1");       // AI agent #1
    address agent2      = makeAddr("agent2");       // AI agent #2
    address agent3      = makeAddr("agent3");       // AI agent #3

    // =========================================================================
    //  Constants
    // =========================================================================

    uint256 constant REWARD          = 0.05 ether;   // task reward
    uint256 constant STAKE           = 0.001 ether;  // required per submission
    uint256 constant GATE_THRESHOLD  = 1 ether;      // human gate kicks in above this
    uint256 constant FEE_BPS         = 100;           // 1% protocol fee
    uint256 constant DISPUTE_WINDOW  = 1 hours;       // time to dispute after winner pick
    uint256 constant DEADLINE_OFFSET = 1 days;        // task open for 1 day

    // =========================================================================
    //  setUp — deploy the full protocol stack
    // =========================================================================

    function setUp() public {
        // --- Step 1: Deploy core contracts as admin ---
        vm.startPrank(admin);

        // Policy: global rules — human gate at 1 ETH, min stake 0.001 ETH
        policy = new MandalaPolicy(admin, GATE_THRESHOLD, STAKE, treasury);

        // Registry: agent identities & reputation, references policy for blacklist
        registry = new MandalaAgentRegistry(admin, address(policy));

        // Task implementation: never called directly, used as EIP-1167 template
        taskImpl = new MandalaTask();

        // Factory: deploys task clones, charges 1% protocol fee
        factory = new MandalaFactory(
            admin,
            address(taskImpl),
            address(registry),
            address(policy),
            treasury,
            FEE_BPS
        );

        // --- Step 2: Wire permissions ---
        // Factory needs MANAGER_ROLE on registry to grant TASK_CONTRACT_ROLE to new tasks
        registry.grantRole(keccak256("MANAGER_ROLE"), address(factory));

        // Human overseer gets HUMAN_ROLE on policy (for dispute resolution + finalize)
        policy.addHuman(human);

        vm.stopPrank();

        // --- Step 3: Fund all actors with ETH ---
        vm.deal(coordinator, 10 ether);
        vm.deal(verifier,    10 ether);
        vm.deal(agent1,      10 ether);
        vm.deal(agent2,      10 ether);
        vm.deal(agent3,      10 ether);

        // --- Step 4: Register all agents in the registry ---
        // Everyone who interacts with tasks must be registered (coordinator too!)
        vm.prank(coordinator);
        registry.register(keccak256("coord-8004"), "ipfs://coordinator-meta");

        vm.prank(verifier);
        registry.register(keccak256("verifier-8004"), "ipfs://verifier-meta");

        vm.prank(agent1);
        registry.register(keccak256("agent1-8004"), "ipfs://agent1-meta");

        vm.prank(agent2);
        registry.register(keccak256("agent2-8004"), "ipfs://agent2-meta");

        vm.prank(agent3);
        registry.register(keccak256("agent3-8004"), "ipfs://agent3-meta");
    }

    // =========================================================================
    //  Helper: create default deploy params
    // =========================================================================

    function _defaultParams() internal view returns (IMandalaFactory.DeployParams memory) {
        return IMandalaFactory.DeployParams({
            verifier:         verifier,
            token:            address(0),          // ETH task
            stakeRequired:    STAKE,
            deadline:         block.timestamp + DEADLINE_OFFSET,
            disputeWindow:    DISPUTE_WINDOW,
            criteriaHash:     keccak256("Write a Solidity contract for X"),
            criteriaURI:      "ipfs://QmCriteria123",
            humanGateEnabled: false,                // no human gate (reward < threshold)
            reward:           0                     // ignored for ETH tasks (msg.value used)
        });
    }

    // =========================================================================
    //  Helper: deploy a task and return the MandalaTask instance
    // =========================================================================

    function _deployTask() internal returns (MandalaTask) {
        IMandalaFactory.DeployParams memory params = _defaultParams();
        vm.prank(coordinator);
        address taskAddr = factory.deployTask{value: REWARD}(params);
        return MandalaTask(payable(taskAddr));
    }

    // =========================================================================
    //  TEST 1: Full Lifecycle — Happy Path
    // =========================================================================
    //
    //  Flow: deploy → 2 agents submit → deadline passes → verifier picks winner
    //        → dispute window expires → finalize → check balances & reputation
    //

    function test_fullLifecycle_happyPath() public {
        // ---- Phase 1: Deploy task ----
        // Coordinator locks 0.05 ETH as reward. Factory takes 1% fee = 0.0005 ETH.
        // Net reward in task = 0.0495 ETH.
        uint256 treasuryBefore = treasury.balance;
        MandalaTask task = _deployTask();

        // Verify factory state
        assertEq(factory.taskCount(), 1, "Factory should track 1 task");
        assertEq(
            factory.tasksByCoordinator(coordinator).length, 1,
            "Coordinator should have 1 task"
        );

        // Verify protocol fee was collected
        uint256 expectedFee = (REWARD * FEE_BPS) / 10_000; // 0.0005 ETH
        assertEq(
            treasury.balance - treasuryBefore, expectedFee,
            "Treasury should have collected the 1% fee"
        );

        // Verify task config
        TaskLib.TaskConfig memory cfg = task.getConfig();
        uint256 netReward = REWARD - expectedFee;
        assertEq(cfg.reward, netReward, "Task reward should be net of fee");
        assertEq(cfg.coordinator, coordinator, "Coordinator should match");
        assertEq(cfg.verifier, verifier, "Verifier should match");
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Open), "Task should be Open");

        // ---- Phase 2: Agents submit proofs ----
        // Agent1 submits with required stake
        vm.prank(agent1);
        task.submitProof{value: STAKE}(
            keccak256("agent1-proof-hash"),
            "ipfs://agent1-evidence"
        );

        // Agent2 submits with required stake
        vm.prank(agent2);
        task.submitProof{value: STAKE}(
            keccak256("agent2-proof-hash"),
            "ipfs://agent2-evidence"
        );

        // Verify submissions are recorded
        assertEq(task.submissionCount(), 2, "Should have 2 submissions");

        // Check agent1 submission details
        TaskLib.Submission memory sub1 = task.getSubmission(agent1);
        assertEq(sub1.agent, agent1, "Submission agent should match");
        assertEq(sub1.proofHash, keccak256("agent1-proof-hash"), "Proof hash should match");
        assertEq(sub1.stake, STAKE, "Stake should match");
        assertFalse(sub1.disqualified, "Should not be disqualified");

        // Check registry recorded participation
        TaskLib.AgentInfo memory info1 = registry.getAgent(agent1);
        assertEq(info1.totalTasks, 1, "Agent1 should have 1 task participation");

        TaskLib.AgentInfo memory info2 = registry.getAgent(agent2);
        assertEq(info2.totalTasks, 1, "Agent2 should have 1 task participation");

        // ---- Phase 3: Deadline passes, verifier selects winner ----
        // Fast-forward past the deadline
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        // Verifier reviews submissions and picks agent1 as winner
        vm.prank(verifier);
        task.selectWinner(agent1);

        // Task moves to Verifying state
        cfg = task.getConfig();
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Verifying), "Should be Verifying");
        assertEq(task.pendingWinner(), agent1, "Pending winner should be agent1");

        // ---- Phase 4: Dispute window expires without dispute ----
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        // ---- Phase 5: Finalize — anyone can call ----
        // Record balances before finalization
        uint256 agent1Before = agent1.balance;
        uint256 agent2Before = agent2.balance;

        // Agent3 (random bystander) triggers finalization — permissionless!
        vm.prank(agent3);
        task.finalize();

        // Verify final state
        cfg = task.getConfig();
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Finalized), "Should be Finalized");

        // Winner (agent1) gets: net reward + their own stake back
        uint256 expectedPayout = netReward + STAKE;
        assertEq(
            agent1.balance - agent1Before, expectedPayout,
            "Winner should receive reward + stake"
        );

        // Loser (agent2) gets their stake back
        assertEq(
            agent2.balance - agent2Before, STAKE,
            "Loser should get stake refunded"
        );

        // ---- Phase 6: Verify reputation updates ----
        info1 = registry.getAgent(agent1);
        assertEq(info1.wins, 1, "Agent1 should have 1 win");
        assertEq(registry.reputationScore(agent1), 100, "Agent1 rep should be 100 (1/1 * 100)");

        info2 = registry.getAgent(agent2);
        assertEq(info2.wins, 0, "Agent2 should have 0 wins");
        assertEq(registry.reputationScore(agent2), 0, "Agent2 rep should be 0 (0/1 * 100)");

        console.log("=== HAPPY PATH COMPLETE ===");
        console.log("  Protocol fee collected:", expectedFee);
        console.log("  Winner payout:", expectedPayout);
        console.log("  Agent1 reputation:", registry.reputationScore(agent1));
    }

    // =========================================================================
    //  TEST 2: Dispute Flow — Human Resolves Dispute
    // =========================================================================
    //
    //  Flow: deploy → 2 submit → verifier picks agent1 → agent2 disputes
    //        → human resolves in favor of agent2 → dispute window → finalize
    //

    function test_disputeFlow() public {
        MandalaTask task = _deployTask();
        uint256 netReward = REWARD - (REWARD * FEE_BPS) / 10_000;

        // Agents submit proofs
        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("a1-proof"), "ipfs://a1");

        vm.prank(agent2);
        task.submitProof{value: STAKE}(keccak256("a2-proof"), "ipfs://a2");

        // Fast-forward past deadline
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        // Verifier selects agent1
        vm.prank(verifier);
        task.selectWinner(agent1);

        // ---- Agent2 disputes the decision ----
        vm.prank(agent2);
        task.dispute(agent1, "Agent1 plagiarized my solution!");

        // Task moves to Disputed state
        TaskLib.TaskConfig memory cfg = task.getConfig();
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Disputed), "Should be Disputed");
        assertEq(task.disputant(), agent2, "Disputant should be agent2");
        assertEq(task.disputedAgainst(), agent1, "Disputed against agent1");

        // Check that dispute was recorded in registry
        TaskLib.AgentInfo memory info1 = registry.getAgent(agent1);
        assertEq(info1.disputes, 1, "Agent1 should have 1 dispute against them");

        // ---- Human resolves dispute in favor of agent2 ----
        // Human reviews both submissions and decides agent2 was actually better
        vm.prank(human);
        task.resolveDispute(agent2);

        // Task moves back to Verifying with agent2 as new pending winner
        cfg = task.getConfig();
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Verifying), "Should be Verifying again");
        assertEq(task.pendingWinner(), agent2, "New pending winner should be agent2");

        // ---- New dispute window passes, finalize ----
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        uint256 agent2Before = agent2.balance;
        uint256 agent1Before = agent1.balance;

        vm.prank(human);
        task.finalize();

        cfg = task.getConfig();
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Finalized), "Should be Finalized");

        // Agent2 (new winner) gets reward + stake
        assertEq(
            agent2.balance - agent2Before, netReward + STAKE,
            "New winner (agent2) should get reward + stake"
        );

        // Agent1 (loser) gets stake refunded
        assertEq(
            agent1.balance - agent1Before, STAKE,
            "Loser (agent1) should get stake refunded"
        );

        // Verify reputation: agent2 gets the win
        assertEq(registry.getAgent(agent2).wins, 1, "Agent2 should have 1 win");
        assertEq(registry.getAgent(agent1).wins, 0, "Agent1 should have 0 wins");

        console.log("=== DISPUTE FLOW COMPLETE ===");
        console.log("  Agent1 disputes:", registry.getAgent(agent1).disputes);
        console.log("  Agent2 wins:", registry.getAgent(agent2).wins);
    }

    // =========================================================================
    //  TEST 3: Cancel Flow — Coordinator Cancels, Stakes Refunded
    // =========================================================================
    //
    //  Flow: deploy → 2 submit → deadline passes → coordinator cancels
    //        → all stakes refunded, reward returned to coordinator
    //

    function test_cancelFlow() public {
        MandalaTask task = _deployTask();
        uint256 netReward = REWARD - (REWARD * FEE_BPS) / 10_000;

        // Agents submit proofs with stakes
        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("a1-proof"), "ipfs://a1");

        vm.prank(agent2);
        task.submitProof{value: STAKE}(keccak256("a2-proof"), "ipfs://a2");

        // Record balances before cancel
        uint256 coordBefore  = coordinator.balance;
        uint256 agent1Before = agent1.balance;
        uint256 agent2Before = agent2.balance;

        // Fast-forward past deadline (required when there are submissions)
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        // Coordinator decides to cancel — maybe criteria were flawed
        vm.prank(coordinator);
        task.cancel();

        // Task is now Cancelled
        TaskLib.TaskConfig memory cfg = task.getConfig();
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Cancelled), "Should be Cancelled");

        // All stakes returned to agents
        assertEq(
            agent1.balance - agent1Before, STAKE,
            "Agent1 should get stake back"
        );
        assertEq(
            agent2.balance - agent2Before, STAKE,
            "Agent2 should get stake back"
        );

        // Reward returned to coordinator (net of protocol fee — fee is non-refundable)
        assertEq(
            coordinator.balance - coordBefore, netReward,
            "Coordinator should get net reward back (fee is not refunded)"
        );

        // No reputation changes for cancellation — agents didn't win or lose
        assertEq(registry.getAgent(agent1).wins, 0, "No wins from cancelled task");
        assertEq(registry.getAgent(agent2).wins, 0, "No wins from cancelled task");
        // But participation was already recorded at submission time
        assertEq(registry.getAgent(agent1).totalTasks, 1, "Participation still recorded");

        console.log("=== CANCEL FLOW COMPLETE ===");
        console.log("  Reward refunded to coordinator:", netReward);
    }

    // =========================================================================
    //  TEST 4: Multiple Tasks — Reputation Tracking Across Tasks
    // =========================================================================
    //
    //  Flow: Create 3 tasks, different winners each time.
    //        Verify cumulative reputation scores are correct.
    //

    function test_multipleTasksReputation() public {
        // ---- Task 1: agent1 wins ----
        {
            MandalaTask task1 = _deployTask();

            vm.prank(agent1);
            task1.submitProof{value: STAKE}(keccak256("t1-a1"), "ipfs://t1-a1");
            vm.prank(agent2);
            task1.submitProof{value: STAKE}(keccak256("t1-a2"), "ipfs://t1-a2");
            vm.prank(agent3);
            task1.submitProof{value: STAKE}(keccak256("t1-a3"), "ipfs://t1-a3");

            vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
            vm.prank(verifier);
            task1.selectWinner(agent1);

            vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
            task1.finalize();
        }

        // ---- Task 2: agent2 wins ----
        {
            MandalaTask task2 = _deployTask();

            vm.prank(agent1);
            task2.submitProof{value: STAKE}(keccak256("t2-a1"), "ipfs://t2-a1");
            vm.prank(agent2);
            task2.submitProof{value: STAKE}(keccak256("t2-a2"), "ipfs://t2-a2");

            vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
            vm.prank(verifier);
            task2.selectWinner(agent2);

            vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
            task2.finalize();
        }

        // ---- Task 3: agent1 wins again ----
        {
            MandalaTask task3 = _deployTask();

            vm.prank(agent1);
            task3.submitProof{value: STAKE}(keccak256("t3-a1"), "ipfs://t3-a1");
            vm.prank(agent3);
            task3.submitProof{value: STAKE}(keccak256("t3-a3"), "ipfs://t3-a3");

            vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
            vm.prank(verifier);
            task3.selectWinner(agent1);

            vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
            task3.finalize();
        }

        // ---- Verify cumulative reputation ----
        // Factory should have deployed 3 tasks
        assertEq(factory.taskCount(), 3, "Factory should track 3 tasks");

        // Agent1: participated in 3 tasks, won 2
        TaskLib.AgentInfo memory a1 = registry.getAgent(agent1);
        assertEq(a1.totalTasks, 3, "Agent1: 3 participations");
        assertEq(a1.wins, 2, "Agent1: 2 wins");
        assertEq(registry.reputationScore(agent1), 66, "Agent1 rep: 2/3 * 100 = 66");

        // Agent2: participated in 2 tasks, won 1
        TaskLib.AgentInfo memory a2 = registry.getAgent(agent2);
        assertEq(a2.totalTasks, 2, "Agent2: 2 participations");
        assertEq(a2.wins, 1, "Agent2: 1 win");
        assertEq(registry.reputationScore(agent2), 50, "Agent2 rep: 1/2 * 100 = 50");

        // Agent3: participated in 2 tasks, won 0
        TaskLib.AgentInfo memory a3 = registry.getAgent(agent3);
        assertEq(a3.totalTasks, 2, "Agent3: 2 participations");
        assertEq(a3.wins, 0, "Agent3: 0 wins");
        assertEq(registry.reputationScore(agent3), 0, "Agent3 rep: 0/2 * 100 = 0");

        console.log("=== MULTIPLE TASKS REPUTATION COMPLETE ===");
        console.log("  Agent1 reputation:", registry.reputationScore(agent1), "(2 wins / 3 tasks)");
        console.log("  Agent2 reputation:", registry.reputationScore(agent2), "(1 win  / 2 tasks)");
        console.log("  Agent3 reputation:", registry.reputationScore(agent3), "(0 wins / 2 tasks)");
        console.log("  Total tasks deployed:", factory.taskCount());
    }

    // =========================================================================
    //  TEST 5: Dispute → Cancel (Human nullifies via resolveDispute(0x0))
    // =========================================================================
    //
    //  Flow: deploy → submit → verifier picks → dispute → human cancels
    //        → disputed agent's stake is slashed to treasury, rest refunded
    //

    function test_disputeResolvesToCancel() public {
        MandalaTask task = _deployTask();
        uint256 netReward = REWARD - (REWARD * FEE_BPS) / 10_000;

        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("a1-proof"), "ipfs://a1");

        vm.prank(agent2);
        task.submitProof{value: STAKE}(keccak256("a2-proof"), "ipfs://a2");

        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        vm.prank(verifier);
        task.selectWinner(agent1);

        // Agent2 disputes
        vm.prank(agent2);
        task.dispute(agent1, "Fraudulent submission");

        // Track balances
        uint256 treasuryBefore = treasury.balance;
        uint256 coordBefore    = coordinator.balance;
        uint256 agent2Before   = agent2.balance;
        uint256 agent1Before   = agent1.balance;

        // Human decides to cancel entirely — passes address(0)
        vm.prank(human);
        task.resolveDispute(address(0));

        // Task is cancelled
        TaskLib.TaskConfig memory cfg = task.getConfig();
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Cancelled), "Should be Cancelled");

        // Disputed agent (agent1) has stake SLASHED to treasury
        assertEq(
            treasury.balance - treasuryBefore, STAKE,
            "Treasury should receive slashed stake"
        );
        assertEq(
            agent1.balance - agent1Before, 0,
            "Slashed agent should NOT get stake back"
        );

        // Non-disputed agent (agent2) gets stake back
        assertEq(
            agent2.balance - agent2Before, STAKE,
            "Non-disputed agent should get stake refunded"
        );

        // Coordinator gets reward back
        assertEq(
            coordinator.balance - coordBefore, netReward,
            "Coordinator should get reward refunded"
        );

        console.log("=== DISPUTE -> CANCEL COMPLETE ===");
        console.log("  Slashed stake sent to treasury:", STAKE);
    }

    // =========================================================================
    //  TEST 6: Human-Gated Finalization
    // =========================================================================
    //
    //  When humanGateEnabled=true, only a human can call finalize().
    //  This tests that non-humans are blocked and humans can finalize.
    //

    function test_humanGatedFinalization() public {
        // Deploy task with human gate explicitly enabled
        IMandalaFactory.DeployParams memory params = _defaultParams();
        params.humanGateEnabled = true;

        vm.prank(coordinator);
        address taskAddr = factory.deployTask{value: REWARD}(params);
        MandalaTask task = MandalaTask(payable(taskAddr));

        // Submit and go through normal flow
        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("proof"), "ipfs://proof");

        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        vm.prank(verifier);
        task.selectWinner(agent1);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        // Non-human tries to finalize — should revert
        vm.prank(agent3);
        vm.expectRevert(TaskLib.HumanGateRequired.selector);
        task.finalize();

        // Human can finalize
        vm.prank(human);
        task.finalize();

        TaskLib.TaskConfig memory cfg = task.getConfig();
        assertEq(uint8(cfg.status), uint8(TaskLib.TaskStatus.Finalized), "Human should finalize");

        console.log("=== HUMAN GATE FINALIZATION COMPLETE ===");
    }

    // =========================================================================
    //  TEST 7: Policy Controls — Pause & Blacklist
    // =========================================================================
    //
    //  Verify that pausing blocks all operations and blacklisted agents
    //  cannot submit proofs.
    //

    function test_policyControls() public {
        MandalaTask task = _deployTask();

        // ---- Test blacklist ----
        // Admin blacklists agent3
        vm.prank(admin);
        policy.blacklist(agent3);

        // Blacklisted agent cannot submit
        vm.prank(agent3);
        vm.expectRevert(TaskLib.AgentSuspended.selector);
        task.submitProof{value: STAKE}(keccak256("blocked"), "ipfs://blocked");

        // Non-blacklisted agent can still submit
        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("ok"), "ipfs://ok");

        // ---- Test pause ----
        // Admin pauses the protocol
        vm.prank(admin);
        policy.pause();

        // Nobody can submit while paused
        vm.prank(agent2);
        vm.expectRevert(TaskLib.PolicyPaused.selector);
        task.submitProof{value: STAKE}(keccak256("paused"), "ipfs://paused");

        // Unpause and verify operations resume
        vm.prank(admin);
        policy.unpause();

        vm.prank(agent2);
        task.submitProof{value: STAKE}(keccak256("resumed"), "ipfs://resumed");

        assertEq(task.submissionCount(), 2, "Should have 2 submissions after unpause");

        console.log("=== POLICY CONTROLS COMPLETE ===");
    }
}
