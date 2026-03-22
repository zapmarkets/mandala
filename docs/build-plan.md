# Mandala — Build Plan

## Status: 5 of 7 phases complete. Submission published. Testnet deploy + demo video remaining.

---

## Phase 1 — Contracts ✅ COMPLETE

### Core Contracts (5 contracts + 1 library)
- [x] MandalaPolicy.sol — global rules, pause, blacklist, human gate threshold, treasury
- [x] MandalaAgentRegistry.sol — ERC-8004 identity, reputation, stake tracking
- [x] MandalaTask.sol — full lifecycle (Open → Verifying → Disputed → Finalized/Cancelled)
- [x] MandalaFactory.sol — EIP-1167 clone deployment + protocol fee
- [x] MandalaAllowanceEnforcer.sol — MetaMask Delegation Framework caveat enforcer
- [x] TaskLib.sol — shared structs, enums, errors

### Interfaces
- [x] IMandalaTask.sol
- [x] IMandalaFactory.sol
- [x] IMandalaAgentRegistry.sol
- [x] IMandalaPolicy.sol

### Test Suites (137 tests, all passing across 7 suites)
- [x] MandalaTask.t.sol — 17 tests, core task lifecycle
- [x] MandalaFactory.t.sol — 21 tests, deployment, fee validation, access control
- [x] MandalaAgentRegistry.t.sol — 23 tests, registration, reputation, suspend/reinstate
- [x] MandalaPolicy.t.sol — 24 tests, role management, pause, blacklist, threshold
- [x] MandalaEdgeCases.t.sol — 28 tests, full multi-agent lifecycle, dispute flows, slashing, accounting
- [x] MandalaAllowanceEnforcer.t.sol — 17 tests, delegation caveat enforcement
- [x] MandalaIntegration.t.sol — 7 tests, cross-contract integration scenarios

### Security Audit & Fixes
- [x] Comprehensive audit: 22 issues found (5 Critical, 7 High, 6 Medium, 4 Low)
- [x] All 22 issues fixed and verified
- [x] 25 new tests added covering every audit finding
- [x] Audit report: docs/audit-report.md
- [x] Fix log: docs/audit-fixes.md

## Phase 2 — Agent SDK / Demo Scripts ✅ COMPLETE

TypeScript scripts demonstrating the full autonomous coordination loop:

- [x] scripts/setup.ts — shared config, ABI loading, contract helpers
- [x] scripts/coordinator.ts — register as agent, deploy a task, watch events
- [x] scripts/worker.ts — discover open tasks, submit proof with stake
- [x] scripts/verifier.ts — list submissions, select winner
- [x] scripts/finalize.ts — finalize after dispute window
- [x] scripts/demo.ts — full autonomous loop (all 4 agent roles end-to-end)

### Terminal Showcase (5 agents)
- [x] Interactive terminal demo with 5 autonomous agents running the full loop
- [x] ABI fragments in scripts/abis/ for all contracts

## Phase 3 — MetaMask Delegation ✅ COMPLETE

- [x] MandalaAllowanceEnforcer.sol — caveat enforcer wrapping MetaMask Delegation Framework
- [x] Coordinator issues signed delegation to sub-agent with spend cap + task filter
- [x] Sub-agent presents delegation voucher when deploying a task on coordinator's behalf
- [x] 17 tests covering delegation caveat enforcement scenarios
- [x] Integration with existing contract suite verified

## Phase 4 — Frontend ✅ COMPLETE

- [x] Next.js 14 dashboard application
- [x] Live demo page showcasing agent coordination
- [x] UI components for task lifecycle visualization

## Phase 5 — Submission ✅ PUBLISHED

- [x] POST /projects — created via Synthesis API
- Project UUID: `78fa74d42ca0412ab503d9a36df69d5e`
- Slug: `mandala-on-chain-agent-coordination-5f1c`
- [x] Tracks attached:
  - Agents With Receipts (ERC-8004) — Protocol Labs
  - Best Use of Delegations — MetaMask
  - Let the Agent Cook — Protocol Labs
  - Agent Services on Base — Base
  - Synthesis Open Track — Community
- [x] Published on hackathon platform

## Phase 6 — Deploy to Base Sepolia ⬜ NOT STARTED

- [ ] Obtain funded private key for Base Sepolia
- [ ] Deploy contracts to Base Sepolia
- [ ] Verify contracts on Basescan
- [ ] Update submission with deployed addresses
- [ ] Run demo scripts against live testnet

## Phase 7 — Demo Video ⬜ NOT DONE

- [ ] Record demo video showing full agent coordination loop
- [ ] Upload and attach to submission

---

## What the Demo Shows

1. **Hermes** (coordinator agent) deploys a task: "Summarize this research paper"
   - 0.01 ETH reward, 48h deadline, 0.001 ETH stake required
   - Criteria IPFS hash posted on-chain

2. Two worker agents discover the task from events and submit proofs
   - Each uploads their summary to IPFS, posts proof hash + URI on-chain
   - Stake locked in escrow — skin in the game

3. Deadline passes. Verifier agent reviews both submissions, calls selectWinner()

4. 48h dispute window opens (or fast-forward in demo)
   - Any registered agent can file a dispute during this window
   - Disputes escalate to human resolver (configurable via policy)

5. Anyone calls finalize() — winner gets reward + their stake back, losers get stakes refunded

6. All identities, wins, and participation recorded via ERC-8004 in the agent registry
   - Reputation scores: `(wins * 100) / totalTasks`
   - Portable across tasks, queryable on-chain

7. MetaMask delegation allows coordinator to scope sub-agent spending via MandalaAllowanceEnforcer

Post-audit: all fund flows verified safe against fee-on-transfer tokens, ERC20 DoS, unbounded loops, and state manipulation attacks. 137 tests confirm correctness.

---

## Prize Targeting

| Track | Prize | Status |
|---|---|---|
| Agents With Receipts (ERC-8004) | $2,000 | ✅ Working ERC-8004 registry + full demo |
| Best Use of Delegations | $3,000 | ✅ MandalaAllowanceEnforcer complete with 17 tests |
| Let the Agent Cook | $2,000 | ✅ Full autonomous loop via demo.ts + terminal showcase |
| Agent Services on Base | varies | ⬜ Deploy to Base Sepolia needed |
| Synthesis Open Track | $28k pool | ✅ Everything ships (deploy would strengthen) |

Total potential: ~$35,000+
