// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { MandalaPolicy }        from "../src/MandalaPolicy.sol";
import { TaskLib }              from "../src/libraries/TaskLib.sol";

contract MandalaPolicyTest is Test {

    MandalaPolicy pol;

    address admin    = makeAddr("admin");
    address human    = makeAddr("human");
    address nobody   = makeAddr("nobody");
    address agent    = makeAddr("agent");

    uint256 constant GATE_THRESH = 0.1 ether;
    uint256 constant MIN_STAKE   = 0.001 ether;

    function setUp() public {
        vm.prank(admin);
        pol = new MandalaPolicy(admin, GATE_THRESH, MIN_STAKE, makeAddr("treasury"));

        // admin adds human
        vm.prank(admin);
        pol.addHuman(human);
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    function test_constructorSetsValues() public view {
        assertEq(pol.humanGateThreshold(), GATE_THRESH);
        assertEq(pol.minStakeRequired(), MIN_STAKE);
        assertTrue(pol.isHuman(admin));
        assertTrue(pol.isHuman(human));
        assertFalse(pol.isPaused());
    }

    function test_constructorRevertsZeroAdmin() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaPolicy(address(0), GATE_THRESH, MIN_STAKE, makeAddr("treasury"));
    }

    // -------------------------------------------------------------------------
    // humanGateThreshold getter/setter
    // -------------------------------------------------------------------------

    function test_setHumanGateThreshold() public {
        vm.prank(human);
        pol.setHumanGateThreshold(1 ether);
        assertEq(pol.humanGateThreshold(), 1 ether);
    }

    function test_setHumanGateThreshold_revert_nonHuman() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        pol.setHumanGateThreshold(1 ether);
    }

    // -------------------------------------------------------------------------
    // minStakeRequired getter/setter
    // -------------------------------------------------------------------------

    function test_setMinStake() public {
        vm.prank(admin); // admin has MANAGER_ROLE
        pol.setMinStake(0.01 ether);
        assertEq(pol.minStakeRequired(), 0.01 ether);
    }

    function test_setMinStake_revert_nonManager() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("MANAGER_ROLE")
            )
        );
        pol.setMinStake(0.01 ether);
    }

    // -------------------------------------------------------------------------
    // pause / unpause
    // -------------------------------------------------------------------------

    function test_pauseUnpause() public {
        assertFalse(pol.isPaused());

        vm.prank(human);
        pol.pause();
        assertTrue(pol.isPaused());

        vm.prank(human);
        pol.unpause();
        assertFalse(pol.isPaused());
    }

    function test_pause_revert_nonHuman() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        pol.pause();
    }

    function test_unpause_revert_nonHuman() public {
        vm.prank(human);
        pol.pause();

        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        pol.unpause();
    }

    // -------------------------------------------------------------------------
    // addHuman / removeHuman
    // -------------------------------------------------------------------------

    function test_addHuman() public {
        address newHuman = makeAddr("newHuman");
        assertFalse(pol.isHuman(newHuman));

        vm.prank(admin);
        pol.addHuman(newHuman);
        assertTrue(pol.isHuman(newHuman));
    }

    function test_addHuman_revert_zeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        pol.addHuman(address(0));
    }

    function test_addHuman_revert_nonAdmin() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                bytes32(0) // DEFAULT_ADMIN_ROLE
            )
        );
        pol.addHuman(makeAddr("x"));
    }

    function test_removeHuman() public {
        assertTrue(pol.isHuman(human));
        vm.prank(admin);
        pol.removeHuman(human);
        assertFalse(pol.isHuman(human));
    }

    function test_removeHuman_revert_nonAdmin() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                bytes32(0)
            )
        );
        pol.removeHuman(human);
    }

    // -------------------------------------------------------------------------
    // blacklist / whitelist
    // -------------------------------------------------------------------------

    function test_blacklistAndWhitelist() public {
        assertFalse(pol.isBlacklisted(agent));

        vm.prank(human);
        pol.blacklist(agent);
        assertTrue(pol.isBlacklisted(agent));

        vm.prank(human);
        pol.whitelist(agent);
        assertFalse(pol.isBlacklisted(agent));
    }

    function test_blacklist_revert_nonHuman() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        pol.blacklist(agent);
    }

    function test_whitelist_revert_nonHuman() public {
        vm.prank(nobody);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                nobody,
                keccak256("HUMAN_ROLE")
            )
        );
        pol.whitelist(agent);
    }

    // -------------------------------------------------------------------------
    // requiresHumanGate view
    // -------------------------------------------------------------------------

    function test_requiresHumanGate() public view {
        // threshold is 0.1 ether
        assertTrue(pol.requiresHumanGate(0.1 ether));
        assertTrue(pol.requiresHumanGate(1 ether));
        assertFalse(pol.requiresHumanGate(0.09 ether));
        assertFalse(pol.requiresHumanGate(0));
    }

    // -------------------------------------------------------------------------
    // isHuman view
    // -------------------------------------------------------------------------

    function test_isHuman_views() public view {
        assertTrue(pol.isHuman(admin));
        assertTrue(pol.isHuman(human));
        assertFalse(pol.isHuman(nobody));
    }

    // -------------------------------------------------------------------------
    // Treasury
    // -------------------------------------------------------------------------

    function test_treasury() public {
        assertEq(pol.treasury(), makeAddr("treasury"));
    }

    function test_setTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(human);
        pol.setTreasury(newTreasury);
        assertEq(pol.treasury(), newTreasury);
    }

    function test_setTreasury_revert_zero() public {
        vm.prank(human);
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        pol.setTreasury(address(0));
    }

    function test_constructorRevertsZeroTreasury() public {
        vm.expectRevert(TaskLib.ZeroAddress.selector);
        new MandalaPolicy(admin, GATE_THRESH, MIN_STAKE, address(0));
    }

    // -------------------------------------------------------------------------
    // M-03: humanGateThreshold == 0 disables gate
    // -------------------------------------------------------------------------

    function test_humanGateThresholdZeroDisablesGate() public {
        vm.prank(human);
        pol.setHumanGateThreshold(0);

        assertFalse(pol.requiresHumanGate(0));
        assertFalse(pol.requiresHumanGate(1 ether));
        assertFalse(pol.requiresHumanGate(1000 ether));
    }
}
