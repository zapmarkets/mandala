# Mandala — Build Plan

## Status: Contracts complete & audited, SDK complete, submission drafted

---

## Phase 1 — Contracts ✅ COMPLETE

### Core Contracts
- [x] MandalaPolicy.sol — global rules, pause, blacklist, human gate threshold, treasury
- [x] MandalaAgentRegistry.sol — ERC-8004 identity, reputation, stake tracking
- [x] MandalaTask.sol — full lifecycle (Open → Verifying → Disputed → Finalized/Cancelled)
- [x] MandalaFactory.sol — EIP-1167 clone deployment + protocol fee
- [x] TaskLib.sol — shared structs, enums, errors

### Interfaces
- [x] IMandalaTask.sol
- [x] IMandalaFactory.sol
- [x] IMandalaAgentRegistry.sol
- [x] IMandalaPolicy.sol

### Test Suites (113 tests, all passing)
- [x] MandalaTask.t.sol — core task lifecycle tests
- [x] MandalaPolicy.t.sol — role management, pause, blacklist, threshold
- [x] MandalaAgentRegistry.t.sol — registration, reputation, suspend/reinstate
- [x] MandalaFactory.t.sol — deployment, fee validation, access control
- [x] MandalaEdgeCases.t.sol — full multi-agent lifecycle, dispute flows, slashing, accounting

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

ABI fragments in scripts/abis/ for all contracts.

## Phase 3 — MetaMask Delegation ⬜ NOT STARTED

- [ ] MandalaAllowance.sol — caveat enforcer wrapping MetaMask Delegation Framework
- [ ] Coordinator issues signed delegation to sub-agent with spend cap + task filter
- [ ] Sub-agent presents delegation voucher when deploying a task on coordinator's behalf
- [ ] Integration test: coordinator → delegation → sub-agent → task → payout

## Phase 4 — Submission 📝 DRAFT CREATED

- [x] POST /projects — draft created via Synthesis API
- Project UUID: `78fa74d42ca0412ab503d9a36df69d5e`
- Slug: `mandala-on-chain-agent-coordination-5f1c`
- [x] Tracks attached:
  - Agents With Receipts (ERC-8004) — Protocol Labs
  - Best Use of Delegations — MetaMask
  - Let the Agent Cook — Protocol Labs
  - Agent Services on Base — Base
  - Synthesis Open Track — Community
- [ ] Add demo video
- [ ] Final description polish
- [ ] Publish

## Phase 5 — Deploy ⬜ NOT STARTED

- [ ] Deploy to Base Sepolia
- [ ] Verify contracts on Basescan
- [ ] Update submission with deployed addresses
- [ ] Run demo scripts against live testnet

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

Post-audit: all fund flows verified safe against fee-on-transfer tokens, ERC20 DoS, unbounded loops, and state manipulation attacks. 113 tests confirm correctness.

---

## Prize Targeting

| Track | Prize | What We Have |
|---|---|---|
| Agents With Receipts (ERC-8004) | $2,000 | Working ERC-8004 registry + full demo |
| Best Use of Delegations | $3,000 | Phase 3 needed (MandalaAllowance.sol) |
| Let the Agent Cook | $2,000 | Full autonomous loop via demo.ts |
| Agent Services on Base | varies | Deploy to Base Sepolia needed |
| Synthesis Open Track | $28k pool | Everything ships |

Total potential: ~$35,000+
