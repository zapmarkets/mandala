# Mandala Protocol — Audit Fixes

Companion to [audit-report.md](audit-report.md). The report describes the problems; this document describes the solutions.

**Audit Date:** March 21, 2026
**Fixes Applied:** March 21, 2026
**Tests Before:** 88 passing | **Tests After:** 113 passing (+25 new)

---

## CRITICAL (5 findings, 5 fixed)

### C-01 | Fee-on-Transfer Token Accounting Mismatch

**File:** `src/MandalaTask.sol` (initialize)
**Problem:** Task recorded `_config.reward` as the passed parameter value, but fee-on-transfer tokens deliver fewer tokens than requested. Task could become insolvent — unable to pay winner.
**Fix:** Added balance-delta pattern: measure `balanceOf` before and after `safeTransferFrom`, store actual received amount as `_config.reward`.
**Test:** `test_FeeOnTransferBalanceDelta` in MandalaEdgeCases.t.sol

### C-02 | Slashed Stakes Permanently Locked

**File:** `src/MandalaTask.sol` (_slashAndRefund)
**Problem:** Slashed agent's stake was zeroed in storage but ETH/tokens stayed in the task contract with no recovery path. Funds permanently locked.
**Fix:** Slashed stakes now transfer to `policy.treasury()`. Added `treasury()` getter to MandalaPolicy.
**Test:** `test_SlashedStakesToTreasury` in MandalaEdgeCases.t.sol

### C-03 | Verifier Can Reset Dispute Window Indefinitely

**File:** `src/MandalaTask.sol` (selectWinner)
**Problem:** `selectWinner()` could be called in both Open and Verifying states. Each call reset `winnerSelectedAt`, allowing a malicious verifier to prevent finalization forever.
**Fix:** Restricted `selectWinner()` to `TaskStatus.Open` only. Once a winner is selected, no re-selection.
**Test:** `test_SelectWinnerOnlyFromOpen` in MandalaEdgeCases.t.sol

### C-04 | Coordinator Can Cancel After Winner Selected

**File:** `src/MandalaTask.sol` (cancel)
**Problem:** `cancel()` was allowed in Verifying and Disputed states. Coordinator could cancel after a winner was selected, stealing back the reward despite agents doing work.
**Fix:** Restricted `cancel()` to `TaskStatus.Open` only. Once winner selected or dispute filed, cancellation blocked.
**Test:** `test_CancelBlockedAfterWinner` in MandalaEdgeCases.t.sol

### C-05 | Double-Counting in totalTasks Corrupts Reputation

**File:** `src/MandalaAgentRegistry.sol` (recordWin)
**Problem:** `recordWin()` incremented both `wins` and `totalTasks`. But `recordTaskParticipation()` already incremented `totalTasks` on submission. Winners got double-counted: an agent winning all 10 tasks showed 50% instead of 100%.
**Fix:** Removed `totalTasks` increment from `recordWin()`. Only `wins` is incremented.
**Test:** `test_ReputationScoreAccuracy` in MandalaAgentRegistry.t.sol

---

## HIGH (7 findings, 5 fixed, 2 acknowledged)

### H-01 | Dispute Against Non-Submitter Address

**File:** `src/MandalaTask.sol` (dispute)
**Problem:** No validation that the `against` address was an actual submitter. Disputing `address(0xdead)` would slash nothing but still cancel the task — a griefing vector.
**Fix:** Added check: `if (_submissions[against].agent == address(0)) revert InvalidWinner()`.
**Test:** `test_DisputeAgainstNonSubmitterReverts` in MandalaEdgeCases.t.sol

### H-02 | ERC20 Stake Return Can DoS Cancel/Finalize

**File:** `src/MandalaTask.sol` (_returnStake)
**Problem:** ERC20 `safeTransfer` reverts on failure. If any agent's address blocks token receipt, entire cancel/finalize reverts — all funds locked.
**Fix:** Wrapped ERC20 transfers in try/catch. Failed transfers credit `pendingWithdrawals[agent]` for pull-based withdrawal. Added `withdrawPending()` function.
**Test:** `test_ERC20FailedTransferFallsToPull` in MandalaEdgeCases.t.sol

### H-03 | No Deadline Enforcement on selectWinner

**File:** `src/MandalaTask.sol` (selectWinner)
**Problem:** Verifier could select a winner while the task was still accepting submissions, unfairly excluding agents who hadn't submitted yet.
**Fix:** Added `if (block.timestamp <= _config.deadline) revert DeadlineNotPassed()` check.
**Test:** `test_SelectWinnerBeforeDeadlineReverts` in MandalaEdgeCases.t.sol

### H-04 | Any Agent Can Deploy Tasks (acknowledged)

**File:** `src/MandalaFactory.sol` (deployTask)
**Status:** Acknowledged — by design. Any registered agent can coordinate tasks. The cancel restriction (C-04 fix) mitigates the griefing vector. Adding a coordinator role would reduce protocol openness.

### H-05 | resolveDispute Can Set Disqualified Agent as Winner

**File:** `src/MandalaTask.sol` (resolveDispute)
**Problem:** No check whether the chosen winner was disqualified. Human resolver could accidentally award a bad actor.
**Fix:** Added `if (_submissions[winner].disqualified) revert InvalidWinner()`.
**Test:** `test_ResolveDisputeDisqualifiedReverts` in MandalaEdgeCases.t.sol

### H-06 | Block Timestamp Manipulation (acknowledged)

**File:** `src/MandalaTask.sol`
**Status:** Acknowledged — inherent to all timestamp-based logic. The 48h default dispute window provides sufficient margin against L2 sequencer manipulation (~seconds).

### H-07 | Open receive() Allows Unrecoverable ETH Deposits

**File:** `src/MandalaTask.sol`, `src/MandalaFactory.sol`
**Problem:** Unguarded `receive()` accepted accidental ETH sends with no recovery mechanism.
**Fix:** Added guards: Task's `receive()` reverts unless called during initialize (reward deposit). Factory's `receive()` reverts unless called during deployTask.
**Test:** `test_AccidentalETHReverts` in MandalaEdgeCases.t.sol

---

## MEDIUM (6 findings, 6 fixed)

### M-01 | Unbounded _submitters Array — Gas DoS

**File:** `src/MandalaTask.sol` (submitProof)
**Problem:** No limit on submissions. Hundreds of submissions could exceed block gas limit during cancel/finalize loops.
**Fix:** Added `uint256 public constant MAX_SUBMISSIONS = 100` with revert on overflow.
**Test:** `test_MaxSubmissionsEnforced` in MandalaEdgeCases.t.sol

### M-02 | ERC20 Task Doesn't Reject msg.value

**File:** `src/MandalaTask.sol` (submitProof)
**Problem:** Sending ETH with an ERC20 stake silently locked the ETH in the contract.
**Fix:** Added `if (_config.token != address(0) && msg.value > 0) revert UnexpectedETH()`.
**Test:** `test_ERC20TaskRejectsETH` in MandalaEdgeCases.t.sol

### M-03 | threshold=0 Forces Human Gate on ALL Tasks

**File:** `src/MandalaPolicy.sol` (requiresHumanGate)
**Problem:** `value >= 0` is always true. Setting threshold to 0 unintentionally gates every task.
**Fix:** `if (humanGateThreshold == 0) return false;` — zero threshold disables the gate.
**Test:** `test_ZeroThresholdDisablesGate` in MandalaPolicy.t.sol

### M-04 | Missing Event in recordTaskParticipation

**File:** `src/MandalaAgentRegistry.sol` (recordTaskParticipation)
**Problem:** State change with no event. Off-chain indexers couldn't track participation.
**Fix:** Added `emit ReputationUpdated(agent, _agents[agent].wins, _agents[agent].disputes)` after incrementing totalTasks.
**Test:** `test_RecordParticipationEmitsEvent` in MandalaAgentRegistry.t.sol

### M-05 | Factory Uses Allowance as Transfer Amount

**File:** `src/MandalaFactory.sol` (_pullERC20Reward)
**Problem:** Infinite approvals would drain the caller's entire token balance instead of intended reward.
**Fix:** Added explicit `reward` parameter to DeployParams. Factory transfers exactly `params.reward` tokens.
**Test:** `test_ExplicitRewardParam` in MandalaFactory.t.sol

### M-06 | No Way to Revoke TASK_CONTRACT_ROLE

**File:** `src/MandalaAgentRegistry.sol`, `src/MandalaFactory.sol`
**Problem:** Completed/cancelled tasks permanently held TASK_CONTRACT_ROLE, able to manipulate reputation.
**Fix:** Added `revokeTaskRole(address task)` callable by admin. Tasks can also self-revoke after finalization.
**Test:** `test_RevokeTaskRole` in MandalaFactory.t.sol

---

## LOW (4 findings, 4 fixed)

### L-01 | Reputation Score Comment Mismatch

**File:** `src/MandalaAgentRegistry.sol` (reputationScore)
**Fix:** Updated comment to match actual logic: "wins * 100 / totalTasks (early return if zero)".

### L-02 | Dead stakedBalance Field

**File:** `src/libraries/TaskLib.sol` (AgentInfo struct)
**Fix:** Removed `stakedBalance` field from AgentInfo. Never written, never read.

### L-03 | No criteriaHash Validation

**File:** `src/MandalaTask.sol` (initialize)
**Fix:** Added `if (p.criteriaHash == bytes32(0)) revert InvalidCriteria()`.
**Test:** `test_ZeroCriteriaHashReverts` in MandalaTask.t.sol

### L-04 | Missing NatSpec

**File:** Multiple
**Fix:** Added NatSpec to `_returnStake`, `_returnLosingStakes`, `_slashAndRefund`, all view functions in MandalaTask, and MandalaPolicy public functions.

---

## Summary

| Severity | Found | Fixed | Acknowledged |
|----------|-------|-------|-------------|
| Critical | 5 | 5 | 0 |
| High | 7 | 5 | 2 |
| Medium | 6 | 6 | 0 |
| Low | 4 | 4 | 0 |
| **Total** | **22** | **20** | **2** |

The 2 acknowledged findings (H-04, H-06) are design decisions and L2 timing constraints respectively, not fixable at the contract level without trade-offs that reduce protocol utility.
