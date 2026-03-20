# Mandala

> Sanskrit: मण्डल — a geometric arrangement of many elements working as one.

Mandala is an on-chain agent coordination protocol. It lets multiple AI agents
collaborate on tasks using smart contract primitives — escrows, allowances,
delegations, and multi-sig approvals — while keeping humans in control at every
step.

Agents don't trust each other blindly. They trust the chain.

---

## The Problem

AI agents can write code, execute trades, manage files, and call APIs. But when
multiple agents need to coordinate — splitting work, exchanging value, verifying
completion — there's no trustless substrate for that. Agents either:

- Trust a central orchestrator (single point of failure + no auditability)
- Rely on off-chain messaging (no enforcement, no receipts)
- Require constant human babysitting (defeats the purpose)

Mandala solves this with on-chain coordination primitives that agents already
understand: escrows hold value until work is done, allowances cap what an agent
can spend, delegations define who can authorize what, and every action is
permanently auditable on-chain.

Humans stay in the loop not by micromanaging, but by setting rules upfront and
approving at key checkpoints.

---

## How It Works

```
Human sets policy
      |
      v
Coordinator Agent
  - breaks task into subtasks
  - creates escrow per subtask
  - delegates allowances to worker agents
      |
      v
Worker Agents (many, parallel)
  - claim tasks from escrow registry
  - execute work
  - submit proof of completion
      |
      v
Verifier Agent (or human)
  - validates output
  - releases escrow on success
  - disputes lock funds on failure
      |
      v
Human override gate (optional)
  - approve/veto high-value or sensitive steps
  - set spending limits
  - pause the entire mandala
```

---

## Core Primitives

### MandalaCoordinator.sol
Registry contract. Agents register tasks, post escrow, and track task state.
Humans set global policies (max spend per agent, pause switch, required approvals
above a threshold).

### MandalaEscrow.sol
Per-task escrow. Funds locked until verifier signs off. Disputable — triggers
human review if contested.

### MandalaAllowance.sol
ERC-20-style allowance system for agents. A coordinator grants a worker agent
an allowance to spend on-chain. Workers can't exceed their limit. Humans can
revoke at any time.

### MandalaDelegation.sol
Based on MetaMask Delegation Framework (ERC-7715). Coordinators issue signed
delegation chains. Workers act on behalf of the coordinator within defined
caveats (max value, time window, allowed targets).

### MandalaHumanGate.sol
Configurable human-in-the-loop checkpoints. High-value operations (above
threshold) or sensitive actions (deploying contracts, bridging funds) require
a human signature before proceeding.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Human                          │
│  sets policy · approves gates · can pause        │
└───────────────────────┬─────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │ Coordinator Agent  │
              │ (ERC-8004 identity)│
              └─────────┬──────────┘
          ┌─────────────┼─────────────┐
          │             │             │
   ┌──────▼──┐   ┌──────▼──┐   ┌──────▼──┐
   │ Worker  │   │ Worker  │   │ Worker  │
   │ Agent A │   │ Agent B │   │ Agent C │
   └──────┬──┘   └──────┬──┘   └──────┬──┘
          │             │             │
          └─────────────▼─────────────┘
                        │
              ┌─────────▼──────────┐
              │  MandalaCoordinator│
              │  (on-chain state)  │
              └─────────┬──────────┘
              ┌─────────┼──────────┐
              │         │          │
        Escrow     Allowance   Delegation
        Registry   Manager     Registry
```

---

## Target Bounties

Mandala is designed to be competitive across multiple tracks. Here's how we
map to each:

### Primary Targets

| Track | Sponsor | Prize | Why Mandala fits |
|-------|---------|-------|-----------------|
| Best Use of Delegations | MetaMask | $3,000 | MandalaDelegation.sol is built directly on ERC-7715. Sub-delegation chains let coordinator agents spawn workers with caveated permissions. Dream-tier: intent-based delegations as a core pattern. |
| Best Use of Locus | Locus | $2,000 | Agent-native payments with spending controls and full auditability — exactly what MandalaAllowance does. Every spend is on-chain with a receipt. |
| Agents With Receipts — ERC-8004 | Protocol Labs | $2,000 | Every agent in the system has an ERC-8004 on-chain identity. Coordination actions are attributed, auditable, and tied to agent reputation permanently. |
| Let the Agent Cook — No Humans Required | Protocol Labs | $2,000 | Full autonomous loop: coordinator discovers tasks, delegates to workers, verifies completion, settles escrow. Human gate is optional — can be fully autonomous. |
| Agent Services on Base | Base | $1,666 | Mandala deploys on Base. Agents expose discoverable task services, accept x402 payments, and run end-to-end on Base. |
| Synthesis Open Track | Synthesis Community | $28,133 | Community-funded open track — broad category, strong fit for novel coordination infrastructure. |

### Secondary Targets

| Track | Sponsor | Prize | Why Mandala fits |
|-------|---------|-------|-----------------|
| Escrow Ecosystem Extensions | Arkhai | $450 | MandalaEscrow.sol extends the Alkahest escrow protocol with agent-specific verification primitives and multi-agent arbiter patterns. |
| ENS Identity | ENS | $400 | Agents and coordinators resolved via ENS names instead of hex addresses — human-readable coordination. |
| Best Use of EigenCompute | EigenCloud | $3,000 | Verifier agents can run inside TEE-backed EigenCompute nodes for cryptographically verified task validation. |
| Go Gasless on Status Network | Status Network | $50 | Deploy Mandala contracts on Status Network Sepolia, run a gasless agent coordination demo. Easy qualifying submission. |
| Best Self Protocol Integration | Self | $1,000 | Human gate uses Self Protocol for identity verification before approving high-value actions. |

---

## Stack

- **Smart Contracts**: Solidity + Hardhat
- **Agent Framework**: Anthropic Agents SDK / custom orchestration
- **Agent Harness**: Claude Code
- **Model**: claude-sonnet-4-6
- **Chain**: Base Mainnet (+ Base Sepolia testnet)
- **Identity**: ERC-8004 (on-chain agent identity)
- **Delegation**: MetaMask Delegation Framework (ERC-7715)
- **Payments**: Locus agent-native payments
- **Frontend**: Next.js (coordination dashboard)

---

## Repo Structure

```
mandala/
  contracts/
    MandalaCoordinator.sol    — task registry + policy engine
    MandalaEscrow.sol         — per-task escrow with dispute
    MandalaAllowance.sol      — agent spend limits
    MandalaDelegation.sol     — ERC-7715 delegation chains
    MandalaHumanGate.sol      — human approval checkpoints
  agents/
    coordinator.ts            — coordinator agent logic
    worker.ts                 — worker agent template
    verifier.ts               — output verification agent
  scripts/
    deploy.ts                 — deployment scripts
  test/
    coordinator.test.ts
    escrow.test.ts
    delegation.test.ts
  docs/
    architecture.md
    delegation-flow.md
    human-in-the-loop.md
```

---

## Getting Started

```bash
git clone https://github.com/zapmarkets/mandala
cd mandala
npm install
cp .env.example .env
# fill in RPC_URL, PRIVATE_KEY, etc.
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network base-sepolia
```

---

## Built at The Synthesis

Mandala was built during [The Synthesis](https://synthesis.md) — the first
hackathon where AI agents and humans build as equals.