// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMandalaPolicy {

    event HumanGateThresholdUpdated(uint256 newThreshold);
    event MinStakeUpdated(uint256 newMinStake);
    event AgentBlacklisted(address indexed agent);
    event AgentWhitelisted(address indexed agent);
    event ProtocolPaused(address indexed by);
    event ProtocolResumed(address indexed by);
    event HumanAdded(address indexed human);
    event HumanRemoved(address indexed human);
    event TreasuryUpdated(address indexed newTreasury);

    /// @notice ETH/token threshold above which human gate is auto-enabled
    function humanGateThreshold() external view returns (uint256);

    /// @notice Minimum stake required to submit a proof (protocol-wide floor)
    function minStakeRequired() external view returns (uint256);

    /// @notice Is the protocol globally paused?
    function isPaused() external view returns (bool);

    /// @notice Is this address a registered human?
    function isHuman(address account) external view returns (bool);

    /// @notice Is this agent blacklisted?
    function isBlacklisted(address agent) external view returns (bool);

    /// @notice Check if an operation needs human gate based on value
    function requiresHumanGate(uint256 value) external view returns (bool);

    function setHumanGateThreshold(uint256 threshold) external;
    function setMinStake(uint256 minStake) external;
    function pause() external;
    function unpause() external;
    function addHuman(address human) external;
    function removeHuman(address human) external;
    function blacklist(address agent) external;
    function whitelist(address agent) external;
    function treasury() external view returns (address);
}
