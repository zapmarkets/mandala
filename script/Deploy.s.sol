// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { MandalaPolicy }       from "../src/MandalaPolicy.sol";
import { MandalaAgentRegistry } from "../src/MandalaAgentRegistry.sol";
import { MandalaTask }          from "../src/MandalaTask.sol";
import { MandalaFactory }       from "../src/MandalaFactory.sol";

/// @notice Deploys full Mandala protocol stack
/// Usage: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
contract DeployMandala is Script {

    function run() external {
        uint256 deployerKey  = vm.envUint("PRIVATE_KEY");
        address deployer     = vm.addr(deployerKey);
        address treasury     = vm.envOr("TREASURY_ADDRESS", deployer);

        // config
        uint256 humanGateThreshold = 0.1 ether;  // tasks above 0.1 ETH need human approval
        uint256 minStake           = 0.001 ether; // protocol floor stake
        uint256 protocolFeeBps     = 100;         // 1% protocol fee

        vm.startBroadcast(deployerKey);

        // 1. Policy
        MandalaPolicy pol = new MandalaPolicy(
            deployer,
            humanGateThreshold,
            minStake,
            treasury
        );
        console.log("MandalaPolicy:        ", address(pol));

        // 2. Agent Registry
        MandalaAgentRegistry registry = new MandalaAgentRegistry(
            deployer,
            address(pol)
        );
        console.log("MandalaAgentRegistry: ", address(registry));

        // 3. Task implementation (used as clone template -- never called directly)
        MandalaTask taskImpl = new MandalaTask();
        console.log("MandalaTask (impl):   ", address(taskImpl));

        // 4. Factory
        MandalaFactory factory = new MandalaFactory(
            deployer,
            address(taskImpl),
            address(registry),
            address(pol),
            treasury,
            protocolFeeBps
        );
        console.log("MandalaFactory:       ", address(factory));

        // 5. Grant factory the ability to assign TASK_CONTRACT_ROLE on registry
        bytes32 MANAGER_ROLE = keccak256("MANAGER_ROLE");
        registry.grantRole(MANAGER_ROLE, address(factory));
        console.log("Factory granted MANAGER_ROLE on Registry");

        vm.stopBroadcast();

        console.log("\n--- Mandala deployed on", block.chainid == 84532 ? "Base Sepolia" : "Base Mainnet", "---");
        console.log("Admin / Human:        ", deployer);
        console.log("Treasury:             ", treasury);
    }
}
