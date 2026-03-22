// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { ERC20 }            from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 }           from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MandalaPolicy }        from "../src/MandalaPolicy.sol";
import { MandalaAgentRegistry } from "../src/MandalaAgentRegistry.sol";
import { MandalaTask }          from "../src/MandalaTask.sol";
import { MandalaFactory }       from "../src/MandalaFactory.sol";
import { IMandalaFactory }      from "../src/interfaces/IMandalaFactory.sol";
import { IMandalaStETHTreasury } from "../src/interfaces/IMandalaStETHTreasury.sol";
import { MandalaStETHTreasury } from "../src/MandalaStETHTreasury.sol";
import { TaskLib }              from "../src/libraries/TaskLib.sol";

// =============================================================================
//  Mock wstETH — simulates Lido wstETH on a local chain
// =============================================================================
//
//  ERC20 with:
//    - mint()            : test helper to create tokens
//    - stETHPerToken     : exchange rate, starts at 1e18 (1:1)
//    - getStETHByWstETH  : amount * stETHPerToken / 1e18
//    - getWstETHByStETH  : amount * 1e18 / stETHPerToken
//    - setRate()         : simulate yield accrual by bumping the rate
//
contract MockWstETH is ERC20 {
    uint256 public stETHPerToken = 1e18; // starts at 1:1

    constructor() ERC20("Wrapped stETH", "wstETH") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice How much stETH you get for `amount` wstETH
    function getStETHByWstETH(uint256 amount) external view returns (uint256) {
        return (amount * stETHPerToken) / 1e18;
    }

    /// @notice How much wstETH you need to get `amount` stETH
    function getWstETHByStETH(uint256 amount) external view returns (uint256) {
        return (amount * 1e18) / stETHPerToken;
    }

    /// @notice Simulate yield accrual by increasing the rate
    function setRate(uint256 newRate) external {
        stETHPerToken = newRate;
    }
}

// =============================================================================
//  MandalaStETHTreasury — Comprehensive Test Suite
// =============================================================================

contract MandalaStETHTreasuryTest is Test {

    // =========================================================================
    //  Contracts
    // =========================================================================

    MandalaPolicy        policy;
    MandalaAgentRegistry registry;
    MandalaTask          taskImpl;
    MandalaFactory       factory;
    MockWstETH           wstETH;
    MandalaStETHTreasury stethTreasury;

    // =========================================================================
    //  Actors
    // =========================================================================

    address admin       = makeAddr("admin");
    address treasury    = makeAddr("treasury");
    address human       = makeAddr("human");
    address coordinator = makeAddr("coordinator");
    address verifier    = makeAddr("verifier");
    address agent1      = makeAddr("agent1");
    address agent2      = makeAddr("agent2");
    address agent3      = makeAddr("agent3");
    address nobody      = makeAddr("nobody");

    // =========================================================================
    //  Constants
    // =========================================================================

    uint256 constant REWARD          = 0.05 ether;
    uint256 constant STAKE           = 0.001 ether;
    uint256 constant GATE_THRESHOLD  = 1 ether;
    uint256 constant FEE_BPS         = 100;           // 1%
    uint256 constant DISPUTE_WINDOW  = 1 hours;
    uint256 constant DEADLINE_OFFSET = 1 days;
    uint256 constant WSTETH_FUND     = 10 ether;      // wstETH to fund a task

    // =========================================================================
    //  setUp — deploy full Mandala stack + MockWstETH + StETH Treasury
    // =========================================================================

    function setUp() public {
        // --- Deploy core Mandala stack ---
        vm.startPrank(admin);

        policy   = new MandalaPolicy(admin, GATE_THRESHOLD, STAKE, treasury);
        registry = new MandalaAgentRegistry(admin, address(policy));
        taskImpl = new MandalaTask();
        factory  = new MandalaFactory(
            admin,
            address(taskImpl),
            address(registry),
            address(policy),
            treasury,
            FEE_BPS
        );

        registry.grantRole(keccak256("MANAGER_ROLE"), address(factory));
        policy.addHuman(human);

        vm.stopPrank();

        // --- Deploy mock wstETH ---
        wstETH = new MockWstETH();

        // --- Deploy stETH treasury (policy, registry, wstETH) ---
        stethTreasury = new MandalaStETHTreasury(
            address(policy),
            address(registry),
            address(wstETH)
        );

        // --- Fund actors with ETH ---
        vm.deal(coordinator, 100 ether);
        vm.deal(verifier,    10 ether);
        vm.deal(agent1,      10 ether);
        vm.deal(agent2,      10 ether);
        vm.deal(agent3,      10 ether);

        // --- Mint wstETH to coordinator ---
        wstETH.mint(coordinator, 100 ether);

        // --- Register all agents in the registry ---
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
    //  Helpers
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
            humanGateEnabled: false,
            reward:           0                    // ignored for ETH tasks
        });
    }

    /// @dev Deploy a standard ETH task via factory
    function _deployTask() internal returns (MandalaTask) {
        IMandalaFactory.DeployParams memory params = _defaultParams();
        vm.prank(coordinator);
        address taskAddr = factory.deployTask{value: REWARD}(params);
        return MandalaTask(payable(taskAddr));
    }

    /// @dev Deploy task, have 2 agents submit, select winner, finalize — returns (task, winner)
    function _deployAndFinalizeTask() internal returns (MandalaTask task, address winner) {
        task = _deployTask();

        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("a1-proof"), "ipfs://a1");

        vm.prank(agent2);
        task.submitProof{value: STAKE}(keccak256("a2-proof"), "ipfs://a2");

        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        vm.prank(verifier);
        task.selectWinner(agent1);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        task.finalize();

        winner = agent1;
    }

    /// @dev Deploy task, fast-forward past deadline, cancel it
    function _deployAndCancelTask() internal returns (MandalaTask task) {
        task = _deployTask();

        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        vm.prank(coordinator);
        task.cancel();
    }

    // =========================================================================
    //  TEST: fundTask — coordinator deposits wstETH for a task
    // =========================================================================

    function test_fundTask() public {
        MandalaTask task = _deployTask();

        uint256 coordBalBefore   = wstETH.balanceOf(coordinator);
        uint256 treasBalBefore   = wstETH.balanceOf(address(stethTreasury));

        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();

        // Coordinator's wstETH decreased by WSTETH_FUND
        assertEq(
            coordBalBefore - wstETH.balanceOf(coordinator),
            WSTETH_FUND,
            "Coordinator should have transferred wstETH"
        );

        // Treasury now holds the wstETH
        assertEq(
            wstETH.balanceOf(address(stethTreasury)) - treasBalBefore,
            WSTETH_FUND,
            "Treasury should hold the wstETH"
        );

        // Deposit record is correct
        IMandalaStETHTreasury.TaskDeposit memory dep = stethTreasury.getDeposit(address(task));
        assertEq(dep.depositor,      coordinator,  "Depositor should be coordinator");
        assertEq(dep.wstETHAmount,   WSTETH_FUND,  "wstETH amount should match");
        assertEq(dep.stETHAtDeposit, WSTETH_FUND,  "stETH at deposit should match (1:1 rate)");
        assertFalse(dep.claimed,                    "Should not be claimed yet");
    }

    // =========================================================================
    //  TEST: fundTask revert — only coordinator can fund
    // =========================================================================

    function test_fundTask_revert_notCoordinator() public {
        MandalaTask task = _deployTask();

        wstETH.mint(nobody, WSTETH_FUND);

        vm.startPrank(nobody);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        vm.expectRevert(IMandalaStETHTreasury.NotCoordinator.selector);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();
    }

    // =========================================================================
    //  TEST: fundTask revert — can't double-fund the same task
    // =========================================================================

    function test_fundTask_revert_alreadyFunded() public {
        MandalaTask task = _deployTask();

        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND * 2);
        stethTreasury.fundTask(address(task), WSTETH_FUND);

        vm.expectRevert(IMandalaStETHTreasury.TaskAlreadyFunded.selector);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();
    }

    // =========================================================================
    //  TEST: claimReward after finalize — winner gets full wstETH (with yield)
    // =========================================================================

    function test_claimReward_afterFinalize() public {
        // Step 1: Deploy task and fund it with wstETH
        MandalaTask task = _deployTask();

        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();

        // Step 2: Agents submit proofs
        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("a1-proof"), "ipfs://a1");

        vm.prank(agent2);
        task.submitProof{value: STAKE}(keccak256("a2-proof"), "ipfs://a2");

        // Step 3: Fast-forward past deadline, select winner
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(verifier);
        task.selectWinner(agent1);

        // Step 4: Simulate 10% yield accrual
        wstETH.setRate(1.1e18);

        // Step 5: Fast-forward past dispute window, finalize
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        task.finalize();

        // Step 6: Winner claims from stETH treasury
        uint256 winnerBalBefore = wstETH.balanceOf(agent1);

        vm.prank(agent1);
        stethTreasury.claimReward(address(task));

        uint256 winnerBalAfter = wstETH.balanceOf(agent1);

        // Winner receives the full wstETH deposit
        // The yield is embedded in the stETH value — same wstETH amount is now
        // worth 10% more in stETH terms
        assertEq(
            winnerBalAfter - winnerBalBefore,
            WSTETH_FUND,
            "Winner should receive the full wstETH deposit"
        );

        // Deposit marked as claimed
        IMandalaStETHTreasury.TaskDeposit memory dep = stethTreasury.getDeposit(address(task));
        assertTrue(dep.claimed, "Deposit should be marked as claimed");
    }

    // =========================================================================
    //  TEST: claimReward revert — non-winner can't claim
    // =========================================================================

    function test_claimReward_revert_notWinner() public {
        MandalaTask task = _deployTask();

        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();

        // Agents submit
        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("a1-proof"), "ipfs://a1");
        vm.prank(agent2);
        task.submitProof{value: STAKE}(keccak256("a2-proof"), "ipfs://a2");

        // Finalize with agent1 as winner
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(verifier);
        task.selectWinner(agent1);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        task.finalize();

        // Agent2 (loser) tries to claim
        vm.prank(agent2);
        vm.expectRevert(IMandalaStETHTreasury.NotWinner.selector);
        stethTreasury.claimReward(address(task));

        // Random address tries to claim
        vm.prank(nobody);
        vm.expectRevert(IMandalaStETHTreasury.NotWinner.selector);
        stethTreasury.claimReward(address(task));
    }

    // =========================================================================
    //  TEST: claimReward revert — can't claim before task is finalized
    // =========================================================================

    function test_claimReward_revert_notFinalized() public {
        MandalaTask task = _deployTask();

        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();

        // Agent1 submits but task is still Open
        vm.prank(agent1);
        task.submitProof{value: STAKE}(keccak256("a1-proof"), "ipfs://a1");

        // Try claiming while task is Open
        vm.prank(agent1);
        vm.expectRevert(IMandalaStETHTreasury.TaskNotFinalized.selector);
        stethTreasury.claimReward(address(task));

        // Move to Verifying state
        vm.prank(agent2);
        task.submitProof{value: STAKE}(keccak256("a2-proof"), "ipfs://a2");
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(verifier);
        task.selectWinner(agent1);

        // Try claiming while task is Verifying
        vm.prank(agent1);
        vm.expectRevert(IMandalaStETHTreasury.TaskNotFinalized.selector);
        stethTreasury.claimReward(address(task));
    }

    // =========================================================================
    //  TEST: refund after cancel — coordinator gets wstETH back
    // =========================================================================

    function test_refund_afterCancel() public {
        MandalaTask task = _deployTask();

        // Fund with wstETH
        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();

        // Fast-forward and cancel (no submissions)
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(coordinator);
        task.cancel();

        // Coordinator reclaims from treasury
        uint256 coordBalBefore = wstETH.balanceOf(coordinator);

        vm.prank(coordinator);
        stethTreasury.refund(address(task));

        uint256 coordBalAfter = wstETH.balanceOf(coordinator);

        assertEq(
            coordBalAfter - coordBalBefore,
            WSTETH_FUND,
            "Coordinator should get wstETH back on cancel"
        );

        // Deposit marked as claimed
        IMandalaStETHTreasury.TaskDeposit memory dep = stethTreasury.getDeposit(address(task));
        assertTrue(dep.claimed, "Deposit should be marked as claimed after refund");
    }

    // =========================================================================
    //  TEST: refund revert — can't refund active (non-cancelled) task
    // =========================================================================

    function test_refund_revert_notCancelled() public {
        MandalaTask task = _deployTask();

        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();

        // Task is still Open — refund should fail
        vm.prank(coordinator);
        vm.expectRevert(IMandalaStETHTreasury.TaskNotCancelled.selector);
        stethTreasury.refund(address(task));
    }

    // =========================================================================
    //  TEST: yield accrual — deposit wstETH, increase rate, verify yield
    // =========================================================================

    function test_yieldAccrual() public {
        MandalaTask task = _deployTask();

        // Fund at rate 1:1
        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();

        // At 1:1 rate, stETH value = WSTETH_FUND, so yield = 0
        uint256 yieldBefore = stethTreasury.getYieldAccrued(address(task));
        assertEq(yieldBefore, 0, "No yield initially at 1:1 rate");

        // Simulate 10% yield: rate goes from 1.0 to 1.1
        wstETH.setRate(1.1e18);

        // Now stETH value of 10 wstETH = 11 stETH, yield = 1 stETH
        uint256 yieldAfter = stethTreasury.getYieldAccrued(address(task));
        assertGt(yieldAfter, 0, "Yield should be positive after rate increase");

        // Expected yield: 10e18 * 1.1e18 / 1e18 - 10e18 = 1e18
        uint256 expectedYield = 1 ether;
        assertEq(yieldAfter, expectedYield, "Yield should be 10% of deposit in stETH terms");

        // Simulate 50% yield total
        wstETH.setRate(1.5e18);
        uint256 yieldBig = stethTreasury.getYieldAccrued(address(task));
        assertEq(yieldBig, 5 ether, "Yield should be 50% of deposit in stETH terms");
    }

    // =========================================================================
    //  TEST: zero yield — rate unchanged means no yield
    // =========================================================================

    function test_zeroYield() public {
        MandalaTask task = _deployTask();

        // Fund at rate 1:1
        vm.startPrank(coordinator);
        wstETH.approve(address(stethTreasury), WSTETH_FUND);
        stethTreasury.fundTask(address(task), WSTETH_FUND);
        vm.stopPrank();

        // No rate change — yield is 0
        uint256 yield0 = stethTreasury.getYieldAccrued(address(task));
        assertEq(yield0, 0, "Yield should be 0 when rate hasn't changed");

        // Even after time passes, no yield without rate change
        vm.warp(block.timestamp + 365 days);
        uint256 yieldLater = stethTreasury.getYieldAccrued(address(task));
        assertEq(yieldLater, 0, "Yield should still be 0 without rate change");

        // Non-funded task also returns 0
        MandalaTask task2 = _deployTask();
        uint256 yieldUnfunded = stethTreasury.getYieldAccrued(address(task2));
        assertEq(yieldUnfunded, 0, "Unfunded task should have 0 yield");
    }
}
