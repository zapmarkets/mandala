# Mandala Protocol - Smart Contract Security Audit Report

**Date:** March 21, 2026
**Auditor:** Claude Code Security Audit
**Scope:** MandalaTask, MandalaFactory, MandalaAgentRegistry, MandalaPolicy, TaskLib, Interfaces, Deploy Script
**Solidity:** ^0.8.24 | OpenZeppelin v5.x | EIP-1167 Clones

---

## Executive Summary

The Mandala protocol implements a task marketplace where AI agents compete to complete tasks. Coordinators deploy task clones via a factory, agents submit proofs with stakes, verifiers pick winners, and a dispute mechanism provides human oversight. The audit identified **5 Critical**, **7 High**, **6 Medium**, **4 Low**, and **5 Informational** findings.

---

## CRITICAL FINDINGS

### C-01: Fee-on-Transfer Token Accounting Mismatch Causes Insolvency

**File:** `src/MandalaTask.sol` L117-119, `src/MandalaFactory.sol` L76-83
**Severity:** Critical

**Description:** The factory correctly handles fee-on-transfer tokens using a balance-delta pattern in `_pullERC20Reward()` (L161-171). However, it then deducts the protocol fee and passes `netReward` to the task's `initialize()`. The task's `initialize()` calls `safeTransferFrom(msg.sender, address(this), p.reward)` expecting to receive exactly `netReward` tokens. But if the token has a transfer fee, the task will receive fewer tokens than `_config.reward` records.

Later, when `finalize()` tries to pay `reward + winnerStake`, the contract may not have enough tokens, causing the transaction to revert and permanently locking all funds.

**Attack Scenario:**
1. Deploy task with a 1% fee-on-transfer token, 100 tokens reward
2. Factory receives ~99 tokens, deducts protocol fee (~1 token), sends ~98 to task
3. Task records `_config.reward = 98` but actually receives ~97 (another 1% fee)
4. Winner cannot be paid: `reward(98) + stake > actual_balance(97)` → revert
5. All stakes and rewards permanently locked

**Recommended Fix:** Use balance-delta pattern in `MandalaTask.initialize()`:
```solidity
uint256 before = IERC20(p.token).balanceOf(address(this));
IERC20(p.token).safeTransferFrom(msg.sender, address(this), p.reward);
uint256 received = IERC20(p.token).balanceOf(address(this)) - before;
_config.reward = received; // Use actual received amount
```

---

### C-02: Slashed Stakes Permanently Locked in Task Contract

**File:** `src/MandalaTask.sol` L381-410 (`_slashAndRefund`)
**Severity:** Critical

**Description:** When a dispute is resolved with `winner = address(0)`, `_slashAndRefund()` sets the disputed agent's stake to 0 and emits `StakeSlashed`, but the actual tokens/ETH remain in the contract. The code has a `TODO` comment at L392: "send slashed stake to protocol treasury (wired up via policy)". Since the task status is set to `Cancelled`, there is no mechanism to ever recover these funds.

**Proof of Concept:**
1. Agent submits proof with 1 ETH stake
2. Dispute is filed, human resolves with `winner = address(0)`
3. `_slashAndRefund()` zeros the stake in storage but ETH stays in contract
4. Contract is in Cancelled state — no function can extract the ETH
5. Funds permanently lost

**Recommended Fix:** Transfer slashed stake to treasury:
```solidity
if (slashedStake > 0) {
    address treasuryAddr = policy.treasury(); // Add to policy
    if (_config.token == address(0)) {
        (bool ok, ) = treasuryAddr.call{value: slashedStake}("");
        if (!ok) revert TaskLib.TransferFailed();
    } else {
        IERC20(_config.token).safeTransfer(treasuryAddr, slashedStake);
    }
    emit StakeSlashed(disputedAgainst, slashedStake);
}
```

---

### C-03: Verifier Can Indefinitely Reset Dispute Window (Griefing/Fund Lock)

**File:** `src/MandalaTask.sol` L180-196 (`selectWinner`)
**Severity:** Critical

**Description:** `selectWinner()` can be called when status is `Open` OR `Verifying` (L182-185). Each call resets `winnerSelectedAt = block.timestamp` (L192). A malicious or compromised verifier can repeatedly call `selectWinner()` to reset the dispute window indefinitely, preventing anyone from calling `finalize()` (which requires `block.timestamp > winnerSelectedAt + disputeWindow`).

This permanently locks all rewards and stakes since:
- `finalize()` can never be called (dispute window keeps resetting)
- `cancel()` requires coordinator and only works after deadline with submissions
- Even if coordinator cancels, the verifier could front-run with selectWinner

**Attack Scenario:**
1. Task has submissions, verifier selects winner
2. Just before dispute window expires, verifier calls `selectWinner(sameAgent)` again
3. Dispute window resets. Repeat forever.
4. Funds locked permanently (or until verifier stops)

**Recommended Fix:** Disallow re-selection once in Verifying state, or add a maximum number of re-selections:
```solidity
function selectWinner(address agent) external notPaused onlyVerifier {
    if (_config.status != TaskLib.TaskStatus.Open) revert TaskLib.TaskAlreadyFinalized();
    // Only allow selection from Open state
```
Or allow re-selection but don't reset the dispute window origin.

---

### C-04: Coordinator Can Cancel Task After Winner Selected, Stealing Reward

**File:** `src/MandalaTask.sol` L285-312 (`cancel`)
**Severity:** Critical

**Description:** The `cancel()` function only prevents cancellation when status is `Finalized` or `Cancelled` (L287-289). This means the coordinator can cancel a task that is in `Verifying` or `Disputed` state. A malicious coordinator could:
1. Deploy a task with a reward
2. Wait for agents to submit proofs and stake
3. After verifier selects a winner, cancel the task to get the reward back

The coordinator must wait for the deadline to pass if submissions exist, but for tasks with short deadlines this is easily exploitable.

**Attack Scenario:**
1. Coordinator deploys task with reward=10 ETH, deadline=1 hour
2. Agent submits proof with 1 ETH stake
3. Verifier selects agent as winner
4. After deadline passes, coordinator calls `cancel()` 
5. Coordinator gets 10 ETH reward back, agent gets stake back but loses earned reward
6. Agent did work for nothing

**Recommended Fix:** Prevent cancellation once a winner has been selected:
```solidity
function cancel() external nonReentrant notPaused onlyCoordinator {
    if (_config.status == TaskLib.TaskStatus.Finalized ||
        _config.status == TaskLib.TaskStatus.Cancelled ||
        _config.status == TaskLib.TaskStatus.Verifying ||
        _config.status == TaskLib.TaskStatus.Disputed
    ) revert TaskLib.TaskAlreadyFinalized();
```

---

### C-05: Double-Counting in Winner's totalTasks Corrupts Reputation

**File:** `src/MandalaTask.sol` L170, L268; `src/MandalaAgentRegistry.sol` L104-108, L115-117
**Severity:** Critical (Data Integrity) / High (Impact)

**Description:** When an agent submits a proof, `recordTaskParticipation()` increments `totalTasks` (L170 → Registry L116). When the agent wins, `recordWin()` increments BOTH `wins` AND `totalTasks` again (Registry L105-106). The winner's `totalTasks` is incremented twice for a single task, while losers only get it incremented once.

This corrupts the reputation score calculation: `(wins * 100) / totalTasks`. An agent who won all 10 tasks would show: `(10 * 100) / 20 = 50%` instead of the correct `100%`.

**Recommended Fix:** Remove `totalTasks` increment from `recordWin()`:
```solidity
function recordWin(address agent) external onlyRole(TASK_CONTRACT_ROLE) {
    _agents[agent].wins += 1;
    // Don't increment totalTasks here — already done in recordTaskParticipation
    emit ReputationUpdated(agent, _agents[agent].wins, _agents[agent].disputes);
}
```

---

## HIGH FINDINGS

### H-01: Dispute Can Be Filed Against Non-Submitter Address

**File:** `src/MandalaTask.sol` L202-220 (`dispute`)
**Severity:** High

**Description:** The `dispute()` function accepts any `against` address without validating it's a submitter. If someone disputes against a non-submitter, `_slashAndRefund()` will:
- Read `_submissions[against].stake` which is 0
- Slash 0 tokens (no actual punishment)
- Still cancel the task and refund coordinator

This enables griefing: any registered agent can dispute against `address(0xdead)` to force task cancellation.

**Recommended Fix:**
```solidity
function dispute(address against, string calldata reason) external notPaused {
    if (_submissions[against].agent == address(0)) revert TaskLib.InvalidWinner();
    // ... rest of function
```

---

### H-02: ERC20 Stake Return Can DoS Cancel and Finalize

**File:** `src/MandalaTask.sol` L363-379 (`_returnStake`), L299-301
**Severity:** High

**Description:** For ERC20 tokens, `_returnStake()` uses `safeTransfer()` (L376) which reverts on failure. If any agent's address is a contract that reverts on token receipt (e.g., a blacklisted USDC address), the entire `cancel()` or `_returnLosingStakes()` call will revert, blocking finalization for ALL participants.

Note: For ETH stakes, the code correctly handles this by catching the revert (L370-374). But the ERC20 path has no such protection.

**Attack Scenario:**
1. Malicious agent submits proof from a contract that reverts on ERC20 `transfer()`
2. When cancel/finalize tries to return this agent's stake, the whole tx reverts
3. No one can finalize or cancel the task — all funds locked

**Recommended Fix:** Use try/catch for ERC20 transfers or implement a pull-based withdrawal pattern:
```solidity
// Pull pattern: let agents claim their own stakes
mapping(address => uint256) public pendingWithdrawals;

function _returnStake(address agent) internal {
    uint256 stake = _submissions[agent].stake;
    if (stake == 0) return;
    _submissions[agent].stake = 0;
    
    if (_config.token == address(0)) {
        (bool ok, ) = agent.call{value: stake}("");
        if (!ok) { pendingWithdrawals[agent] += stake; }
    } else {
        try IERC20(_config.token).transfer(agent, stake) {} catch {
            pendingWithdrawals[agent] += stake;
        }
    }
}
```

---

### H-03: No Deadline Enforcement on selectWinner — Premature Winner Selection

**File:** `src/MandalaTask.sol` L180-196
**Severity:** High

**Description:** `selectWinner()` does not check if the deadline has passed. A verifier can select a winner while the task is still `Open` and accepting submissions. Agents who were about to submit would be unfairly excluded.

Combined with C-03 (verifier can call selectWinner while Verifying), the verifier can pick a winner before other agents have had a chance to submit.

**Recommended Fix:**
```solidity
function selectWinner(address agent) external notPaused onlyVerifier {
    if (_config.status != TaskLib.TaskStatus.Open) revert TaskLib.TaskAlreadyFinalized();
    if (block.timestamp <= _config.deadline) revert TaskLib.DeadlineNotPassed();
```

---

### H-04: Anyone Can Deploy Task via Factory Without Being a Legitimate Coordinator

**File:** `src/MandalaFactory.sol` L69-123 (`deployTask`)
**Severity:** High

**Description:** `deployTask()` requires the caller to be a registered, non-suspended agent (L73-74). However, this means ANY registered agent can deploy tasks and become a coordinator. There is no separate coordinator role. Combined with C-04, a malicious agent could deploy tasks, attract other agents' stakes, and then cancel to grief them.

Furthermore, the factory grants `TASK_CONTRACT_ROLE` (L117) to every deployed task, meaning every task can update any agent's reputation. A malicious coordinator-deployer could potentially manipulate reputation through crafted task interactions.

**Recommended Fix:** Consider adding a separate COORDINATOR_ROLE or requiring a minimum reputation score to deploy tasks.

---

### H-05: resolveDispute Can Set Winner to Disqualified Agent

**File:** `src/MandalaTask.sol` L227-240
**Severity:** High

**Description:** `resolveDispute()` checks that the winner has a submission (L234) but does NOT check if the winner is disqualified. A human resolver could accidentally (or maliciously) set a disqualified agent as the winner.

**Recommended Fix:**
```solidity
if (_submissions[winner].disqualified) revert TaskLib.InvalidWinner();
```

---

### H-06: Dispute Window Can Be Bypassed via Block Timestamp Manipulation

**File:** `src/MandalaTask.sol` L208, L250
**Severity:** High (on some chains)

**Description:** The dispute window check uses `block.timestamp` which validators/sequencers can manipulate within bounds. On L2s like Base (Optimism-based), the sequencer has more control over timestamps. A colluding sequencer+verifier could:
1. Select winner
2. Manipulate timestamp to skip dispute window
3. Immediately finalize

For typical L1 this is ~12 second manipulation (low risk), but on L2s with centralized sequencers, this is higher risk.

**Recommended Fix:** Use block numbers instead of timestamps for dispute windows, or ensure dispute windows are long enough (48h default is reasonable).

---

### H-07: Open receive() Allows Accidental ETH Deposits That Are Unrecoverable

**File:** `src/MandalaTask.sol` L416, `src/MandalaFactory.sol` L182
**Severity:** High

**Description:** Both MandalaTask and MandalaFactory have unguarded `receive() external payable {}` functions. Any ETH accidentally sent to these contracts (outside of proper function calls) will be permanently stuck. For tasks, this extra ETH won't be distributed to anyone since `finalize()` only pays `_config.reward + winnerStake`.

**Recommended Fix:** Remove `receive()` from MandalaTask or add a rescue function. For the factory, restrict receive to only accept ETH during deployTask calls.

---

## MEDIUM FINDINGS

### M-01: Unbounded _submitters Array — DoS via Gas Limit

**File:** `src/MandalaTask.sol` L299-301, L354-361, L395-399
**Severity:** Medium

**Description:** The `_submitters` array grows unboundedly. Functions `cancel()`, `_returnLosingStakes()`, `_slashAndRefund()`, and `getSubmissions()` iterate over the entire array. If enough agents submit (hundreds/thousands), these functions will exceed the block gas limit, making finalization, cancellation, and dispute resolution impossible.

**Attack Scenario:** Attacker registers many agents, each submits minimal proof with minimal stake. When the task tries to finalize, the loop over _submitters exceeds gas limit.

**Recommended Fix:** Add a maximum submission count, or implement batched processing:
```solidity
uint256 public constant MAX_SUBMISSIONS = 100;
// In submitProof:
if (_submitters.length >= MAX_SUBMISSIONS) revert TooManySubmissions();
```

---

### M-02: ERC20 Task Doesn't Verify msg.value == 0

**File:** `src/MandalaTask.sol` L128-172 (`submitProof`)
**Severity:** Medium

**Description:** When submitting proof for an ERC20 task, the function doesn't verify that `msg.value == 0`. If an agent accidentally sends ETH along with an ERC20 stake, that ETH is permanently locked in the task contract.

**Recommended Fix:**
```solidity
if (_config.token != address(0) && msg.value > 0) revert UnexpectedETH();
```

---

### M-03: humanGateThreshold = 0 Forces Human Gate on ALL Tasks

**File:** `src/MandalaPolicy.sol` L57-59
**Severity:** Medium

**Description:** `requiresHumanGate()` returns `value >= humanGateThreshold`. If threshold is 0, ALL tasks (even with reward=1 wei) require human gate, potentially creating a bottleneck. The deploy script sets it to 0.1 ether, but any admin could set it to 0.

**Recommended Fix:** Document this behavior clearly or add a boolean to disable human gate entirely:
```solidity
function requiresHumanGate(uint256 value) external view returns (bool) {
    if (humanGateThreshold == 0) return false; // Disabled
    return value >= humanGateThreshold;
}
```

---

### M-04: Missing Event Emission in recordTaskParticipation

**File:** `src/MandalaAgentRegistry.sol` L115-117
**Severity:** Medium

**Description:** `recordTaskParticipation()` modifies state (`totalTasks`) but doesn't emit any event, unlike `recordWin()` and `recordDispute()`. Off-chain indexers won't be able to track participation.

**Recommended Fix:** Emit `ReputationUpdated` or a new `TaskParticipation` event.

---

### M-05: Factory _pullERC20Reward Uses Allowance as Transfer Amount

**File:** `src/MandalaFactory.sol` L161-171
**Severity:** Medium

**Description:** `_pullERC20Reward()` reads `allowance` and transfers the full allowance amount. If a user has previously approved the factory for a larger amount (e.g., `type(uint256).max` infinite approval), the factory will attempt to transfer their entire balance. The `DeployParams` struct doesn't include a reward amount for ERC20 tasks — it's inferred from allowance.

**Attack Scenario:** User sets infinite approval for convenience. Next task deployment pulls their entire token balance instead of intended reward amount.

**Recommended Fix:** Add an explicit `reward` field to `DeployParams` and use it:
```solidity
struct DeployParams {
    // ... existing fields
    uint256 reward; // Explicit reward amount for ERC20 tasks
}
```

---

### M-06: No Way to Revoke TASK_CONTRACT_ROLE from Completed/Cancelled Tasks

**File:** `src/MandalaAgentRegistry.sol` L134-136, `src/MandalaFactory.sol` L117
**Severity:** Medium

**Description:** Every deployed task permanently holds `TASK_CONTRACT_ROLE`. Completed or cancelled tasks can still call `recordWin()`, `recordDispute()`, `recordTaskParticipation()`. While the task's internal state machine should prevent this, a vulnerability in any task could allow reputation manipulation of any agent.

Over time, the number of addresses with TASK_CONTRACT_ROLE grows unboundedly.

**Recommended Fix:** Add a mechanism to revoke TASK_CONTRACT_ROLE after task finalization, or have task functions check their own status before calling registry.

---

## LOW FINDINGS

### L-01: Reputation Score Comment Mismatch

**File:** `src/MandalaAgentRegistry.sol` L93-98
**Severity:** Low

**Description:** The comment says "wins * 100 / (totalTasks + 1) to avoid div by zero" but the code uses `a.totalTasks` without the `+ 1`. The early return on L96 (`if (a.totalTasks == 0) return 0`) prevents div-by-zero, making the `+ 1` unnecessary but the comment misleading.

---

### L-02: AgentInfo.stakedBalance Never Updated

**File:** `src/libraries/TaskLib.sol` L59, `src/MandalaAgentRegistry.sol`
**Severity:** Low

**Description:** The `AgentInfo` struct has a `stakedBalance` field that is initialized to 0 and never updated anywhere in the codebase. This is dead state that wastes storage and could mislead integrators.

**Recommended Fix:** Either remove the field or implement stake tracking in the registry.

---

### L-03: No Input Validation on criteriaHash and criteriaURI

**File:** `src/MandalaTask.sol` L89-120
**Severity:** Low

**Description:** `initialize()` doesn't validate that `criteriaHash` is non-zero or `criteriaURI` is non-empty. Tasks can be created with no criteria, which defeats the purpose of the verification system.

---

### L-04: Missing Zero-Address Check for verifier Parameter

**File:** `src/MandalaTask.sol` L89-120
**Severity:** Low

**Description:** While `address(0)` for verifier is a valid configuration (means "any registered agent can verify"), this should be explicitly documented in the initialize function, as it significantly changes the security model of the task.

---

## INFORMATIONAL FINDINGS

### I-01: Consider Using OpenZeppelin's Initializable Guard for ReentrancyGuard in Clones

**Description:** The `MandalaTask` contract inherits both `Initializable` and `ReentrancyGuard`. For EIP-1167 clones, the constructor doesn't run, so `ReentrancyGuard`'s `_status` starts at 0 instead of `NOT_ENTERED` (1). In OZ v5, this works because the check is `_status == ENTERED` (2), but it's an implicit dependency on implementation details.

**Recommendation:** Use `ReentrancyGuardUpgradeable` from `@openzeppelin/contracts-upgradeable` which is designed for proxy patterns.

---

### I-02: Consider Adding Emergency Withdrawal Function

**Description:** There is no emergency withdrawal mechanism for stuck funds. If a bug locks funds in a task contract, there's no way to recover them. Consider adding a time-locked emergency withdrawal that can be triggered by the protocol admin after a long delay (e.g., 90 days after task creation).

---

### I-03: Factory Does Not Validate agentRegistry and policy Are Contracts

**File:** `src/MandalaFactory.sol` L39-61
**Description:** Constructor checks for `address(0)` but not that the addresses contain code. Passing an EOA would create a factory that reverts on every `deployTask()` call.

**Recommendation:** Add `address.code.length > 0` checks.

---

### I-04: Missing NatSpec Documentation

**Description:** Several functions lack NatSpec comments, particularly:
- `_returnStake()`, `_returnLosingStakes()`, `_slashAndRefund()`
- All view functions in MandalaTask
- Most MandalaPolicy functions

---

### I-05: Consider Using Custom Errors Instead of Shared Library Errors

**Description:** All contracts share errors from `TaskLib`. While this saves code size, it makes it harder to identify which contract emitted an error. Consider contract-specific errors for better debugging.

---

## Summary of Risk Distribution

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 5 | Fund loss, permanent locks, state manipulation, data corruption |
| High | 7 | DoS, access control, timing attacks, griefing |
| Medium | 6 | Gas limits, missing events, design issues |
| Low | 4 | Documentation, dead code, missing validation |
| Info | 5 | Best practices, upgradability |

## Priority Recommendations

1. **Immediate:** Fix C-01 (fee-on-transfer), C-02 (locked slashed stakes), C-03 (dispute window reset), C-04 (cancel after winner)
2. **Before Launch:** Fix all High findings, especially H-01 (dispute validation), H-02 (ERC20 DoS), H-03 (premature winner)
3. **Pre-Audit:** Address Medium findings, add comprehensive test suite covering edge cases
4. **Ongoing:** Improve documentation, consider formal verification for fund flow invariants
