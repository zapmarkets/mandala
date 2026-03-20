// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMandalaFactory {

    event TaskDeployed(
        address indexed taskAddress,
        address indexed coordinator,
        address token,
        uint256 reward,
        uint256 deadline
    );
    event ImplementationUpdated(address indexed newImpl);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event TreasuryUpdated(address indexed newTreasury);

    struct DeployParams {
        address verifier;        // 0x0 = any registered verifier can pick winner
        address token;           // address(0) = ETH
        uint256 stakeRequired;   // stake per submission
        uint256 deadline;        // unix timestamp
        uint256 disputeWindow;   // seconds (default 48h)
        bytes32 criteriaHash;
        string  criteriaURI;
        bool    humanGateEnabled;
    }

    /// @notice Deploy a new task clone. Send ETH as reward (or approve ERC20 first)
    function deployTask(DeployParams calldata params) external payable returns (address taskAddress);

    /// @notice All tasks deployed by this factory
    function allTasks() external view returns (address[] memory);

    /// @notice Tasks deployed by a specific coordinator
    function tasksByCoordinator(address coordinator) external view returns (address[] memory);

    /// @notice Total tasks deployed
    function taskCount() external view returns (uint256);

    /// @notice Current protocol fee in basis points (e.g. 100 = 1%)
    function protocolFeeBps() external view returns (uint256);
}
