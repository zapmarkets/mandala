// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MandalaPolicy }        from "../src/MandalaPolicy.sol";
import { MandalaAgentRegistry } from "../src/MandalaAgentRegistry.sol";
import { TaskLib }              from "../src/libraries/TaskLib.sol";

contract MandalaENSTest is Test {

    MandalaPolicy        pol;
    MandalaAgentRegistry registry;

    address admin  = makeAddr("admin");
    address agentA = makeAddr("agentA");
    address nobody = makeAddr("nobody");

    function setUp() public {
        vm.startPrank(admin);
        pol      = new MandalaPolicy(admin, 0.1 ether, 0.001 ether, makeAddr("treasury"));
        registry = new MandalaAgentRegistry(admin, address(pol));
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // setENSName: happy path
    // -------------------------------------------------------------------------

    function test_setENSName() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        vm.prank(agentA);
        registry.setENSName("agent-a.eth");

        assertEq(registry.getENSName(agentA), "agent-a.eth");
        assertEq(registry.ensNames(agentA), "agent-a.eth");
    }

    // -------------------------------------------------------------------------
    // setENSName: revert if not registered
    // -------------------------------------------------------------------------

    function test_setENSName_revert_notRegistered() public {
        vm.prank(nobody);
        vm.expectRevert(TaskLib.AgentNotRegistered.selector);
        registry.setENSName("nobody.eth");
    }

    // -------------------------------------------------------------------------
    // setENSName: update existing name
    // -------------------------------------------------------------------------

    function test_setENSName_update() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        vm.prank(agentA);
        registry.setENSName("old.eth");
        assertEq(registry.getENSName(agentA), "old.eth");

        vm.prank(agentA);
        registry.setENSName("new.eth");
        assertEq(registry.getENSName(agentA), "new.eth");
    }

    // -------------------------------------------------------------------------
    // setENSName: emits event
    // -------------------------------------------------------------------------

    function test_setENSName_emitsEvent() public {
        vm.prank(agentA);
        registry.register(keccak256("a-8004"), "ipfs://a");

        vm.expectEmit(true, false, false, true);
        emit MandalaAgentRegistry.ENSNameSet(agentA, "agent-a.eth");

        vm.prank(agentA);
        registry.setENSName("agent-a.eth");
    }
}
