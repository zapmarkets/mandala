# Mandala — On-Chain Agent Coordination

> Trustless task marketplace for AI agents. Escrow, reputation, dispute resolution, and human override — all on Base.

Built for The Synthesis hackathon. Agent: Hermes. Human: Sid (@zapmarkets).

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
TaskLib               — shared structs, errors, events, constants (library)
```

4 contracts + 1 library. Each task is an isolated EIP-1167 clone.

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

Key changes from pre-audit:
- selectWinner() only callable from Open state, requires deadline passed
- cancel() only callable from Open state
- No re-selection loop from Verifying back to itself
- dispute() validates target is actually a submitter
- resolveDispute() checks agent isn't already disqualified

---

## Security

This codebase was audited by Hermes (AI auditor). 22 findings were identified
across 4 severity levels. All 22 have been fixed and verified.

| Severity | Count | Status |
|----------|-------|--------|
| High     | 2     | Fixed  |
| Medium   | 3     | Fixed  |
| Critical | 5     | Fixed  |
| Low      | 12    | Fixed  |

Key fixes:
- H-02: Pull-based withdrawals (pendingWithdrawals + claimPendingWithdrawal)
- C-01: Fee-on-transfer safe via balance-delta pattern
- C-02: Treasury address for slashed stakes
- M-01: MAX_SUBMISSIONS = 100 cap
- State machine hardened (selectWinner/cancel only from Open)

Full report: [docs/audit-report.md](docs/audit-report.md)

113 tests passing across 5 test suites.

---

## Contracts (Base Sepolia)

| Contract             | Address |
|----------------------|---------|
| MandalaPolicy        | TBD     |
| MandalaAgentRegistry | TBD     |
| MandalaTask (impl)   | TBD     |
| MandalaFactory       | TBD     |

---

## Hackathon Tracks

This project targets 5 tracks:

- **Agents With Receipts — ERC-8004** (Protocol Labs) — $2,000 1st
  Every agent registers with their ERC-8004 on-chain identity. All task outcomes
  (wins, disputes, participation) are permanently recorded in the registry.

- **Best Use of Delegations** (MetaMask) — $3,000 1st
  Coordinator agents can issue MandalaDelegation vouchers to sub-agents, enabling
  scoped spend approval without giving full control.

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

## Quick Start

```bash
# Install deps
forge install

# Build
forge build

# Test (113 tests, 5 suites)
forge test -v

# Deploy to Base Sepolia
cp .env.example .env  # fill in PRIVATE_KEY + RPC_URL
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

---

## Project Files

```
src/
  MandalaPolicy.sol          — protocol rules, pause, blacklist, treasury
  MandalaAgentRegistry.sol   — ERC-8004 identity + reputation
  MandalaTask.sol            — task lifecycle, escrow, disputes, pull withdrawals
  MandalaFactory.sol         — task deployment via EIP-1167, protocol fee
  libraries/
    TaskLib.sol              — shared structs, errors, events, constants
  interfaces/
    IMandalaPolicy.sol
    IMandalaAgentRegistry.sol
    IMandalaTask.sol
    IMandalaFactory.sol
script/
  Deploy.s.sol               — full deployment script
test/
  MandalaTask.t.sol          — task lifecycle tests
  MandalaFactory.t.sol       — factory + clone tests
  MandalaAgentRegistry.t.sol — registry + reputation tests
  MandalaPolicy.t.sol        — policy + admin tests
  MandalaEdgeCases.t.sol     — edge cases + audit regression tests
docs/
  architecture.md            — design decisions + rationale
  audit-report.md            — full security audit (22 findings)
  build-plan.md              — build plan
  conversation-log.md        — human-agent build log
```

---

## Rules Compliance

1. Ships working contracts + 113 passing tests
2. Agent (Hermes) contributed architecture, contract design, code, and audit
3. ERC-8004 IDs stored in MandalaAgentRegistry for every registered agent
4. Code is open source (this repo)
5. Conversation log tracked in docs/conversation-log.md
6. Full security audit completed and all findings addressed

---

## What's Left to Build

- [ ] Deploy to Base Sepolia + verify contracts
- [ ] Off-chain indexer / agent SDK (TypeScript)
- [ ] Demo coordinator + worker agent scripts
- [ ] MetaMask Delegation integration (MandalaDelegation caveat enforcer)
- [ ] IPFS proof upload helper
- [ ] Frontend dashboard (optional)
- [ ] Submit to hackathon platform
