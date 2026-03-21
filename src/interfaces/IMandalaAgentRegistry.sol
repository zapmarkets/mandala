// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { TaskLib } from "../libraries/TaskLib.sol";

interface IMandalaAgentRegistry {

    event AgentRegistered(address indexed agent, bytes32 erc8004Id);
    event AgentSuspended(address indexed agent, address indexed by);
    event AgentReinstated(address indexed agent, address indexed by);
    event ReputationUpdated(address indexed agent, uint256 wins, uint256 disputes);
    event StakeDeposited(address indexed agent, uint256 amount);
    event StakeWithdrawn(address indexed agent, uint256 amount);
    event TaskParticipation(address indexed agent);

    function register(bytes32 erc8004Id, string calldata metadataURI) external;
    function isRegistered(address agent) external view returns (bool);
    function isSuspended(address agent) external view returns (bool);
    function getAgent(address agent) external view returns (TaskLib.AgentInfo memory);
    function recordWin(address agent) external;
    function recordDispute(address agent) external;
    function recordTaskParticipation(address agent) external;
    function grantTaskRole(address taskContract) external;
    function suspend(address agent) external;
    function reinstate(address agent) external;
    function revokeTaskRole(address taskContract) external;
}
