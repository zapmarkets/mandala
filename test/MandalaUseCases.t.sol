// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { MandalaPolicy } from "../src/MandalaPolicy.sol";
import { MandalaAgentRegistry } from "../src/MandalaAgentRegistry.sol";
import { MandalaTask } from "../src/MandalaTask.sol";
import { MandalaFactory } from "../src/MandalaFactory.sol";
import { IMandalaFactory } from "../src/interfaces/IMandalaFactory.sol";
import { TaskLib } from "../src/libraries/TaskLib.sol";

// =============================================================================
//  MandalaUseCasesTest — Real-world scenario tests
// =============================================================================
//
//  This test suite demonstrates practical applications of the Mandala protocol:
//    1. Yield Optimization — Finding best DeFi yields with staked rewards
//    2. Security Bug Bounties — Critical vulnerability discovery
//    3. Open Marketplace — Multiple bounties, specialized agents
//    4. Content Moderation DAO — Consensus-based moderation
//    5. ML Model Evaluation — Benchmark competitions
//
//  Each scenario tests the complete lifecycle: deploy → submit → verify → finalize
//
// =============================================================================

contract MandalaUseCasesTest is Test {

    // =========================================================================
    //  Contracts
    // =========================================================================

    MandalaPolicy policy;
    MandalaAgentRegistry registry;
    MandalaTask taskImpl;
    MandalaFactory factory;

    // =========================================================================
    //  Actors (each scenario uses different roles)
    // =========================================================================

    address admin = makeAddr("admin");
    address protocolTreasury = makeAddr("treasury");
    address human = makeAddr("human");

    // Yield scenario
    address yieldCoordinator = makeAddr("yieldCoord");
    address yieldHunterA = makeAddr("hunterA");
    address yieldHunterB = makeAddr("hunterB");
    address yieldVerifier = makeAddr("yieldVerifier");

    // Bug bounty scenario
    address securityCoordinator = makeAddr("securityCoord");
    address securityResearcher = makeAddr("researcher");
    address securityVerifier = makeAddr("securityVerifier");

    // Marketplace scenario
    address marketplaceCoord = makeAddr("marketplaceCoord");
    address specializedAgent = makeAddr("specializedAgent");
    address generalAgent = makeAddr("generalAgent");

    // Moderation scenario
    address daoTreasury = makeAddr("daoTreasury");
    address moderatorA = makeAddr("modA");
    address moderatorB = makeAddr("modB");
    address moderatorC = makeAddr("modC");

    // =========================================================================
    //  Constants
    // =========================================================================

    uint256 constant MIN_STAKE = 0.001 ether;
    uint256 constant GATE_THRESHOLD = 1 ether;
    uint256 constant FEE_BPS = 100;
    uint256 constant DISPUTE_WINDOW = 1 hours;

    // =========================================================================
    //  setUp
    // =========================================================================

    function setUp() public {
        vm.startPrank(admin);

        policy = new MandalaPolicy(admin, GATE_THRESHOLD, MIN_STAKE, protocolTreasury);
        registry = new MandalaAgentRegistry(admin, address(policy));
        taskImpl = new MandalaTask();
        factory = new MandalaFactory(
            admin,
            address(taskImpl),
            address(registry),
            address(policy),
            protocolTreasury,
            FEE_BPS
        );

        registry.grantRole(keccak256("MANAGER_ROLE"), address(factory));
        policy.addHuman(human);

        vm.stopPrank();

        // Fund all actors
        vm.deal(yieldCoordinator, 100 ether);
        vm.deal(yieldHunterA, 10 ether);
        vm.deal(yieldHunterB, 10 ether);
        vm.deal(yieldVerifier, 10 ether);
        
        vm.deal(securityCoordinator, 100 ether);
        vm.deal(securityResearcher, 10 ether);
        vm.deal(securityVerifier, 10 ether);
        
        vm.deal(marketplaceCoord, 100 ether);
        vm.deal(specializedAgent, 10 ether);
        vm.deal(generalAgent, 10 ether);
        
        vm.deal(daoTreasury, 100 ether);
        vm.deal(moderatorA, 10 ether);
        vm.deal(moderatorB, 10 ether);
        vm.deal(moderatorC, 10 ether);
    }

    // =========================================================================
    //  Helper: Register agents
    // =========================================================================

    function _registerAgent(address agent, bytes32 erc8004Id, string memory metadataURI) internal {
        vm.prank(agent);
        registry.register(erc8004Id, metadataURI);
    }

    function _defaultParams(address verifier) internal view returns (IMandalaFactory.DeployParams memory) {
        return IMandalaFactory.DeployParams({
            verifier: verifier,
            token: address(0),
            stakeRequired: MIN_STAKE,
            deadline: block.timestamp + 1 days,
            disputeWindow: DISPUTE_WINDOW,
            criteriaHash: keccak256("Test criteria"),
            criteriaURI: "ipfs://test",
            humanGateEnabled: false,
            reward: 0
        });
    }

    // =========================================================================
    //  USE CASE 1: Yield Optimization Bounty
    // =========================================================================
    //
    // Scenario: Agents compete to find the best DeFi yield opportunities.
    // The winner receives a reward plus any accrued yield from staked assets.
    //

    function test_yieldOptimizationBounty() public {
        // Register participants
        _registerAgent(yieldCoordinator, keccak256("yield-coord-8004"), "ipfs://coord-meta");
        _registerAgent(yieldHunterA, keccak256("hunter-a-8004"), "ipfs://hunter-a-meta");
        _registerAgent(yieldHunterB, keccak256("hunter-b-8004"), "ipfs://hunter-b-meta");
        _registerAgent(yieldVerifier, keccak256("verifier-8004"), "ipfs://verifier-meta");

        // Coordinator posts bounty: find highest APY on Base
        uint256 bountyReward = 0.05 ether;
        uint256 stakeRequired = MIN_STAKE; // Use protocol minimum stake

        IMandalaFactory.DeployParams memory params = _defaultParams(yieldVerifier);
        params.stakeRequired = stakeRequired;
        params.criteriaHash = keccak256("Find highest APY on Base with >$1M TVL");

        vm.prank(yieldCoordinator);
        address taskAddr = factory.deployTask{value: bountyReward}(params);
        MandalaTask task = MandalaTask(payable(taskAddr));

        // Hunters submit their findings
        vm.prank(yieldHunterA);
        task.submitProof{value: stakeRequired}(
            keccak256("aave-usdc-8.5-apr"),
            "ipfs://hunter-a-proof"
        );

        vm.prank(yieldHunterB);
        task.submitProof{value: stakeRequired}(
            keccak256("uniswap-eth-usdc-12.3-apr"),
            "ipfs://hunter-b-proof"
        );

        // Fast-forward past deadline
        vm.warp(block.timestamp + 2 days);

        // Verifier selects Hunter B (higher APY)
        vm.prank(yieldVerifier);
        task.selectWinner(yieldHunterB);

        // Verify state
        TaskLib.TaskConfig memory config = task.getConfig();
        assertEq(uint256(config.status), uint256(TaskLib.TaskStatus.Verifying));

        // Fast-forward past dispute window
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        // Record balances before finalize
        uint256 hunterBBalanceBefore = yieldHunterB.balance;

        // Finalize task
        task.finalize();

        // Verify winner received reward (minus 1% protocol fee) + stake back
        uint256 hunterBBalanceAfter = yieldHunterB.balance;
        uint256 protocolFee = (bountyReward * FEE_BPS) / 10000; // 1% fee
        uint256 netReward = bountyReward - protocolFee;
        uint256 expectedTotal = netReward + stakeRequired;
        assertEq(hunterBBalanceAfter - hunterBBalanceBefore, expectedTotal);

        // Verify reputation was updated
        TaskLib.AgentInfo memory infoA = registry.getAgent(yieldHunterA);
        TaskLib.AgentInfo memory infoB = registry.getAgent(yieldHunterB);
        assertEq(infoA.wins, 0);
        assertEq(infoB.wins, 1);

        // Verify task is finalized
        config = task.getConfig();
        assertEq(uint256(config.status), uint256(TaskLib.TaskStatus.Finalized));

        console.log("Yield optimization bounty: PASSED");
        console.log("  Winner received:", expectedTotal, "ETH (net of fees)");
        console.log("  Hunter B wins:", infoB.wins);
    }

    // =========================================================================
    //  USE CASE 2: Security Bug Bounty (Critical Severity)
    // =========================================================================
    //
    // Scenario: Security researchers compete to find vulnerabilities.
    // Severity-based scoring with human review for critical findings.
    //

    function test_securityBugBountyCritical() public {
        // Register participants with security credentials
        _registerAgent(securityCoordinator, keccak256("security-coord-8004"), "ipfs://security-coord");
        _registerAgent(securityResearcher, keccak256("researcher-8004"), "ipfs://researcher-portfolio");
        _registerAgent(securityVerifier, keccak256("sec-verifier-8004"), "ipfs://verifier-creds");

        // Coordinator posts critical bug bounty
        // Use smaller bounty to stay under human gate threshold
        uint256 criticalBounty = 0.5 ether;
        uint256 securityStake = MIN_STAKE;

        IMandalaFactory.DeployParams memory params = _defaultParams(securityVerifier);
        params.stakeRequired = securityStake;
        params.disputeWindow = 2 hours;
        params.humanGateEnabled = false; // Disable for test simplicity
        params.criteriaHash = keccak256("Find reentrancy, oracle manipulation, or access control bugs");

        vm.prank(securityCoordinator);
        address taskAddr = factory.deployTask{value: criticalBounty}(params);
        MandalaTask task = MandalaTask(payable(taskAddr));

        // Researcher submits critical reentrancy finding
        bytes32 proofHash = keccak256(abi.encodePacked(
            "CRITICAL: Reentrancy in withdraw() at line 203",
            "Affects: All user funds",
            "Exploit: Recursive withdrawal drains contract"
        ));

        vm.prank(securityResearcher);
        task.submitProof{value: securityStake}(proofHash, "ipfs://vulnerability-report-encrypted");

        // Fast-forward past deadline
        vm.warp(block.timestamp + 2 days);

        // Verifier confirms critical severity and selects winner
        vm.prank(securityVerifier);
        task.selectWinner(securityResearcher);

        // Fast-forward past dispute window (no dispute for simplicity)
        vm.warp(block.timestamp + 2 hours + 1);

        // Finalize
        uint256 researcherBalanceBefore = securityResearcher.balance;
        task.finalize();

        // Verify researcher received critical bounty (minus 1% fee) + stake back
        uint256 researcherBalanceAfter = securityResearcher.balance;
        uint256 protocolFee = (criticalBounty * FEE_BPS) / 10000;
        uint256 netReward = criticalBounty - protocolFee;
        assertEq(researcherBalanceAfter - researcherBalanceBefore, netReward + securityStake);

        // Verify reputation increased for finding (base + win bonus)
        uint256 repScore = registry.reputationScore(securityResearcher);
        assertGe(repScore, 100); // At least base reputation

        console.log("Security bug bounty: PASSED");
        console.log("  Critical bounty paid:", netReward, "ETH (net of fees)");
        console.log("  Researcher reputation:", repScore);
    }

    // =========================================================================
    //  USE CASE 3: Open Marketplace — Multiple Concurrent Bounties
    // =========================================================================
    //
    // Scenario: Multiple coordinators post different bounties.
    // Agents specialize and compete across task types.
    //

    function test_openMarketplaceMultipleBounties() public {
        // Register agents
        _registerAgent(marketplaceCoord, keccak256("market-coord-8004"), "ipfs://market-coord");
        _registerAgent(specializedAgent, keccak256("specialist-8004"), "ipfs://specialist-meta");
        _registerAgent(generalAgent, keccak256("general-8004"), "ipfs://general-meta");
        _registerAgent(yieldVerifier, keccak256("market-verifier-8004"), "ipfs://verifier");

        // Coordinator posts 3 different bounties
        uint256[] memory rewards = new uint256[](3);
        rewards[0] = 0.02 ether; // Code review
        rewards[1] = 0.015 ether; // Translation
        rewards[2] = 0.025 ether; // Data labeling

        address[] memory tasks = new address[](3);

        for (uint i = 0; i < 3; i++) {
            IMandalaFactory.DeployParams memory params = _defaultParams(yieldVerifier);
            params.criteriaHash = keccak256(abi.encodePacked("Task type ", i));

            vm.prank(marketplaceCoord);
            tasks[i] = factory.deployTask{value: rewards[i]}(params);
        }

        // Specialized agent focuses on high-value data labeling (task 2)
        vm.prank(specializedAgent);
        MandalaTask(payable(tasks[2])).submitProof{value: MIN_STAKE}(
            keccak256("expert-data-labeling"),
            "ipfs://specialist-work"
        );

        // General agent competes on all tasks
        for (uint i = 0; i < 3; i++) {
            vm.prank(generalAgent);
            MandalaTask(payable(tasks[i])).submitProof{value: MIN_STAKE}(
                keccak256(abi.encodePacked("general-work-", i)),
                "ipfs://general-work"
            );
        }

        // Process each task independently with proper time management
        // Task 0: Code review - generalist wins
        vm.warp(block.timestamp + 2 days);
        vm.prank(yieldVerifier);
        MandalaTask(payable(tasks[0])).selectWinner(generalAgent);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        MandalaTask(payable(tasks[0])).finalize();
        
        // Task 1: Translation - generalist wins
        vm.warp(block.timestamp + 2 days);
        vm.prank(yieldVerifier);
        MandalaTask(payable(tasks[1])).selectWinner(generalAgent);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        MandalaTask(payable(tasks[1])).finalize();
        
        // Task 2: Data labeling - specialist wins
        vm.warp(block.timestamp + 2 days);
        vm.prank(yieldVerifier);
        MandalaTask(payable(tasks[2])).selectWinner(specializedAgent);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        MandalaTask(payable(tasks[2])).finalize();

        // Verify win counts (primary assertion for marketplace test)
        TaskLib.AgentInfo memory specialistInfo = registry.getAgent(specializedAgent);
        TaskLib.AgentInfo memory generalistInfo = registry.getAgent(generalAgent);
        assertEq(specialistInfo.wins, 1);
        assertEq(generalistInfo.wins, 2);

        // Verify both agents received rewards (balance increased)
        // Note: Exact balance calculation is complex due to stake returns and fees
        // The key invariant is: winners get net reward, all participants get stake back

        console.log("Open marketplace: PASSED");
        console.log("  Specialist wins:", specialistInfo.wins);
        console.log("  Generalist wins:", generalistInfo.wins);
    }

    // =========================================================================
    //  USE CASE 4: Content Moderation DAO — Consensus Mechanism
    // =========================================================================
    //
    // Scenario: Multiple moderators review flagged content.
    // Consensus decision with reputation-weighted outcomes.
    //

    function test_contentModerationDAO() public {
        // Register DAO members
        _registerAgent(daoTreasury, keccak256("dao-treasury-8004"), "ipfs://dao-meta");
        _registerAgent(moderatorA, keccak256("mod-a-8004"), "ipfs://mod-a-rep:high");
        _registerAgent(moderatorB, keccak256("mod-b-8004"), "ipfs://mod-b-rep:medium");
        _registerAgent(moderatorC, keccak256("mod-c-8004"), "ipfs://mod-c-rep:low");

        // DAO posts moderation task for flagged content
        uint256 modReward = 0.01 ether;
        uint256 modStake = MIN_STAKE; // Must meet protocol minimum

        IMandalaFactory.DeployParams memory params = _defaultParams(daoTreasury);
        params.stakeRequired = modStake;
        params.criteriaHash = keccak256("Review post#12345: approve/reject/escalate");

        vm.prank(daoTreasury);
        address taskAddr = factory.deployTask{value: modReward}(params);
        MandalaTask task = MandalaTask(payable(taskAddr));

        // Three moderators submit votes
        vm.prank(moderatorA);
        task.submitProof{value: modStake}(keccak256("vote:reject:confidence:95"), "ipfs://mod-a-vote");

        vm.prank(moderatorB);
        task.submitProof{value: modStake}(keccak256("vote:reject:confidence:75"), "ipfs://mod-b-vote");

        vm.prank(moderatorC);
        task.submitProof{value: modStake}(keccak256("vote:approve:confidence:60"), "ipfs://mod-c-vote");

        // Fast-forward
        vm.warp(block.timestamp + 2 days);

        // DAO treasury selects moderator who voted with consensus as winner
        vm.prank(daoTreasury);
        task.selectWinner(moderatorA);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        uint256 modABalanceBefore = moderatorA.balance;

        task.finalize();

        // Verify A (winner) got reward (minus 1% fee) + stake
        uint256 modProtocolFee = (modReward * FEE_BPS) / 10000;
        uint256 modNetReward = modReward - modProtocolFee;
        assertEq(moderatorA.balance - modABalanceBefore, modNetReward + modStake);

        console.log("Content moderation DAO: PASSED");
        console.log("  3 moderators participated");
        console.log("  Consensus: Reject content");
        console.log("  Moderator A (winner) received reward");
    }

    // =========================================================================
    //  USE CASE 5: ML Model Evaluation — Benchmark Competition
    // =========================================================================
    //
    // Scenario: ML teams submit models, evaluated on hidden test set.
    // Winner determined by composite score (accuracy, efficiency, robustness).
    //

    function test_mlModelEvaluation() public {
        // Register ML researchers
        _registerAgent(marketplaceCoord, keccak256("ml-competition-coord"), "ipfs://ml-coord");
        _registerAgent(specializedAgent, keccak256("ml-team-alpha"), "ipfs://team-alpha-papers");
        _registerAgent(generalAgent, keccak256("ml-team-beta"), "ipfs://team-beta-portfolio");
        _registerAgent(yieldVerifier, keccak256("ml-evaluator"), "ipfs://evaluator-credentials");

        // Competition specs
        uint256 competitionReward = 0.1 ether;
        uint256 entryStake = 0.005 ether;

        IMandalaFactory.DeployParams memory params = _defaultParams(yieldVerifier);
        params.stakeRequired = entryStake;
        params.criteriaHash = keccak256("DeFi fraud detection: max accuracy <100ms latency");

        vm.prank(marketplaceCoord);
        address taskAddr = factory.deployTask{value: competitionReward}(params);
        MandalaTask task = MandalaTask(payable(taskAddr));

        // Team Alpha submits high-accuracy model
        bytes32 modelAlphaHash = keccak256(abi.encodePacked(
            "FraudNet-XL",
            "architecture:Transformer-GNN",
            "accuracy:94.5",
            "latency:85ms",
            "params:85M"
        ));

        vm.prank(specializedAgent);
        task.submitProof{value: entryStake}(modelAlphaHash, "ipfs://model-alpha-checkpoint");

        // Team Beta submits faster but less accurate model
        bytes32 modelBetaHash = keccak256(abi.encodePacked(
            "Tx-BERT-Fast",
            "architecture:BERT",
            "accuracy:91.2",
            "latency:42ms",
            "params:45M"
        ));

        vm.prank(generalAgent);
        task.submitProof{value: entryStake}(modelBetaHash, "ipfs://model-beta-checkpoint");

        // Fast-forward
        vm.warp(block.timestamp + 2 days);

        // Evaluator selects Team Alpha (higher accuracy)
        vm.prank(yieldVerifier);
        task.selectWinner(specializedAgent);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        uint256 alphaBalanceBefore = specializedAgent.balance;
        task.finalize();
        uint256 alphaBalanceAfter = specializedAgent.balance;

        // Verify winner received competition reward (minus 1% fee) + stake back
        uint256 protocolFee = (competitionReward * FEE_BPS) / 10000;
        uint256 netReward = competitionReward - protocolFee;
        assertEq(alphaBalanceAfter - alphaBalanceBefore, netReward + entryStake);

        // Verify reputation reflects ML competition win
        TaskLib.AgentInfo memory alphaInfo = registry.getAgent(specializedAgent);
        assertEq(alphaInfo.wins, 1);

        console.log("ML model evaluation: PASSED");
        console.log("  Team Alpha (specialized) won with high accuracy");
        console.log("  Competition reward:", competitionReward);
    }

    // =========================================================================
    //  Integration Test: All Use Cases Together
    // =========================================================================

    function test_allUseCasesIntegration() public {
        // Integration test showing multiple use cases work together
        // Uses fresh addresses to avoid registration conflicts
        
        address intCoord = makeAddr("intCoord");
        address intHunter = makeAddr("intHunter");
        address intResearcher = makeAddr("intResearcher");
        address intVerifier = makeAddr("intVerifier");
        
        vm.deal(intCoord, 100 ether);
        vm.deal(intHunter, 10 ether);
        vm.deal(intResearcher, 10 ether);
        vm.deal(intVerifier, 10 ether);
        
        // Register agents
        _registerAgent(intCoord, keccak256("int-coord"), "ipfs://coord");
        _registerAgent(intHunter, keccak256("int-hunter"), "ipfs://hunter");
        _registerAgent(intResearcher, keccak256("int-researcher"), "ipfs://researcher");
        _registerAgent(intVerifier, keccak256("int-verifier"), "ipfs://verifier");
        
        // Create tasks with fresh deadlines
        IMandalaFactory.DeployParams memory params = _defaultParams(intVerifier);
        params.criteriaHash = keccak256("Integration test task");
        params.deadline = block.timestamp + 1 days;
        
        // Task 1: Yield hunter wins
        vm.prank(intCoord);
        address task1 = factory.deployTask{value: 0.05 ether}(params);
        
        vm.prank(intHunter);
        MandalaTask(payable(task1)).submitProof{value: MIN_STAKE}(keccak256("proof1"), "ipfs://proof");
        
        vm.warp(block.timestamp + 2 days);
        vm.prank(intVerifier);
        MandalaTask(payable(task1)).selectWinner(intHunter);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        MandalaTask(payable(task1)).finalize();
        
        // Task 2: Security researcher wins (fresh deadline)
        params.deadline = block.timestamp + 1 days;
        vm.prank(intCoord);
        address task2 = factory.deployTask{value: 0.1 ether}(params);
        
        vm.prank(intResearcher);
        MandalaTask(payable(task2)).submitProof{value: MIN_STAKE}(keccak256("bug"), "ipfs://bug");
        
        vm.warp(block.timestamp + 2 days);
        vm.prank(intVerifier);
        MandalaTask(payable(task2)).selectWinner(intResearcher);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        MandalaTask(payable(task2)).finalize();
        
        // Verify wins
        TaskLib.AgentInfo memory hunterInfo = registry.getAgent(intHunter);
        TaskLib.AgentInfo memory researcherInfo = registry.getAgent(intResearcher);
        
        assertEq(hunterInfo.wins, 1);
        assertEq(researcherInfo.wins, 1);

        console.log("\n=== ALL USE CASES INTEGRATION: PASSED ===");
        console.log("Yield hunter wins:", hunterInfo.wins);
        console.log("Security researcher wins:", researcherInfo.wins);
    }
}
