# Mandala Architecture

Post-audit. 22 findings fixed. 137 tests passing across 7 suites.

---

## Core Concepts

### Agents as First-Class Citizens
Every agent in Mandala has an ERC-8004 on-chain identity. Actions are
attributed to identities, not addresses. Reputation accumulates on-chain.
No off-chain leaderboard. No trust-me-bro reputation.

### Trust Through Constraints, Not Centralization
Agents don't trust each other — they trust the contracts. A worker agent
can only spend what it's been explicitly allowed. A coordinator can only
delegate what it has been granted. Rewards are locked in escrow before
work begins. Stakes are slashed to a treasury, not to admin wallets.

### Human Override is Non-Optional (but Configurable)
The MandalaPolicy humanGateThreshold is always present but configurable.
Tasks above the threshold auto-enable human gate. For low-value tasks,
finalization is permissionless after the dispute window.

Setting humanGateThreshold = 0 disables the gate entirely. All tasks
finalize autonomously. This is the "let the agent cook" mode.

---

## Contract Interaction Flow

1. Human deploys MandalaFactory with a policy (min stake, human gate threshold,
   fee, treasury address).

2. Coordinator agent registers in MandalaAgentRegistry with their ERC-8004 id.

3. Coordinator deploys a task via MandalaFactory.deployTask():
   - ETH/ERC20 reward locked in fresh MandalaTask clone
   - Task defines: verifier, deadline, stake required, criteriaHash (must be non-zero)
   - For ERC20 tasks: explicit reward param in DeployParams, balance-delta check
   - Factory charges protocol fee, remainder goes to task escrow
   - Factory receive() guarded with _deploying flag (no accidental ETH)

4. Worker agents discover the task (on-chain events or indexer):
   - Each calls register() on registry if not already registered
   - Each calls submitProof(proofHash, evidenceURI) with required stake
   - Max 100 submissions per task (MAX_SUBMISSIONS)

5. After deadline passes, verifier reviews proofs:
   - Calls selectWinner(agent) — requires deadline passed, task in Open state
   - Moves task to Verifying state, dispute window opens (default 48h)
   - If verifier is address(0), any registered non-suspended agent can call

6. During dispute window, any registered agent or coordinator can:
   - Call dispute(against, reason) — validates target is a submitter
   - Moves to Disputed state
   - Human calls resolveDispute(winner) — checks disqualified status, moves to Verifying
   - Human calls resolveDispute(address(0)) — cancels, slashes disputed agent

7. After dispute window expires:
   - If humanGateEnabled: only a human can call finalize()
   - Otherwise: anyone can call finalize()
   - Winner gets reward + their stake back
   - Losers get their stakes back
   - Slashed agents' stakes go to treasury
   - Failed token transfers -> pendingWithdrawals (pull-based recovery)
   - Anyone can call claimPendingWithdrawal() to recover stuck funds

8. Cancel flow:
   - cancel() only callable from Open state (before winner selected)
   - Coordinator or admin can cancel
   - Reward returned to coordinator, stakes returned to workers
   - revokeTaskRole() cleans up registry permissions

---

## MetaMask Delegation — MandalaAllowanceEnforcer

MandalaAllowanceEnforcer.sol is a caveat enforcer built on the MetaMask
Delegation Framework. It enables hierarchical agent coordination with
scoped spending:

- A coordinator agent issues a signed delegation voucher to a sub-agent
- The delegation is scoped to:
  - Maximum spend per task
  - Allowed task types (by criteriaHash prefix)
  - Time window
- Sub-agent presents voucher on-chain; the enforcer validates the caveats
- The sub-agent can't exceed what the delegation explicitly permits

This enables hierarchical agent coordination with minimal trust. 17 tests
cover the full range of delegation enforcement scenarios.

---

## Key Design Decisions

### One Task = One Contract (EIP-1167 clones)
Each task gets its own isolated state. No shared storage bugs. No cross-task
reentrancy. Cheap to deploy via minimal proxy pattern (~$0.01 on Base).

### Stake = Skin in the Game
Workers must lock stake to submit. This deters spam submissions and gives
verifiers signal. Losing agents get stake back — only slashed if human
explicitly rules misconduct via resolveDispute.

### ERC-8004 Identity (not just addresses)
We store the ERC-8004 identity hash at registration, not just the wallet address.
An agent's reputation follows their on-chain identity across multiple wallets
or deployments. Permanent, composable, query-able on Base.

### Verifier is Optional
If verifier is set to address(0), any registered non-suspended agent can call
selectWinner(). This enables decentralized peer verification for tasks where
the coordinator trusts the ecosystem.

### Human Gate Threshold (configurable)
Tasks above the threshold require a human to call finalize(). This gives humans
a natural intervention point proportional to value at risk. Below the threshold,
the protocol runs fully autonomously.

Setting threshold = 0 disables the gate entirely. All tasks auto-finalize.

### Treasury for Slashed Stakes (C-02 fix)
Slashed stakes go to a dedicated treasury address set on MandalaPolicy, not to
the contract owner or admin. The treasury address is configurable via setTreasury().
This prevents admin enrichment from dispute outcomes.

### Pull-Based Withdrawals (H-02 fix)
ERC20 token transfers can fail (blacklisted addresses, paused tokens, etc).
Instead of reverting the entire finalize() transaction, failed transfers are
recorded in a pendingWithdrawals mapping. The affected party calls
claimPendingWithdrawal() to retry later.

Additionally, rescueERC20() allows recovery of tokens accidentally sent to
task contracts.

### MAX_SUBMISSIONS = 100 (M-01)
Without a cap, an attacker could submit thousands of proofs and make finalize()
exceed block gas limits (unbounded loop over submissions). The cap of 100 keeps
gas costs bounded and predictable.

### Fee-on-Transfer Safe (C-01)
ERC20 deposits use balance-delta pattern: check balance before transfer, transfer,
check balance after. The actual received amount is used, not the nominal amount.
This prevents accounting mismatches with fee-on-transfer or rebasing tokens.

---

## Reputation Score

```
reputation = (wins * 100) / totalTasks
```

Stored on-chain in MandalaAgentRegistry. Updated atomically when:
- A proof is submitted -> recordTaskParticipation() increments totalTasks
- A task is finalized -> recordWin() increments wins (once per task, not double-counted)
- A dispute is recorded -> recordDispute() increments disputes

Post-audit fix: recordWin() no longer double-increments totalTasks. Wins are
tracked separately from participation.

TASK_CONTRACT_ROLE is required to call these — only task clones deployed
by the factory can update registry state.

---

## Security Audit Summary

22 findings identified across the full codebase. All fixed.

| Severity | Count | Examples |
|----------|-------|---------|
| Critical | 5     | C-01 fee-on-transfer, C-02 treasury, C-03 state checks |
| High     | 2     | H-01 reentrancy, H-02 pull withdrawals |
| Medium   | 3     | M-01 MAX_SUBMISSIONS, M-02 criteriaHash, M-03 reward param |
| Low      | 12    | Input validation, event emissions, access control tightening |

Full report: [audit-report.md](audit-report.md)

---

## Tracks and Fit

| Track                             | How Mandala Fits |
|-----------------------------------|------------------|
| Agents With Receipts (ERC-8004)   | Registry links wallet to ERC-8004 id; all outcomes permanent on-chain |
| Best Use of Delegations (MetaMask)| MandalaAllowanceEnforcer — scoped spend caps for sub-agents, 17 tests |
| Let the Agent Cook (Protocol Labs)| Full autonomous loop — no human needed when threshold=0 |
| Agentic Ethereum (Consensys)      | On-chain coordination primitive: escrow, stake, disputes |
| Synthesis Open Track              | Novel agent coordination protocol. Ships contracts + 137 tests |
