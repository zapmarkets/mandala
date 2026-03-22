// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMandalaStETHTreasury — Interface for the yield-bearing wstETH task treasury
/// @notice Allows coordinators to fund Mandala tasks with wstETH. While a task is
///         open, staking yield accrues passively. On finalization the winner claims
///         the original deposit plus all accrued yield. On cancellation the
///         coordinator reclaims the full balance.
interface IMandalaStETHTreasury {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    /// @notice Per-task deposit record.
    struct TaskDeposit {
        address depositor;          // coordinator who funded the task
        uint256 wstETHAmount;       // wstETH deposited
        uint256 stETHAtDeposit;     // stETH value of the deposit at funding time
        uint256 depositTimestamp;   // block.timestamp when funded
        bool    claimed;            // whether funds have been withdrawn
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a coordinator funds a task with wstETH.
    event TaskFunded(
        address indexed taskAddress,
        address indexed coordinator,
        uint256 wstETHAmount,
        uint256 stETHValue
    );

    /// @notice Emitted when the winner claims the reward + accrued yield.
    event RewardClaimed(
        address indexed taskAddress,
        address indexed winner,
        uint256 wstETHAmount,
        uint256 yieldInStETH
    );

    /// @notice Emitted when a coordinator reclaims funds from a cancelled task.
    event TaskRefunded(
        address indexed taskAddress,
        address indexed coordinator,
        uint256 wstETHAmount
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error TaskAlreadyFunded();
    error TaskNotFunded();
    error AlreadyClaimed();
    error NotCoordinator();
    error NotWinner();
    error TaskNotFinalized();
    error TaskNotCancelled();
    error ZeroAmount();
    error TooEarly();
    error InvalidTask();

    // -------------------------------------------------------------------------

    /// @notice Emitted when emergency withdrawal is executed after timeout.
    event EmergencyWithdraw(
        address indexed taskAddress,
        address indexed depositor,
        uint256 wstETHAmount
    );

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /// @notice Fund a MandalaTask with wstETH. Caller must be the task coordinator
    ///         and must have approved this contract for at least `amount` wstETH.
    /// @param taskAddress Address of the MandalaTask contract.
    /// @param amount      Amount of wstETH to deposit.
    function fundTask(address taskAddress, uint256 amount) external;

    /// @notice Claim the wstETH reward + accrued yield for a finalized task.
    ///         Only the pending winner of the task may call this.
    /// @param taskAddress Address of the finalized MandalaTask.
    function claimReward(address taskAddress) external;

    /// @notice Reclaim wstETH from a cancelled task. Only the original depositor
    ///         (coordinator) may call this.
    /// @param taskAddress Address of the cancelled MandalaTask.
    function refund(address taskAddress) external;

    /// @notice View the stETH-denominated yield accrued on a task's wstETH deposit.
    /// @param taskAddress Address of the MandalaTask.
    /// @return yieldStETH The additional stETH value earned since the deposit.
    function getYieldAccrued(address taskAddress) external view returns (uint256 yieldStETH);

    /// @notice View the deposit details for a task.
    /// @param taskAddress Address of the MandalaTask.
    /// @return deposit The TaskDeposit struct.
    function getDeposit(address taskAddress) external view returns (TaskDeposit memory deposit);

    /// @notice Emergency withdrawal for depositor if task never reaches terminal state.
    ///         Can only be called after EMERGENCY_TIMEOUT (365 days) from deposit.
    /// @param taskAddress Address of the MandalaTask.
    function emergencyWithdraw(address taskAddress) external;
}
