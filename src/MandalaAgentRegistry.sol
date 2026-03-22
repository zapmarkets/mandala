// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IMandalaAgentRegistry } from "./interfaces/IMandalaAgentRegistry.sol";
import { IMandalaPolicy } from "./interfaces/IMandalaPolicy.sol";
import { TaskLib } from "./libraries/TaskLib.sol";

/// @title MandalaAgentRegistry
/// @notice Global registry for AI agent identities, reputation, and stake.
///         Links each address to its ERC-8004 on-chain identity.
contract MandalaAgentRegistry is IMandalaAgentRegistry, AccessControl {

    bytes32 public constant TASK_CONTRACT_ROLE = keccak256("TASK_CONTRACT_ROLE");
    bytes32 public constant HUMAN_ROLE         = keccak256("HUMAN_ROLE");
    bytes32 public constant MANAGER_ROLE       = keccak256("MANAGER_ROLE");

    IMandalaPolicy public immutable policy;

    mapping(address => TaskLib.AgentInfo) private _agents;
    address[] private _agentList;

    /// @notice Optional ENS name set by each agent (ENS Identity track)
    mapping(address => string) public ensNames;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier notPaused() {
        if (policy.isPaused()) revert TaskLib.PolicyPaused();
        _;
    }

    modifier onlyRegistered(address agent) {
        if (_agents[agent].agentAddress == address(0)) revert TaskLib.AgentNotRegistered();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address admin, address _policy) {
        if (admin == address(0) || _policy == address(0)) revert TaskLib.ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(HUMAN_ROLE, admin);
        policy = IMandalaPolicy(_policy);
    }

    // -------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------

    /// @notice Any agent can self-register with their ERC-8004 identity hash
    function register(bytes32 erc8004Id, string calldata metadataURI) external notPaused {
        if (_agents[msg.sender].agentAddress != address(0)) revert TaskLib.AgentAlreadyRegistered();
        if (policy.isBlacklisted(msg.sender)) revert TaskLib.AgentSuspended();

        _agents[msg.sender] = TaskLib.AgentInfo({
            agentAddress:   msg.sender,
            erc8004Id:      erc8004Id,
            metadataURI:    metadataURI,
            totalTasks:     0,
            wins:           0,
            disputes:       0,
            suspended:      false,
            registeredAt:   block.timestamp
        });
        _agentList.push(msg.sender);
        emit AgentRegistered(msg.sender, erc8004Id);
    }

    // -------------------------------------------------------------------------
    // Reads
    // -------------------------------------------------------------------------

    function isRegistered(address agent) external view returns (bool) {
        return _agents[agent].agentAddress != address(0);
    }

    function isSuspended(address agent) external view returns (bool) {
        return _agents[agent].suspended || policy.isBlacklisted(agent);
    }

    function getAgent(address agent) external view returns (TaskLib.AgentInfo memory) {
        return _agents[agent];
    }

    function getAllAgents() external view returns (address[] memory) {
        return _agentList;
    }

    /// @notice Reputation score: wins * 100 / totalTasks (returns 0 if no tasks)
    function reputationScore(address agent) external view returns (uint256) {
        TaskLib.AgentInfo memory a = _agents[agent];
        if (a.totalTasks == 0) return 0;
        return (a.wins * 100) / a.totalTasks;
    }

    // -------------------------------------------------------------------------
    // Called by task contracts (TASK_CONTRACT_ROLE)
    // -------------------------------------------------------------------------

    function recordWin(address agent) external onlyRole(TASK_CONTRACT_ROLE) {
        _agents[agent].wins += 1;
        emit ReputationUpdated(agent, _agents[agent].wins, _agents[agent].disputes);
    }

    function recordDispute(address agent) external onlyRole(TASK_CONTRACT_ROLE) {
        _agents[agent].disputes += 1;
        emit ReputationUpdated(agent, _agents[agent].wins, _agents[agent].disputes);
    }

    function recordTaskParticipation(address agent) external onlyRole(TASK_CONTRACT_ROLE) {
        _agents[agent].totalTasks += 1;
        emit ReputationUpdated(agent, _agents[agent].wins, _agents[agent].disputes);
    }

    // -------------------------------------------------------------------------
    // ENS Identity (opt-in)
    // -------------------------------------------------------------------------

    event ENSNameSet(address indexed agent, string name);
    error ENSNameTooLong();

    /// @notice Registered agents can set their own ENS name for display
    function setENSName(string calldata name) external onlyRegistered(msg.sender) {
        if (bytes(name).length > 255) revert ENSNameTooLong();
        ensNames[msg.sender] = name;
        emit ENSNameSet(msg.sender, name);
    }

    /// @notice Get the on-chain ENS name for an agent
    function getENSName(address agent) external view returns (string memory) {
        return ensNames[agent];
    }

    // -------------------------------------------------------------------------
    // Human controls
    // -------------------------------------------------------------------------

    function suspend(address agent) external onlyRole(HUMAN_ROLE) {
        _agents[agent].suspended = true;
        emit AgentSuspended(agent, msg.sender);
    }

    function reinstate(address agent) external onlyRole(HUMAN_ROLE) {
        _agents[agent].suspended = false;
        emit AgentReinstated(agent, msg.sender);
    }

    /// @notice Called by factory to grant a freshly deployed task the TASK_CONTRACT_ROLE
    function grantTaskRole(address taskContract) external onlyRole(MANAGER_ROLE) {
        _grantRole(TASK_CONTRACT_ROLE, taskContract);
    }

    /// @notice Revoke TASK_CONTRACT_ROLE from a task contract
    function revokeTaskRole(address taskContract) external onlyRole(MANAGER_ROLE) {
        _revokeRole(TASK_CONTRACT_ROLE, taskContract);
    }
}
