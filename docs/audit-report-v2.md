# Mandala Protocol - Smart Contract Security Audit Report v2

**Date:** March 22, 2026
**Auditor:** Claude Code Security Audit
**Scope:** All contracts in `src/` — with focus on new contracts: `MandalaStETHTreasury.sol`, ENS additions to `MandalaAgentRegistry.sol`, plus cross-contract re-review.
**Solidity:** ^0.8.24 (overflow-safe) | OpenZeppelin v5.x | MetaMask Delegation Framework
**Previous Audit:** v1 (March 21, 2026) — 22 findings, all fixed.

---

## Executive Summary

This audit covers the Mandala protocol's new yield-bearing wstETH treasury (`MandalaStETHTreasury.sol`), ENS identity additions to the agent registry (`MandalaAgentRegistry.sol`), and a cross-contract re-review of all existing contracts. The codebase shows strong improvement since v1 — all 22 prior findings have been remediated. The new treasury contract is well-structured with proper reentrancy guards, double-claim protection, and correct yield accounting.

This audit identified **0 Critical**, **2 High**, **5 Medium**, **4 Low**, and **4 Informational** findings.

### Finding Summary

| ID    | Severity      | Title                                                         | Contract                  |
|-------|---------------|---------------------------------------------------------------|---------------------------|
| H-01  | High          | Treasury funds permanently locked if task never reaches terminal state | MandalaStETHTreasury.sol  |
| H-02  | High          | No protocol pause check in Treasury operations                | MandalaStETHTreasury.sol  |
| M-01  | Medium        | No validation that taskAddress is a legitimate Mandala task   | MandalaStETHTreasury.sol  |
| M-02  | Medium        | ETH stake return failures are non-recoverable (asymmetry with ERC20) | MandalaTask.sol           |
| M-03  | Medium        | Unbounded ENS name string — no length limit on setENSName     | MandalaAgentRegistry.sol  |
| M-04  | Medium        | TASK_CONTRACT_ROLE never revoked after task completion         | MandalaFactory.sol / MandalaAgentRegistry.sol |
| M-05  | Medium        | Unbounded arrays in getAllAgents() and allTasks() views        | MandalaAgentRegistry.sol / MandalaFactory.sol |
| L-01  | Low           | Missing event emission on MandalaPolicy.setTreasury()         | MandalaPolicy.sol         |
| L-02  | Low           | No ENS name format validation                                 | MandalaAgentRegistry.sol  |
| L-03  | Low           | Misleading error in rescueERC20 status check                  | MandalaTask.sol           |
| L-04  | Low           | getYieldAccrued returns 0 after claim (not historical yield)  | MandalaStETHTreasury.sol  |
| I-01  | Informational | Yield is cosmetic — winner receives same wstETH amount regardless | MandalaStETHTreasury.sol  |
| I-02  | Informational | AllowanceEnforcer does not track transferFrom spending         | MandalaAllowanceEnforcer.sol |
| I-03  | Informational | Consider adding EIP-165 supportsInterface to Treasury          | MandalaStETHTreasury.sol  |
| I-04  | Informational | ENSNameSet event declared in contract body, not in interface   | MandalaAgentRegistry.sol  |

---

## HIGH FINDINGS

### H-01: Treasury Funds Permanently Locked if Task Never Reaches Terminal State

**File:** `src/MandalaStETHTreasury.sol` — `claimReward()` (L98), `refund()` (L128)
**Severity:** High

**Description:** The treasury's `claimReward()` requires `TaskStatus.Finalized` and `refund()` requires `TaskStatus.Cancelled`. If a task becomes stuck in an intermediate state (`Open`, `Verifying`, or `Disputed`) — for example, due to a bug in the task contract, a paused protocol that is never unpaused, or a coordinator/verifier that goes permanently offline — the deposited wstETH is locked forever. There is no timeout-based emergency withdrawal or admin rescue function.

Scenarios where this occurs:
1. Task is Open, deadline passes, but no verifier ever calls `selectWinner()` and coordinator never calls `cancel()` (coordinator key lost).
2. Task is in Verifying state but humanGate is enabled and no human ever calls `finalize()`.
3. Task is in Disputed state but no human resolves the dispute (human key lost or governance failure).

**Attack Scenario:**
1. Coordinator funds a task with 100 wstETH via the treasury.
2. The coordinator's private key is compromised/lost.
3. Task has submissions but no one calls cancel (only coordinator can).
4. Verifier selects winner, but humanGateEnabled prevents permissionless finalization.
5. All human role holders lose access or governance stalls.
6. 100 wstETH + all accrued yield locked permanently.

**Recommended Fix:** Add a time-locked emergency withdrawal that the depositor can trigger after a generous timeout (e.g., 365 days from deposit):

```solidity
uint256 public constant EMERGENCY_TIMEOUT = 365 days;

function emergencyWithdraw(address taskAddress) external nonReentrant {
    TaskDeposit storage dep = _deposits[taskAddress];
    if (dep.wstETHAmount == 0) revert TaskNotFunded();
    if (dep.claimed) revert AlreadyClaimed();
    if (msg.sender != dep.depositor) revert NotCoordinator();
    if (block.timestamp < dep.depositTimestamp + EMERGENCY_TIMEOUT) {
        revert TooEarly();
    }

    dep.claimed = true;
    uint256 payout = dep.wstETHAmount;
    IERC20(address(wstETH)).safeTransfer(dep.depositor, payout);
    emit EmergencyWithdraw(taskAddress, dep.depositor, payout);
}
```

---

### H-02: No Protocol Pause Check in Treasury Operations

**File:** `src/MandalaStETHTreasury.sol` — all external functions
**Severity:** High

**Description:** The treasury stores the `policy` address as an immutable but never checks `policy.isPaused()` before executing state-changing operations. Every other contract in the protocol (`MandalaTask`, `MandalaAgentRegistry`, `MandalaFactory`) enforces the `notPaused` modifier. This means during an emergency pause (e.g., discovered exploit, oracle manipulation), the treasury continues to operate — allowing funding, claiming, and refunding to proceed when the rest of the protocol is frozen.

This is especially dangerous because if a vulnerability is discovered in the task state machine, an attacker could exploit it to manipulate a task to `Finalized` status and then claim treasury funds even while the protocol is paused.

**Attack Scenario:**
1. Admin pauses the protocol due to a suspected exploit.
2. Attacker has already manipulated a task to `Finalized` (or does so via a non-paused path).
3. Attacker calls `claimReward()` on the treasury — succeeds because treasury ignores pause.
4. Funds drained despite emergency pause.

**Recommended Fix:** Add a `notPaused` modifier consistent with other contracts:

```solidity
modifier notPaused() {
    if (IMandalaPolicy(policy).isPaused()) revert PolicyPaused();
    _;
}

function fundTask(...) external nonReentrant notPaused { ... }
function claimReward(...) external nonReentrant notPaused { ... }
function refund(...) external nonReentrant notPaused { ... }
```

---

## MEDIUM FINDINGS

### M-01: No Validation That taskAddress Is a Legitimate Mandala Task

**File:** `src/MandalaStETHTreasury.sol` — `fundTask()` (L71), `claimReward()` (L98), `refund()` (L128)
**Severity:** Medium

**Description:** The treasury accepts any `taskAddress` and calls `IMandalaTask(taskAddress).getConfig()` and `.pendingWinner()` on it. There is no verification that the address was deployed by the `MandalaFactory` or is otherwise a legitimate Mandala task. A user could create a malicious contract that implements the `IMandalaTask` interface and returns arbitrary values.

While the immediate risk is limited (a user can only deposit and withdraw their own funds via a fake task), this creates several problems:
- Pollutes the treasury's deposit mapping with non-Mandala entries.
- A fake task contract could change its return values between calls (e.g., return `coordinator = attacker` during `fundTask`, then return `status = Finalized` and `pendingWinner = accomplice` during `claimReward`), enabling fund transfer between colluding parties while bypassing normal task mechanics.
- Makes it harder to audit/monitor treasury activity on-chain.

**Recommended Fix:** Add a factory registry check:

```solidity
IMandalaFactory public immutable factory;

// In fundTask:
require(factory.isDeployedTask(taskAddress), "Not a Mandala task");
```

Or store a set of valid task addresses populated by the factory.

---

### M-02: ETH Stake Return Failures Are Non-Recoverable (Asymmetry with ERC20)

**File:** `src/MandalaTask.sol` — `_returnStake()` (L376-401)
**Severity:** Medium

**Description:** When returning stakes to losing agents, the ERC20 path has a `pendingWithdrawals` fallback (H-02 from v1 audit), but the ETH path does not. If an ETH `.call{value}` fails (e.g., the agent is a smart contract wallet that has changed its receive logic, or a contract without a receive function), the stake is silently lost — only a `StakeSlashed` event is emitted, which is misleading since this is not a slash but a failed return.

```solidity
// ETH path — stake permanently lost on failure
(bool ok, ) = agent.call{value: stake}("");
if (!ok) {
    emit StakeSlashed(agent, stake);  // misleading event
    return;
}
```

**Attack Scenario:**
1. Agent submits proof from a contract that later self-destructs or changes receive behavior.
2. Task finalizes, _returnLosingStakes is called.
3. ETH transfer to agent fails — stake is zeroed in storage, ETH stays in contract.
4. No mechanism to recover (unless rescued by coordinator via rescueERC20, but that's for ERC20 only).

**Recommended Fix:** Add a `pendingWithdrawals` mechanism for ETH too, or implement a pull-based withdrawal pattern:

```solidity
if (!ok) {
    pendingWithdrawals[agent] += stake;
    return;
}
```

And update `claimPendingWithdrawal()` to support ETH:

```solidity
function claimPendingWithdrawal() external nonReentrant {
    uint256 amount = pendingWithdrawals[msg.sender];
    if (amount == 0) revert TaskLib.InsufficientStake();
    pendingWithdrawals[msg.sender] = 0;
    if (_config.token == address(0)) {
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TaskLib.TransferFailed();
    } else {
        IERC20(_config.token).safeTransfer(msg.sender, amount);
    }
    emit StakeReturned(msg.sender, amount);
}
```

---

### M-03: Unbounded ENS Name String — No Length Limit on setENSName

**File:** `src/MandalaAgentRegistry.sol` — `setENSName()` (L127)
**Severity:** Medium

**Description:** `setENSName()` accepts any `string calldata name` without a length limit. While the caller pays for gas, this has several implications:
- An agent could store a multi-KB string, consuming significant contract storage.
- Off-chain indexers (The Graph, etc.) that index `ENSNameSet` events or read `ensNames` mapping may choke on extremely large strings.
- Front-end applications that display ENS names could be vulnerable to XSS or rendering issues if they don't sanitize.
- Repeated calls overwrite the previous string but the storage slot retains the max gas cost of the longest string written.

**Recommended Fix:** Add a reasonable length limit:

```solidity
uint256 public constant MAX_ENS_NAME_LENGTH = 255;

function setENSName(string calldata name) external onlyRegistered(msg.sender) {
    if (bytes(name).length > MAX_ENS_NAME_LENGTH) revert ENSNameTooLong();
    ensNames[msg.sender] = name;
    emit ENSNameSet(msg.sender, name);
}
```

---

### M-04: TASK_CONTRACT_ROLE Never Revoked After Task Completion

**File:** `src/MandalaFactory.sol` (L121), `src/MandalaAgentRegistry.sol` (L105-118)
**Severity:** Medium

**Description:** When the factory deploys a task, it grants `TASK_CONTRACT_ROLE` via `agentRegistry.grantTaskRole(taskAddress)`. This role allows calling `recordWin()`, `recordDispute()`, and `recordTaskParticipation()` on the registry. However, this role is never revoked after the task reaches a terminal state (Finalized or Cancelled).

Over time, this means every deployed task contract permanently retains the ability to modify agent reputation. While task contracts are clones of a trusted implementation, this violates the principle of least privilege. If a vulnerability were found in the task implementation that allows calling these functions in unexpected states, all historical task contracts would be exploitable.

The `revokeTaskRole()` function exists on the registry but is never called automatically.

**Recommended Fix:** Either:
1. Call `agentRegistry.revokeTaskRole(address(this))` at the end of `finalize()` and `cancel()` in MandalaTask.
2. Or add a cleanup function callable by anyone that checks task status before revoking:

```solidity
function cleanupTaskRole(address taskAddress) external {
    TaskLib.TaskConfig memory cfg = IMandalaTask(taskAddress).getConfig();
    require(
        cfg.status == TaskLib.TaskStatus.Finalized ||
        cfg.status == TaskLib.TaskStatus.Cancelled,
        "Task still active"
    );
    _revokeRole(TASK_CONTRACT_ROLE, taskAddress);
}
```

---

### M-05: Unbounded Arrays in getAllAgents() and allTasks() Views

**File:** `src/MandalaAgentRegistry.sol` — `getAllAgents()` (L90), `src/MandalaFactory.sol` — `allTasks()` (L135)
**Severity:** Medium

**Description:** Both `getAllAgents()` and `allTasks()` return the entire array of addresses. As the protocol grows, these arrays will become unbounded and eventually exceed block gas limits for RPC `eth_call` operations, making them unusable. This affects:
- Front-end applications that enumerate all agents/tasks.
- Other contracts that call these view functions.
- Indexing services that rely on these for initial state sync.

**Recommended Fix:** Add paginated view functions:

```solidity
function getAgentsPaginated(uint256 offset, uint256 limit)
    external view returns (address[] memory)
{
    uint256 end = offset + limit;
    if (end > _agentList.length) end = _agentList.length;
    address[] memory page = new address[](end - offset);
    for (uint256 i = offset; i < end; i++) {
        page[i - offset] = _agentList[i];
    }
    return page;
}
```

---

## LOW FINDINGS

### L-01: Missing Event Emission on MandalaPolicy.setTreasury()

**File:** `src/MandalaPolicy.sol` — `setTreasury()` (L111-114)
**Severity:** Low

**Description:** The `setTreasury()` function updates the protocol treasury address but does not emit an event. All other state-changing admin functions in MandalaPolicy emit events (`HumanGateThresholdUpdated`, `MinStakeUpdated`, etc.). Missing this event makes it harder to track treasury address changes on-chain and in monitoring systems.

**Recommended Fix:**
```solidity
event TreasuryUpdated(address indexed newTreasury);

function setTreasury(address _treasury) external onlyRole(HUMAN_ROLE) {
    if (_treasury == address(0)) revert TaskLib.ZeroAddress();
    treasury = _treasury;
    emit TreasuryUpdated(_treasury);
}
```

---

### L-02: No ENS Name Format Validation

**File:** `src/MandalaAgentRegistry.sol` — `setENSName()` (L127)
**Severity:** Low

**Description:** The `setENSName()` function accepts any string, including empty strings, strings with invalid characters, or strings that don't conform to ENS naming conventions (e.g., containing uppercase letters, spaces, or special characters). While this is a display-only feature, allowing arbitrary strings reduces the usefulness of the ENS identity feature.

**Recommended Fix:** At minimum, reject empty strings. Optionally validate basic format:

```solidity
function setENSName(string calldata name) external onlyRegistered(msg.sender) {
    if (bytes(name).length == 0) revert EmptyENSName();
    // ... rest of function
}
```

Full ENS validation is complex and best done off-chain, but a basic non-empty check is worthwhile.

---

### L-03: Misleading Error in rescueERC20 Status Check

**File:** `src/MandalaTask.sol` — `rescueERC20()` (L457-462)
**Severity:** Low

**Description:** The `rescueERC20()` function reverts with `TaskLib.TaskNotOpen()` when the task is not in a terminal state (Finalized or Cancelled). The error name is misleading — it implies the task must be Open, when actually the function requires the task to be in a terminal state. This creates confusion during debugging and integration.

**Recommended Fix:** Use a more descriptive error:

```solidity
error TaskNotTerminal();

if (_config.status != TaskLib.TaskStatus.Finalized &&
    _config.status != TaskLib.TaskStatus.Cancelled) {
    revert TaskNotTerminal();
}
```

---

### L-04: getYieldAccrued Returns 0 After Claim (Not Historical Yield)

**File:** `src/MandalaStETHTreasury.sol` — `getYieldAccrued()` (L154-162)
**Severity:** Low

**Description:** After `claimReward()` or `refund()` is called, `dep.claimed` is set to `true` but `dep.wstETHAmount` is not zeroed. However, `getYieldAccrued()` still reads the deposit and computes yield based on the current exchange rate. This means after a claim, `getYieldAccrued()` returns a non-zero value that no longer corresponds to any held funds, which could confuse off-chain integrations.

**Recommended Fix:** Either zero out `wstETHAmount` on claim, or check `dep.claimed` in `getYieldAccrued()`:

```solidity
function getYieldAccrued(address taskAddress) external view returns (uint256 yieldStETH) {
    TaskDeposit memory dep = _deposits[taskAddress];
    if (dep.wstETHAmount == 0 || dep.claimed) return 0;
    // ... rest
}
```

---

## INFORMATIONAL FINDINGS

### I-01: Yield Is Cosmetic — Winner Receives Same wstETH Amount Regardless

**File:** `src/MandalaStETHTreasury.sol` — `claimReward()` (L98-125)
**Severity:** Informational

**Description:** The yield tracking in the treasury is purely for event/reporting purposes. The winner always receives `dep.wstETHAmount` (the original wstETH deposit). The "yield" is implicit in wstETH's rising exchange rate against stETH — the winner benefits because the same amount of wstETH is worth more stETH over time. The `yieldStETH` is only calculated for the `RewardClaimed` event emission.

This is actually correct behavior for wstETH (since it's non-rebasing), but should be clearly documented to avoid confusion. Users might expect the yield to be paid separately or in addition to the deposit.

**Recommendation:** Add NatSpec documentation clarifying that yield is implicit in wstETH's exchange rate and the payout amount equals the deposit amount in wstETH terms.

---

### I-02: AllowanceEnforcer Does Not Track transferFrom Spending

**File:** `src/MandalaAllowanceEnforcer.sol` — `beforeHook()` (L112-124)
**Severity:** Informational

**Description:** The spending tracker only catches `transfer(to, amount)` (selector `0xa9059cbb`) and `approve(spender, amount)` (selector `0x095ea7b3`). It does not track `transferFrom(from, to, amount)` (selector `0x23b872dd`). A delegated sub-agent could call `transferFrom` to move tokens without the spend being tracked against the allowance limit.

However, in practice this is limited because the delegation framework executes calls from the delegator's context, and `transferFrom` requires a prior `approve`. The existing `approve` tracking would catch the approval step.

**Recommendation:** Consider also tracking `transferFrom` for defense-in-depth:

```solidity
bytes4 private constant TRANSFER_FROM = bytes4(0x23b872dd);
// In the selector check:
if (selector == TRANSFER || selector == APPROVE || selector == TRANSFER_FROM) {
    // For transferFrom, amount is at offset 68 (after from and to addresses)
}
```

---

### I-03: Consider Adding EIP-165 supportsInterface to Treasury

**File:** `src/MandalaStETHTreasury.sol`
**Severity:** Informational

**Description:** The treasury implements `IMandalaStETHTreasury` but does not support EIP-165 interface detection. Adding this would allow other contracts and front-ends to verify they are interacting with a legitimate treasury implementation.

**Recommendation:** Inherit from `ERC165` and implement `supportsInterface()`.

---

### I-04: ENSNameSet Event Declared in Contract Body, Not in Interface

**File:** `src/MandalaAgentRegistry.sol` (L124), `src/interfaces/IMandalaAgentRegistry.sol`
**Severity:** Informational

**Description:** The `ENSNameSet` event is declared directly in the `MandalaAgentRegistry` contract (L124) rather than in the `IMandalaAgentRegistry` interface where all other events are declared. This inconsistency means tools that generate ABIs from the interface alone will miss this event.

**Recommendation:** Move the event declaration to `IMandalaAgentRegistry`:

```solidity
// In IMandalaAgentRegistry.sol
event ENSNameSet(address indexed agent, string name);
```

---

## Specific Question Answers

### MandalaStETHTreasury Deep Dive

| Question | Answer |
|----------|--------|
| Can yield calculations be manipulated? | **No.** Yield is derived from `wstETH.getStETHByWstETH()` which reads Lido's on-chain oracle. Manipulation would require compromising Lido's oracle — outside the protocol's threat model. |
| Can funds get locked if task is never finalized? | **Yes — see H-01.** No emergency withdrawal mechanism exists. |
| What happens if wstETH exchange rate decreases (slashing)? | **Handled gracefully.** L114-116: `yieldStETH = currentStETHValue > dep.stETHAtDeposit ? ... : 0`. The yield simply shows 0. The wstETH amount returned is unchanged. |
| Reentrancy on claimReward/refund? | **Protected.** Both use `nonReentrant` modifier from OpenZeppelin's ReentrancyGuard. State is updated (claimed = true) before external call (safeTransfer). |
| Can a coordinator fund a task they don't own? | **No.** L76-77: `getConfig()` is called on the task and `msg.sender` is checked against `cfg.coordinator`. |
| What if fundTask is called with amount=0? | **Handled.** L72: `if (amount == 0) revert ZeroAmount()`. |
| Is there a race between claimReward and refund? | **No.** They require mutually exclusive task states (Finalized vs Cancelled). Both also check `dep.claimed`. |
| Double-claim protection? | **Yes.** L101/L131: `if (dep.claimed) revert AlreadyClaimed()`. L119/L141: `dep.claimed = true` before transfer. |

### ENS in MandalaAgentRegistry

| Question | Answer |
|----------|--------|
| Can setENSName be griefed? | **Partially — see M-03.** Caller pays gas, but unbounded strings can affect indexers. |
| Input validation on ENS name format? | **None — see L-02.** Any string accepted, including empty. |

### Cross-Contract Re-Check

| Question | Answer |
|----------|--------|
| Treasury <-> Task <-> Factory interactions | Treasury correctly queries task state via IMandalaTask interface. Factory deploys and initializes tasks atomically. No circular dependencies. |
| Role escalation paths | No new escalation paths found. MANAGER_ROLE grants TASK_CONTRACT_ROLE but only to factory-deployed tasks. DEFAULT_ADMIN_ROLE can grant any role (by OZ design). |
| State machine integrity | Task state machine is sound: Open -> Verifying -> Finalized (happy path), with Disputed as a side-state from Verifying. Cancel only from Open. All transitions properly guarded. |

---

## Conclusion

The Mandala protocol v2 contracts are well-engineered with proper use of OpenZeppelin primitives, reentrancy guards, and access control. The new `MandalaStETHTreasury` is clean and handles wstETH accounting correctly. The two High findings (H-01: fund lock risk, H-02: missing pause check) should be addressed before mainnet deployment. The Medium findings represent hardening opportunities that reduce attack surface and improve operational safety.

**Risk Rating:** Low-Medium (assuming H-01 and H-02 are fixed before deployment)
