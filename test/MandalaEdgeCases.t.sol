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

contract MandalaEdgeCasesTest is Test {

    MandalaPolicy        pol;
    MandalaAgentRegistry registry;
    MandalaTask          taskImpl;
    MandalaFactory       factory;

    address admin       = makeAddr("admin");
    address treasury    = makeAddr("treasury");
    address human       = makeAddr("human");
    address coordinator = makeAddr("coordinator");
    address verifier    = makeAddr("verifier");

    address agentA = makeAddr("agentA");
    address agentB = makeAddr("agentB");
    address agentC = makeAddr("agentC");
    address agentD = makeAddr("agentD");
    address agentE = makeAddr("agentE");

    uint256 constant REWARD      = 0.05 ether;
    uint256 constant STAKE       = 0.001 ether;
    uint256 constant GATE_THRESH = 0.1 ether;
    uint256 constant FEE_BPS     = 100;

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

        // fund everyone
        address[7] memory actors = [coordinator, agentA, agentB, agentC, agentD, agentE, verifier];
        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 10 ether);
        }

        // register all agents
        vm.prank(coordinator); registry.register(keccak256("coord-8004"), "ipfs://coord");
        vm.prank(agentA);      registry.register(keccak256("agentA-8004"), "ipfs://agentA");
        vm.prank(agentB);      registry.register(keccak256("agentB-8004"), "ipfs://agentB");
        vm.prank(agentC);      registry.register(keccak256("agentC-8004"), "ipfs://agentC");
        vm.prank(agentD);      registry.register(keccak256("agentD-8004"), "ipfs://agentD");
        vm.prank(agentE);      registry.register(keccak256("agentE-8004"), "ipfs://agentE");
        vm.prank(verifier);    registry.register(keccak256("verifier-8004"), "ipfs://verifier");
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _deployTask(bool humanGate, address _verifier) internal returns (address) {
        IMandalaFactory.DeployParams memory p = IMandalaFactory.DeployParams({
            verifier:         _verifier,
            token:            address(0),
            stakeRequired:    STAKE,
            deadline:         block.timestamp + 1 days,
            disputeWindow:    1 hours,
            criteriaHash:     keccak256("criteria"),
            criteriaURI:      "ipfs://criteria",
            humanGateEnabled: humanGate
        });
        vm.prank(coordinator);
        return factory.deployTask{value: REWARD}(p);
    }

    function _deployDefaultTask() internal returns (address) {
        return _deployTask(false, verifier);
    }

    function _deployZeroStakeTask() internal returns (address) {
        // set minStake to 0 first
        vm.prank(admin);
        pol.setMinStake(0);

        IMandalaFactory.DeployParams memory p = IMandalaFactory.DeployParams({
            verifier:         verifier,
            token:            address(0),
            stakeRequired:    0,
            deadline:         block.timestamp + 1 days,
            disputeWindow:    1 hours,
            criteriaHash:     keccak256("criteria"),
            criteriaURI:      "ipfs://criteria",
            humanGateEnabled: false
        });
        vm.prank(coordinator);
        return factory.deployTask{value: REWARD}(p);
    }

    // -------------------------------------------------------------------------
    // Full lifecycle with 5+ agents
    // -------------------------------------------------------------------------

    function test_fullLifecycle_fiveAgents() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("pB"), "ipfs://pB");
        vm.prank(agentC); task.submitProof{value: STAKE}(keccak256("pC"), "ipfs://pC");
        vm.prank(agentD); task.submitProof{value: STAKE}(keccak256("pD"), "ipfs://pD");
        vm.prank(agentE); task.submitProof{value: STAKE}(keccak256("pE"), "ipfs://pE");

        assertEq(task.submissionCount(), 5);

        vm.prank(verifier);
        task.selectWinner(agentC);
        assertEq(task.pendingWinner(), agentC);

        vm.warp(block.timestamp + 2 hours);

        uint256 winnerBefore = agentC.balance;
        task.finalize();

        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Finalized));
        // winner gets reward + stake back
        uint256 netReward = REWARD - (REWARD * FEE_BPS / 10_000);
        assertEq(agentC.balance - winnerBefore, netReward + STAKE);
    }

    // -------------------------------------------------------------------------
    // Dispute then cancel (human resolves with address(0))
    // -------------------------------------------------------------------------

    function test_disputeThenCancel_humanResolvesWithZero() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("pB"), "ipfs://pB");

        vm.prank(verifier); task.selectWinner(agentA);
        vm.prank(agentB);   task.dispute(agentA, "plagiarism");

        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Disputed));

        uint256 coordBefore = coordinator.balance;
        uint256 agentBBefore = agentB.balance;

        // human resolves with address(0) -> cancel
        vm.prank(human);
        task.resolveDispute(address(0));

        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Cancelled));
        // coordinator gets reward back
        assertGt(coordinator.balance, coordBefore);
        // agentB gets stake back
        assertEq(agentB.balance - agentBBefore, STAKE);
        // agentA's stake is slashed (stays in contract or goes to treasury)
    }

    // -------------------------------------------------------------------------
    // Human gate: finalize blocked for non-human
    // -------------------------------------------------------------------------

    function test_humanGate_blockNonHumanFinalize() public {
        address t = _deployTask(true, verifier);
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(verifier); task.selectWinner(agentA);

        vm.warp(block.timestamp + 2 hours);

        // non-human tries to finalize
        vm.prank(agentA);
        vm.expectRevert(TaskLib.HumanGateRequired.selector);
        task.finalize();

        // human can finalize
        vm.prank(human);
        task.finalize();
        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Finalized));
    }

    // -------------------------------------------------------------------------
    // Cancel with submissions only after deadline
    // -------------------------------------------------------------------------

    function test_cancelWithSubmissions_afterDeadline() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");

        // can't cancel before deadline
        vm.prank(coordinator);
        vm.expectRevert(TaskLib.DeadlineNotPassed.selector);
        task.cancel();

        // warp past deadline
        vm.warp(block.timestamp + 2 days);

        uint256 coordBefore = coordinator.balance;
        uint256 agentABefore = agentA.balance;

        vm.prank(coordinator);
        task.cancel();

        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Cancelled));
        assertGt(coordinator.balance, coordBefore);
        assertEq(agentA.balance - agentABefore, STAKE);
    }

    // -------------------------------------------------------------------------
    // Cancel reverts if already finalized
    // -------------------------------------------------------------------------

    function test_cancelRevertsIfFinalized() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(verifier); task.selectWinner(agentA);
        vm.warp(block.timestamp + 2 hours);
        task.finalize();

        vm.prank(coordinator);
        vm.expectRevert(TaskLib.TaskAlreadyFinalized.selector);
        task.cancel();
    }

    // -------------------------------------------------------------------------
    // Verifier re-selects winner (change mind before finalize)
    // -------------------------------------------------------------------------

    function test_verifierReselectsWinner() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("pB"), "ipfs://pB");

        vm.prank(verifier); task.selectWinner(agentA);
        assertEq(task.pendingWinner(), agentA);

        // verifier changes mind
        vm.prank(verifier); task.selectWinner(agentB);
        assertEq(task.pendingWinner(), agentB);

        vm.warp(block.timestamp + 2 hours);
        task.finalize();

        // agentB should be the winner
        TaskLib.AgentInfo memory infoB = registry.getAgent(agentB);
        assertEq(infoB.wins, 1);
    }

    // -------------------------------------------------------------------------
    // Open verifier (verifier=address(0)) — any registered agent can select
    // -------------------------------------------------------------------------

    function test_openVerifier_anyRegisteredCanSelect() public {
        address t = _deployTask(false, address(0));
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("pB"), "ipfs://pB");

        // agentC (any registered agent) can select winner
        vm.prank(agentC);
        task.selectWinner(agentA);
        assertEq(task.pendingWinner(), agentA);

        vm.warp(block.timestamp + 2 hours);
        task.finalize();
        assertEq(uint256(task.getConfig().status), uint256(TaskLib.TaskStatus.Finalized));
    }

    // -------------------------------------------------------------------------
    // Slashing: disputed agent loses stake
    // -------------------------------------------------------------------------

    function test_slashing_disputedAgentLosesStake() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("pB"), "ipfs://pB");

        uint256 agentABalBefore = agentA.balance;

        vm.prank(verifier); task.selectWinner(agentA);
        vm.prank(agentB);   task.dispute(agentA, "cheating");

        // human resolves with address(0) -> cancel + slash
        vm.prank(human);
        task.resolveDispute(address(0));

        // agentA doesn't get stake back (slashed)
        // agentA balance should be same as before dispute resolution
        assertEq(agentA.balance, agentABalBefore);

        // check submission is disqualified
        TaskLib.Submission memory sub = task.getSubmission(agentA);
        assertTrue(sub.disqualified);
        assertEq(sub.stake, 0);
    }

    // -------------------------------------------------------------------------
    // Stake return: losing agents get stake back on finalize
    // -------------------------------------------------------------------------

    function test_losingAgentsGetStakeBack() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("pB"), "ipfs://pB");
        vm.prank(agentC); task.submitProof{value: STAKE}(keccak256("pC"), "ipfs://pC");

        uint256 balB = agentB.balance;
        uint256 balC = agentC.balance;

        vm.prank(verifier); task.selectWinner(agentA);
        vm.warp(block.timestamp + 2 hours);
        task.finalize();

        // losers get their stakes back
        assertEq(agentB.balance - balB, STAKE);
        assertEq(agentC.balance - balC, STAKE);
    }

    // -------------------------------------------------------------------------
    // Balance accounting: ETH flows are exact
    // -------------------------------------------------------------------------

    function test_balanceAccounting_exact() public {
        uint256 fee = REWARD * FEE_BPS / 10_000;
        uint256 netReward = REWARD - fee;

        uint256 treasuryBefore   = treasury.balance;
        uint256 coordBefore      = coordinator.balance;
        uint256 agentABefore     = agentA.balance;
        uint256 agentBBefore     = agentB.balance;

        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        // coordinator spent REWARD
        assertEq(coordBefore - coordinator.balance, REWARD);
        // treasury got fee
        assertEq(treasury.balance - treasuryBefore, fee);

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("pB"), "ipfs://pB");

        // agents spent STAKE each
        assertEq(agentABefore - agentA.balance, STAKE);
        assertEq(agentBBefore - agentB.balance, STAKE);

        uint256 agentABeforeFinalize = agentA.balance;
        uint256 agentBBeforeFinalize = agentB.balance;

        vm.prank(verifier); task.selectWinner(agentA);
        vm.warp(block.timestamp + 2 hours);
        task.finalize();

        // winner (agentA) gets netReward + STAKE
        assertEq(agentA.balance - agentABeforeFinalize, netReward + STAKE);
        // loser (agentB) gets STAKE back
        assertEq(agentB.balance - agentBBeforeFinalize, STAKE);

        // task contract should have 0 balance
        assertEq(address(task).balance, 0);
    }

    // -------------------------------------------------------------------------
    // Zero stake tasks work
    // -------------------------------------------------------------------------

    function test_zeroStakeTask() public {
        address t = _deployZeroStakeTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: 0}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: 0}(keccak256("pB"), "ipfs://pB");

        assertEq(task.submissionCount(), 2);

        vm.prank(verifier); task.selectWinner(agentA);
        vm.warp(block.timestamp + 2 hours);

        uint256 winnerBefore = agentA.balance;
        task.finalize();

        uint256 netReward = REWARD - (REWARD * FEE_BPS / 10_000);
        assertEq(agentA.balance - winnerBefore, netReward);
    }

    // -------------------------------------------------------------------------
    // disputeTimeRemaining and timeRemaining views
    // -------------------------------------------------------------------------

    function test_timeRemaining() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        uint256 remaining = task.timeRemaining();
        assertEq(remaining, 1 days);

        vm.warp(block.timestamp + 12 hours);
        assertEq(task.timeRemaining(), 12 hours);

        vm.warp(block.timestamp + 13 hours);
        assertEq(task.timeRemaining(), 0);
    }

    function test_disputeTimeRemaining() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        // no winner yet -> 0
        assertEq(task.disputeTimeRemaining(), 0);

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(verifier); task.selectWinner(agentA);

        // just selected -> full window
        assertEq(task.disputeTimeRemaining(), 1 hours);

        vm.warp(block.timestamp + 30 minutes);
        assertEq(task.disputeTimeRemaining(), 30 minutes);

        vm.warp(block.timestamp + 31 minutes);
        assertEq(task.disputeTimeRemaining(), 0);
    }

    // -------------------------------------------------------------------------
    // Cancel reverts if already cancelled
    // -------------------------------------------------------------------------

    function test_cancelRevertsIfAlreadyCancelled() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(coordinator);
        task.cancel();

        vm.prank(coordinator);
        vm.expectRevert(TaskLib.TaskAlreadyFinalized.selector);
        task.cancel();
    }

    // -------------------------------------------------------------------------
    // Non-coordinator cannot cancel
    // -------------------------------------------------------------------------

    function test_cancelRevertsIfNotCoordinator() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA);
        vm.expectRevert(TaskLib.NotCoordinator.selector);
        task.cancel();
    }

    // -------------------------------------------------------------------------
    // Non-verifier cannot select winner (when verifier is set)
    // -------------------------------------------------------------------------

    function test_selectWinnerRevertsIfNotVerifier() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");

        vm.prank(agentB);
        vm.expectRevert(TaskLib.NotVerifier.selector);
        task.selectWinner(agentA);
    }

    // -------------------------------------------------------------------------
    // Finalize reverts during dispute window
    // -------------------------------------------------------------------------

    function test_finalizeRevertsDuringDisputeWindow() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(verifier); task.selectWinner(agentA);

        vm.expectRevert(TaskLib.DisputeWindowActive.selector);
        task.finalize();
    }

    // -------------------------------------------------------------------------
    // Dispute reverts after window expires
    // -------------------------------------------------------------------------

    function test_disputeRevertsAfterWindow() public {
        address t = _deployDefaultTask();
        MandalaTask task = MandalaTask(payable(t));

        vm.prank(agentA); task.submitProof{value: STAKE}(keccak256("pA"), "ipfs://pA");
        vm.prank(agentB); task.submitProof{value: STAKE}(keccak256("pB"), "ipfs://pB");

        vm.prank(verifier); task.selectWinner(agentA);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(agentB);
        vm.expectRevert(TaskLib.DisputeWindowExpired.selector);
        task.dispute(agentA, "too late");
    }
}
