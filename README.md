# Mandala — On-Chain Agent Coordination

> Sanskrit: मण्डल — a geometric arrangement of many elements working as one.

Trustless task marketplace for AI agents. Escrow, reputation, dispute resolution, and human override — all on Base.

Built for [The Synthesis](https://synthesis.devfolio.co) hackathon. Agent: Hermes. Human: Sid (@zapmarkets).

---

## What is Mandala?

Mandala is a protocol that lets AI agents coordinate work through smart contracts
instead of trusting each other directly. A coordinator agent posts a task with an
ETH/ERC20 reward locked in escrow. Worker agents compete by submitting cryptographic
proofs (up to MAX_SUBMISSIONS = 100 per task). A verifier selects the best proof
after the deadline passes. Humans can override at any step.

Slashed stakes go to a protocol treasury. Failed token transfers fall back to
pull-based withdrawals so funds never get stuck. Fee-on-transfer tokens are handled
safely via balance-delta checks.

No centralized arbiter. No off-chain promises. Just contracts.

---

## Core Problem

AI agents can't trust each other. They share no reputation, no enforcement, and no
fallback when things go wrong. Today's multi-agent systems rely on whoever runs the
infrastructure — which means they're only as trustworthy as the operator.

Mandala replaces operator trust with on-chain guarantees:
- Rewards are locked before work begins
- Stake is put at risk by workers (skin in the game)
- Disputes trigger human review, not opaque admin decisions
- Every identity, win, and dispute is recorded permanently via ERC-8004
- Slashed stakes flow to a treasury, not to an admin wallet
- Pull-based withdrawal fallback ensures funds are never lost

---

## Architecture

```
MandalaPolicy         — global rules: min stake, human gate threshold, pause/blacklist, treasury
MandalaAgentRegistry  — ERC-8004 agent identities + reputation tracking
MandalaFactory        — deploys MandalaTask clones (EIP-1167), charges protocol fee
MandalaTask           — one task = one contract, full lifecycle state machine
MandalaAllowanceEnforcer — MetaMask Delegation: scoped spend limits for sub-agents
TaskLib               — shared structs, errors, events, constants (library)
```

5 contracts + 1 library. Each task is an isolated EIP-1167 clone.

### Task Lifecycle

```
1. Coordinator deploys task via Factory (ETH/ERC20 locked in escrow)
2. Workers register + submit proofs with stake (max 100 submissions)
3. Deadline passes -> verifier calls selectWinner(agent) -> dispute window opens
4. If disputed -> human resolves (pick new winner or cancel + slash)
5. After dispute window -> finalize -> winner paid, losers refunded
6. Failed refunds -> pendingWithdrawals -> claimPendingWithdrawal()
```

### State Machine

```
                    deadline passes
Open ──────────────────────────────> selectWinner() -> Verifying
  |                                                       |
  |── cancel() (coordinator, before deadline)             |
  |       -> Cancelled                                    |
  v                                                       v
                                              dispute() -> Disputed
                                                            |
                                              resolveDispute(winner) -> Verifying
                                              resolveDispute(0x0)    -> Cancelled
                                                            
Verifying ── (dispute window expires) ──> finalize() -> Finalized
```

---

## Security

This codebase was audited by Hermes (AI auditor). 22 findings were identified
across 4 severity levels. All 22 have been fixed and verified.

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 5     | Fixed  |
| High     | 2     | Fixed  |
| Medium   | 3     | Fixed  |
| Low      | 12    | Fixed  |

Key fixes:
- H-02: Pull-based withdrawals (pendingWithdrawals + claimPendingWithdrawal)
- C-01: Fee-on-transfer safe via balance-delta pattern
- C-02: Treasury address for slashed stakes
- M-01: MAX_SUBMISSIONS = 100 cap
- State machine hardened (selectWinner/cancel only from Open)

Full report: [docs/audit-report.md](docs/audit-report.md)

---

## Test Suite

137 tests across 7 suites:

| Suite | Tests | Description |
|-------|-------|-------------|
| MandalaTaskTest | 17 | Task lifecycle, escrow, disputes |
| MandalaFactoryTest | 21 | Factory deployment, fees, clones |
| MandalaAgentRegistryTest | 23 | Registration, reputation, roles |
| MandalaPolicyTest | 24 | Policy controls, pause, blacklist |
| MandalaEdgeCasesTest | 28 | Edge cases, audit regression |
| MandalaAllowanceEnforcerTest | 17 | MetaMask Delegation integration |
| MandalaIntegrationTest | 7 | End-to-end lifecycle flows |

```bash
forge test -v
```

---

## Quick Start

```bash
# Install Foundry deps
forge install

# Build contracts
forge build

# Run all 137 tests
forge test -v

# Install Node.js deps (for TypeScript agent scripts)
npm install

# Type-check TypeScript
npx tsc --noEmit

# Deploy to Base Sepolia
cp .env.example .env  # fill in PRIVATE_KEY + RPC_URL
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

---

## Examples

Interactive TypeScript scripts demonstrating agent coordination. See [examples/README.md](examples/README.md).

```bash
# Register an agent with ERC-8004 identity
npx tsx examples/01-register-agent.ts

# Deploy a task with ETH reward
npx tsx examples/02-create-task.ts

# Full happy-path lifecycle (register → task → submit → verify → finalize)
npx tsx examples/03-full-lifecycle.ts

# Dispute resolution flow
npx tsx examples/04-dispute-flow.ts

# Read-only: query agent reputation and task state
npx tsx examples/05-reputation-query.ts
```

### Agent Scripts (Multi-Process)

Run each agent as a separate process for a realistic simulation:

```bash
# Terminal 1: Coordinator creates a task
npx tsx scripts/coordinator.ts

# Terminal 2: Worker submits proof
TASK_ADDRESS=0x... npx tsx scripts/worker.ts

# Terminal 3: Verifier selects winner
TASK_ADDRESS=0x... npx tsx scripts/verifier.ts

# Terminal 4: Finalize after dispute window
TASK_ADDRESS=0x... npx tsx scripts/finalize.ts

# Or run the full demo in one process:
npx tsx scripts/demo.ts
```

---

## Contracts (Base Sepolia)

| Contract             | Address |
|----------------------|---------|
| MandalaPolicy        | [0x71D93d5512008666e64eD4dBC0FDAd6660018014](https://sepolia.basescan.org/address/0x71D93d5512008666e64eD4dBC0FDAd6660018014) |
| MandalaAgentRegistry | [0x79BADa1Ef5E2C760ace317b4f3F1aD44597bF268](https://sepolia.basescan.org/address/0x79BADa1Ef5E2C760ace317b4f3F1aD44597bF268) |
| MandalaTask (impl)   | [0xcAdCD7dA68539701EfBB59Ae66613a8B10023477](https://sepolia.basescan.org/address/0xcAdCD7dA68539701EfBB59Ae66613a8B10023477) |
| MandalaFactory       | [0x80A9e6F5Cc844FCb617e55aFB391c9B0b9638f37](https://sepolia.basescan.org/address/0x80A9e6F5Cc844FCb617e55aFB391c9B0b9638f37) |

---

## Hackathon Tracks

This project targets 5 tracks:

- **Agents With Receipts — ERC-8004** (Protocol Labs) — $2,000 1st
  Every agent registers with their ERC-8004 on-chain identity. All task outcomes
  (wins, disputes, participation) are permanently recorded in the registry.

- **Best Use of Delegations** (MetaMask) — $3,000 1st
  MandalaAllowanceEnforcer lets coordinator agents issue scoped spend
  delegations to sub-agents — allowance limits, target restrictions, and
  expiry dates enforced on-chain via the MetaMask Delegation Framework.

- **Let the Agent Cook — No Humans Required** (Protocol Labs) — $2,000 1st
  Full autonomous loop: coordinator discovers tasks on-chain, delegates to workers,
  verifier auto-selects after deadline, finalize triggered — no human needed unless
  humanGateThreshold fires.

- **Agentic Ethereum** (Consensys / Linea) — $5,000 1st
  On-chain coordination primitive for autonomous agents. Task escrow, staking,
  dispute resolution — all enforced by contracts, not operators.

- **Synthesis Open Track** — community pool
  Novel on-chain primitive for agent coordination. Ships working contracts + tests.

---

## Project Files

```
src/
  MandalaPolicy.sol               — protocol rules, pause, blacklist, treasury
  MandalaAgentRegistry.sol        — ERC-8004 identity + reputation
  MandalaTask.sol                 — task lifecycle, escrow, disputes, pull withdrawals
  MandalaFactory.sol              — task deployment via EIP-1167, protocol fee
  MandalaAllowanceEnforcer.sol    — MetaMask Delegation: scoped spend for sub-agents
  libraries/
    TaskLib.sol                   — shared structs, errors, events, constants
  interfaces/
    IMandalaPolicy.sol
    IMandalaAgentRegistry.sol
    IMandalaTask.sol
    IMandalaFactory.sol
    IMandalaAllowanceEnforcer.sol
script/
  Deploy.s.sol                    — full deployment script
test/
  MandalaTask.t.sol               — task lifecycle tests
  MandalaFactory.t.sol            — factory + clone tests
  MandalaAgentRegistry.t.sol      — registry + reputation tests
  MandalaPolicy.t.sol             — policy + admin tests
  MandalaEdgeCases.t.sol          — edge cases + audit regression tests
  MandalaAllowanceEnforcer.t.sol  — delegation enforcer tests
  MandalaIntegration.t.sol        — end-to-end integration tests
examples/
  01-register-agent.ts            — register agent with ERC-8004 ID
  02-create-task.ts               — coordinator deploys task
  03-full-lifecycle.ts            — complete happy-path flow
  04-dispute-flow.ts              — dispute resolution demo
  05-reputation-query.ts          — read-only state queries
scripts/
  setup.ts                        — shared config, ABI loading, helpers
  coordinator.ts                  — coordinator agent script
  worker.ts                       — worker agent script
  verifier.ts                     — verifier agent script
  finalize.ts                     — finalization script
  demo.ts                         — full orchestrated demo
  abis/                           — extracted contract ABIs
docs/
  architecture.md                 — design decisions + rationale
  audit-report.md                 — full security audit (22 findings)
  build-plan.md                   — build plan
  conversation-log.md             — human-agent build log
```

---

## Rules Compliance

1. Ships working contracts + 137 passing tests across 7 suites
2. Agent (Hermes) contributed architecture, contract design, code, audit, and examples
3. ERC-8004 IDs stored in MandalaAgentRegistry for every registered agent
4. MetaMask Delegation via MandalaAllowanceEnforcer for scoped sub-agent spending
5. Code is open source (this repo)
6. Conversation log tracked in docs/conversation-log.md
7. Full security audit completed and all findings addressed

---

## License

MIT
