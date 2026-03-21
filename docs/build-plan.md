# Mandala — Build Plan

## Status: Contracts scaffolded, not yet deployed

---

## Phase 1 — Contracts (IN PROGRESS)

- [x] MandalaPolicy — global rules, pause, blacklist, human gate threshold
- [x] MandalaAgentRegistry — ERC-8004 identity, reputation, stake tracking
- [x] MandalaTask — full lifecycle (Open/Verifying/Disputed/Finalized/Cancelled)
- [x] MandalaFactory — EIP-1167 clone deployment + protocol fee
- [x] TaskLib — shared structs, enums, errors
- [x] IMandalaTask / IMandalaFactory / IMandalaAgentRegistry / IMandalaPolicy interfaces
- [x] MandalaTask.t.sol — core test suite
- [ ] forge test — all passing
- [ ] Deploy to Base Sepolia
- [ ] Verify contracts on Basescan

## Phase 2 — Agent SDK / Demo Scripts

Off-chain TypeScript scripts demonstrating the full loop:

- [ ] scripts/coordinator.ts — register as agent, deploy a task, watch events
- [ ] scripts/worker.ts — discover open tasks, submit proof with IPFS evidence
- [ ] scripts/verifier.ts — list submissions, select winner
- [ ] scripts/finalize.ts — finalize after dispute window
- [ ] scripts/indexer.ts — watch TaskDeployed / ProofSubmitted events

Helper:
- [ ] scripts/ipfs.ts — upload proof content to IPFS (web3.storage or pinata)

## Phase 3 — MetaMask Delegation (Best Use of Delegations track)

- [ ] MandalaAllowance.sol — caveat enforcer wrapping MetaMask Delegation Framework
- [ ] Coordinator issues signed delegation to sub-agent with spend cap + task filter
- [ ] Sub-agent presents delegation voucher when deploying a task on coordinator's behalf
- [ ] Integration test: coordinator -> delegation -> sub-agent -> task -> payout

## Phase 4 — Submission

- [ ] POST /projects to create hackathon submission
- [ ] Add project description, tags, demo video, repo link
- [ ] Attach tracks: ERC-8004, Delegations, Let the Agent Cook, Open Track
- [ ] Publish (admin only)

---

## What the Demo Shows

1. Hermes (coordinator agent) deploys a task: "Summarize this research paper"
   - 0.01 ETH reward, 48h deadline, 0.001 ETH stake required
   - Criteria IPFS hash posted on-chain

2. Two worker agents pick up the task from events and submit proofs
   - Each uploads their summary to IPFS, posts proof hash + URI on-chain

3. Verifier agent reviews both, calls selectWinner()

4. 48h dispute window passes (or we fast-forward in demo)

5. Anyone calls finalize() — winner paid, losers get stake back

6. All identities, wins, and participation recorded via ERC-8004 in registry

This is real agent coordination with real value on a real chain. No mock.

---

## Key Prizes to Target

| Track                          | Prize   | What we need |
|-------------------------------|---------|-------------|
| Agents With Receipts (ERC-8004)| $2,000  | Working ERC-8004 registry + demo |
| Best Use of Delegations        | $3,000  | MandalaAllowance.sol + caveat enforcer |
| Let the Agent Cook             | $2,000  | Full autonomous loop demo |
| Synthesis Open Track           | $28k pool| Submit anything that ships |

Total potential: ~$35,000+
