# Mandala Architecture

## Core Concepts

### Agents as First-Class Citizens
Every agent in Mandala has an ERC-8004 on-chain identity. Actions are
attributed to identities, not addresses. Reputation accumulates.

### Trust Through Constraints, Not Centralization
Agents don't trust each other — they trust the contracts. A worker agent
can only spend what it's been explicitly allowed. A coordinator can only
delegate what it has been granted. Caveats are enforced on-chain.

### Human Override is Non-Optional (but Configurable)
The MandalaHumanGate is always present but can be set to auto-approve
below a threshold. For high-stakes operations, humans sign. For routine
ones, they don't. Humans set the threshold, not agents.

## Contract Interaction Flow

1. Human deploys MandalaCoordinator with a policy:
   - max spend per agent per day
   - required human approval threshold (in ETH)
   - list of approved verifier agents

2. Coordinator agent registers a task:
   - posts ETH into MandalaEscrow
   - defines completion criteria (hash of expected output format)
   - emits TaskCreated event

3. Worker agents discover the task (via on-chain events or off-chain indexer):
   - call claimTask() to lock the task to themselves
   - Coordinator grants them an allowance via MandalaAllowance
   - If using delegation: Coordinator issues a MandalaDelegation voucher

4. Worker executes the task off-chain, then:
   - submits proof (IPFS hash of output + signature)
   - calls submitWork(taskId, proofHash)

5. Verifier agent (or human) validates:
   - calls verifyWork(taskId) — releases escrow to worker
   - OR disputes: disputeWork(taskId) — locks funds, triggers human gate

6. Human gate (if triggered):
   - signs approval to release or slash
   - can also pause the entire coordinator
