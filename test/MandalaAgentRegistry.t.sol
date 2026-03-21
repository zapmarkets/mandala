// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { MandalaPolicy }        from "../src/MandalaPolicy.sol";
import { MandalaAgentRegistry } from "../src/MandalaAgentRegistry.sol";
import { TaskLib }              from "../src/libraries/TaskLib.sol";

contract MandalaAgentRegistryTest is Test {

    MandalaPolicy        pol;
    MandalaAgentRegistry registry;

    address admin    = makeAddr("admin");
    address human    = makeAddr("human");
    address nobody   = makeAddr("nobody");
    address agentA   = makeAddr("agentA");
    address agentB   = makeAddr("agentB");
    address manager  = makeAddr("manager");
    address taskContract = makeAddr("taskContract");

    uint256 constant GATE_THRESH = 0.1 ether;
    uint256 constant MIN_STAKE   = 0.001 ether;

    function setUp() public {
        vm.startPrank(admin);
        pol      = new MandalaPolicy(admin, GATE_THRESH, MIN_STAKE);
        registry = new MandalaAgentRegistry(admin, address(pol));

        pol.addHuman(human);

        // grant manager role
        registry.grantRole(keccak256("MANAGER_ROLE"), manager);
        // grant human role on registry
        registry.grantRole(keccak256("HUMAN_ROLE"), human);

        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    function test_constructorRevertsZeroAdmin() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaAgentRegistry(address(0), address(pol));
    }

    function test_constructorRevertsZeroPolicy() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaAgentRegistry(admin, address(0));
    }

    // -------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------

    function test_register() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        assertTrue(registry.isRegistered(agentA));
        assertFalse(registry.isSuspended(agentA));
    }

    function test_register_duplicateReverts() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        vm.prank(agentA);
        vm.expectRevert(TaskLib.AgentAlreadyRegistered.selector);
        registry.register(keccak256("a-8004-2"), "ipfs://a2");
    }

    function test_register_blacklistedReverts() public {
        vm.prank(human);
        pol.blacklist(agentA);

        vm.prank(agentA);
        vm.expectRevert(TaskLib.AgentSuspended.selector);
        registry.register(keccak256("a-8004"), "ipfs://a");
    }

    function test_register_pausedReverts() public {
        vm.prank(admin); // admin has HUMAN_ROLE on policy
        pol.pause();

        vm.prank(agentA);
        vm.expectRevert(TaskLib.PolicyPaused.selector);
        registry.register(keccak256("a-8004"), "ipfs://a");
    }

    // -------------------------------------------------------------------------
    // Views: isRegistered, isSuspended
    // -------------------------------------------------------------------------

    function test_isRegistered_false() public view {
        assertFalse(registry.isRegistered(agentA));
    }

    function test_isSuspended_blacklisted() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        vm.prank(human);
        pol.blacklist(agentA);

        assertTrue(registry.isSuspended(agentA));
    }

    function test_isSuspended_suspended() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        vm.prank(human);
        registry.suspend(agentA);

        assertTrue(registry.isSuspended(agentA));
    }

    // -------------------------------------------------------------------------
    // getAgent
    // -------------------------------------------------------------------------

    function test_getAgent() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        TaskLib.AgentInfo memory info = registry.getAgent(agentA);
        assertEq(info.agentAddress, agentA);
        assertEq(info.erc8004Id, keccak256("a-8004"));
        assertEq(info.metadataURI, "ipfs://a");
        assertEq(info.totalTasks, 0);
        assertEq(info.wins, 0);
        assertEq(info.disputes, 0);
        assertFalse(info.suspended);
        assertGt(info.registeredAt, 0);
    }

    // -------------------------------------------------------------------------
    // getAllAgents
    // -------------------------------------------------------------------------

    function test_getAllAgents() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");
        vm.prank(agentB);
        registry.register(keccak256("b-8004"), "ipfs://b");

        address[] memory agents = registry.getAllAgents();
        assertEq(agents.length, 2);
        assertEq(agents[0], agentA);
        assertEq(agents[1], agentB);
    }

    // -------------------------------------------------------------------------
    // reputationScore
    // -------------------------------------------------------------------------

    function test_reputationScore_zeroTasks() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        assertEq(registry.reputationScore(agentA), 0);
    }

    function test_reputationScore_afterWins() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        // Grant task role to taskContract to record wins
        vm.prank(manager);
        registry.grantTaskRole(taskContract);

        vm.startPrank(taskContract);
        registry.recordWin(agentA); // totalTasks=1, wins=1
        registry.recordTaskParticipation(agentA); // totalTasks=2
        vm.stopPrank();

        // score = 1 * 100 / 2 = 50
        assertEq(registry.reputationScore(agentA), 50);
    }

    // -------------------------------------------------------------------------
    // recordWin / recordDispute / recordTaskParticipation access control
    // -------------------------------------------------------------------------

    function test_recordWin_revert_unauthorized() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("TASK_CONTRACT_ROLE")
            )
        );
        registry.recordWin(agentA);
    }

    function test_recordDispute_revert_unauthorized() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("TASK_CONTRACT_ROLE")
            )
        );
        registry.recordDispute(agentA);
    }

    function test_recordTaskParticipation_revert_unauthorized() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("TASK_CONTRACT_ROLE")
            )
        );
        registry.recordTaskParticipation(agentA);
    }

    // -------------------------------------------------------------------------
    // suspend / reinstate
    // -------------------------------------------------------------------------

    function test_suspendAndReinstate() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        vm.prank(human);
        registry.suspend(agentA);
        assertTrue(registry.isSuspended(agentA));
        assertTrue(registry.getAgent(agentA).suspended);

        vm.prank(human);
        registry.reinstate(agentA);
        assertFalse(registry.getAgent(agentA).suspended);
    }

    function test_suspend_revert_nonHuman() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        registry.suspend(agentA);
    }

    function test_reinstate_revert_nonHuman() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        registry.reinstate(agentA);
    }

    // -------------------------------------------------------------------------
    // grantTaskRole
    // -------------------------------------------------------------------------

    function test_grantTaskRole() public {
        vm.prank(manager);
        registry.grantTaskRole(taskContract);
        assertTrue(registry.hasRole(keccak256("TASK_CONTRACT_ROLE"), taskContract));
    }

    function test_grantTaskRole_revert_nonManager() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("MANAGER_ROLE")
            )
        );
        registry.grantTaskRole(taskContract);
    }
}
