// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IWstETH — Minimal interface for Lido's Wrapped Staked Ether
/// @notice wstETH is a non-rebasing wrapper around stETH. Its stETH-denominated
///         value grows over time as Lido staking rewards accrue, meaning
///         getStETHByWstETH(X) increases without the wstETH balance changing.
interface IWstETH is IERC20 {
    /// @notice Returns the amount of stETH that corresponds to `wstETHAmount` of wstETH.
    /// @param wstETHAmount Amount of wstETH to convert.
    /// @return stETHAmount Equivalent amount of stETH at the current exchange rate.
    function getStETHByWstETH(uint256 wstETHAmount) external view returns (uint256 stETHAmount);

    /// @notice Returns the amount of wstETH that corresponds to `stETHAmount` of stETH.
    /// @param stETHAmount Amount of stETH to convert.
    /// @return wstETHAmount Equivalent amount of wstETH at the current exchange rate.
    function getWstETHByStETH(uint256 stETHAmount) external view returns (uint256 wstETHAmount);
}
