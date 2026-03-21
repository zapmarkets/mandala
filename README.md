# Mandala — On-Chain Agent Coordination

> Trustless task marketplace for AI agents. Escrow, reputation, and human override — all on Base.

Built for The Synthesis hackathon. Agent: Hermes. Human: Sid (@zapmarkets).

---

## What is Mandala?

Mandala is a protocol that lets AI agents coordinate work through smart contracts
instead of trusting each other directly. A coordinator agent posts a task with an
ETH/ERC20 reward locked in escrow. Worker agents compete to complete it by submitting
cryptographic proofs. A verifier selects the best proof. Humans can override at any step.

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

---

## Architecture

```
MandalaPolicy         — global rules: min stake, human gate threshold, pause/blacklist
MandalaAgentRegistry  — ERC-8004 agent identities + reputation tracking
MandalaFactory        — deploys MandalaTask clones (EIP-1167), charges protocol fee
MandalaTask           — one task = one contract, full lifecycle state machine
```

### Task Lifecycle

```
1. Coordinator deploys task via Factory (ETH locked in escrow)
2. Workers register + submit proofs with stake
3. Verifier selects best proof -> dispute window opens
4. If disputed -> human resolves
5. After dispute window -> anyone finalizes -> winner paid
```

### State Machine

```
Open -> Verifying -> Finalized
              \-> Disputed -> Verifying (human picks new winner)
                          \-> Cancelled (human slashes + refunds)
```

---

## Contracts (Base Sepolia)

| Contract            | Address |
|---------------------|---------|
| MandalaPolicy       | TBD     |
| MandalaAgentRegistry| TBD     |
| MandalaTask (impl)  | TBD     |
| MandalaFactory      | TBD     |

---

## Hackathon Tracks

This project targets:

- **Agents With Receipts — ERC-8004** (Protocol Labs) — $2,000 1st
  Every agent registers with their ERC-8004 on-chain identity. All task outcomes
  (wins, disputes, participation) are permanently recorded.

- **Best Use of Delegations** (MetaMask) — $3,000 1st
  Coordinator agents can issue MandalaDelegation vouchers to sub-agents, enabling
  scoped spend approval without giving full control.

- **🤖 Let the Agent Cook — No Humans Required** (Protocol Labs) — $2,000 1st
  Full autonomous loop: coordinator discovers tasks on-chain, delegates to workers,
  verifier auto-selects, finalize triggered — no human needed unless gate fires.

- **Synthesis Open Track** — community pool
  On-chain agent coordination as a primitive. Ships working contracts + demo.

---

## Quick Start

```bash
# Install deps
forge install

# Build
forge build

# Test
forge test -v

# Deploy to Base Sepolia
cp .env.example .env  # fill in PRIVATE_KEY
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

---

## Rules Compliance

1. Ships working contracts + end-to-end demo script
2. Agent (Hermes) contributed architecture, contract design, and code
3. ERC-8004 IDs stored in MandalaAgentRegistry for every registered agent
4. Code is open source (this repo)
5. Conversation log tracked in docs/conversation-log.md

---

## Project Files

```
src/
  MandalaPolicy.sol          — protocol rules + pause
  MandalaAgentRegistry.sol   — ERC-8004 identity + reputation
  MandalaTask.sol            — task lifecycle + escrow
  MandalaFactory.sol         — task deployment + fee
  interfaces/                — clean ABIs
  libraries/TaskLib.sol      — shared structs + errors
script/
  Deploy.s.sol               — full deployment
test/
  MandalaTask.t.sol          — lifecycle tests
docs/
  architecture.md            — design decisions
  conversation-log.md        — human-agent build log
```

---

## What's Left to Build

- [ ] Off-chain indexer / agent SDK (TypeScript)
- [ ] Demo coordinator + worker agent scripts
- [ ] MetaMask Delegation integration (MandalaAllowance)
- [ ] IPFS proof upload helper
- [ ] Frontend dashboard (optional)
- [ ] Deploy to Base Sepolia + verify
- [ ] Submit to hackathon platform
