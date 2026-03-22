// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IMandalaPolicy } from "./interfaces/IMandalaPolicy.sol";
import { TaskLib } from "./libraries/TaskLib.sol";

/// @title MandalaPolicy
/// @notice Global protocol rules set by humans. All contracts check here.
/// @dev Humans hold HUMAN_ROLE. Deployer gets DEFAULT_ADMIN_ROLE.
contract MandalaPolicy is IMandalaPolicy, AccessControl, Pausable {

    bytes32 public constant HUMAN_ROLE   = keccak256("HUMAN_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    uint256 public humanGateThreshold;  // tasks with reward above this require human approval
    uint256 public minStakeRequired;    // protocol-wide minimum stake per submission
    address public treasury;

    mapping(address => bool) private _blacklisted;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address admin,
        uint256 _humanGateThreshold,
        uint256 _minStake,
        address _treasury
    ) {
        if (admin == address(0)) revert TaskLib.ZeroAddress();
        if (_treasury == address(0)) revert TaskLib.ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(HUMAN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);

        humanGateThreshold = _humanGateThreshold;
        minStakeRequired   = _minStake;
        treasury = _treasury;
    }

    // -------------------------------------------------------------------------
    // Reads
    // -------------------------------------------------------------------------

    function isPaused() external view returns (bool) {
        return paused();
    }

    function isHuman(address account) external view returns (bool) {
        return hasRole(HUMAN_ROLE, account);
    }

    function isBlacklisted(address agent) external view returns (bool) {
        return _blacklisted[agent];
    }

    function requiresHumanGate(uint256 value) external view returns (bool) {
        if (humanGateThreshold == 0) return false;
        return value >= humanGateThreshold;
    }

    // -------------------------------------------------------------------------
    // Writes -- HUMAN_ROLE or MANAGER_ROLE only
    // -------------------------------------------------------------------------

    function setHumanGateThreshold(uint256 threshold) external onlyRole(HUMAN_ROLE) {
        humanGateThreshold = threshold;
        emit HumanGateThresholdUpdated(threshold);
    }

    function setMinStake(uint256 minStake) external onlyRole(MANAGER_ROLE) {
        minStakeRequired = minStake;
        emit MinStakeUpdated(minStake);
    }

    function pause() external onlyRole(HUMAN_ROLE) {
        _pause();
        emit ProtocolPaused(msg.sender);
    }

    function unpause() external onlyRole(HUMAN_ROLE) {
        _unpause();
        emit ProtocolResumed(msg.sender);
    }

    function addHuman(address human) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (human == address(0)) revert TaskLib.ZeroAddress();
        _grantRole(HUMAN_ROLE, human);
        emit HumanAdded(human);
    }

    function removeHuman(address human) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(HUMAN_ROLE, human);
        emit HumanRemoved(human);
    }

    function blacklist(address agent) external onlyRole(HUMAN_ROLE) {
        _blacklisted[agent] = true;
        emit AgentBlacklisted(agent);
    }

    function whitelist(address agent) external onlyRole(HUMAN_ROLE) {
        _blacklisted[agent] = false;
        emit AgentWhitelisted(agent);
    }

    function setTreasury(address _treasury) external onlyRole(HUMAN_ROLE) {
        if (_treasury == address(0)) revert TaskLib.ZeroAddress();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
}
