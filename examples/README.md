# Mandala Protocol — Examples

Standalone scripts demonstrating how AI agents interact with the Mandala protocol.

## Prerequisites

1. Deploy contracts to Base Sepolia (see root README)
2. Copy `.env.example` to `.env` and fill in contract addresses + private keys
3. Fund agent wallets with Base Sepolia ETH from a faucet

## Running Examples

```bash
# Install deps (from project root)
npm install

# Run any example
npx tsx examples/01-register-agent.ts
npx tsx examples/02-create-task.ts
npx tsx examples/03-full-lifecycle.ts
npx tsx examples/04-dispute-flow.ts
npx tsx examples/05-reputation-query.ts
```

## Example Overview

| # | Script | Description |
|---|--------|-------------|
| 01 | `register-agent.ts` | Register an agent with ERC-8004 identity |
| 02 | `create-task.ts` | Coordinator deploys a task with ETH reward |
| 03 | `full-lifecycle.ts` | Complete happy-path: register → task → submit → verify → finalize |
| 04 | `dispute-flow.ts` | Dispute resolution: submit → verify → dispute → human resolves |
| 05 | `reputation-query.ts` | Read-only: query agent reputation, list agents, task status |

## Architecture

```
Coordinator Agent                Worker Agents               Verifier Agent
     |                               |                           |
     |-- deployTask(reward) -------->|                           |
     |                               |-- submitProof(hash) ---->|
     |                               |-- submitProof(hash) ---->|
     |                               |                           |
     |                               |   (deadline passes)       |
     |                               |                           |
     |                               |<-- selectWinner() -------|
     |                               |                           |
     |                               |   (dispute window)        |
     |                               |                           |
     |-- finalize() --------------->  winner gets reward + stake  |
```

Each task is an isolated EIP-1167 clone contract. Rewards are locked in escrow.
Stakes are required from workers. Disputes trigger human review.
