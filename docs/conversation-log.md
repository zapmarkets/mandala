# Mandala — Human + Agent Conversation Log

This log captures the collaboration between Sid (human) and Hermes (AI agent, claude-sonnet-4-6)
throughout the Synthesis hackathon build. Required field for submission.

---

## Session 1 — March 21, 2026

**Sid:** Reviewed hackathon rules, existing project structure, and synthesis API skill.
Mandala protocol contracts already scaffolded (MandalaPolicy, MandalaAgentRegistry,
MandalaTask, MandalaFactory). Core smart contract architecture complete.

**Hermes:** Read all contracts, architecture doc, hackathon skill.md, and prize catalog.
Assessed current state: contracts are solid — full task lifecycle with escrow, stake,
dispute, human gate, ERC-8004 registry. Key gaps identified:
- Off-chain SDK / agent scripts not built
- MetaMask Delegation integration (MandalaAllowance) not built
- No deployment to testnet yet
- No hackathon submission created yet

**Decision:** Prioritize in this order:
1. Fix any contract issues + run tests
2. Build TypeScript agent demo (coordinator + worker scripts)
3. Deploy to Base Sepolia
4. Wire MetaMask Delegation for the delegation track prize
5. Submit to hackathon platform

**Why this architecture:**
Sid came in with the core insight — agents can't trust each other, but they can all
trust a contract. The design naturally fell out from that: escrow for value custody,
stake for commitment signals, ERC-8004 for portable identity, human gate as a
configurable safety valve. Hermes pushed for EIP-1167 clones (one task = one contract)
over a shared registry pattern to avoid cross-task state contamination.

---

## Session 2 — March 21, 2026

**Sid:** "cool lets go ahead with building it. and then lets write tests for it."

**Hermes:** Built the full test suite and TypeScript agent SDK in parallel using subagents:

1. **Test Suite (88 tests, all passing):**
   - MandalaPolicy.t.sol (19 tests): constructor validation, role management, pause/unpause, blacklist/whitelist, threshold configuration, access control reverts
   - MandalaAgentRegistry.t.sol (21 tests): registration flows, duplicate/blacklisted/paused reverts, reputation scoring, TASK_CONTRACT_ROLE enforcement, suspend/reinstate
   - MandalaFactory.t.sol (21 tests): all 6 constructor zero-address checks, fee validation, deploy success with fee verification, paused/unregistered/suspended reverts, admin functions
   - MandalaEdgeCases.t.sol (18 tests): full 5-agent lifecycle, dispute-then-cancel, human gate blocking, open verifier, slashing, exact ETH balance accounting, zero-stake tasks
   - MandalaTask.t.sol (9 tests): existing lifecycle tests

2. **TypeScript Agent SDK:**
   - scripts/setup.ts: shared config, ABI loading, contract helpers
   - scripts/coordinator.ts: register + deploy task with ETH reward
   - scripts/worker.ts: submit proof with stake
   - scripts/verifier.ts: list submissions + select winner
   - scripts/finalize.ts: finalize after dispute window
   - scripts/demo.ts: full autonomous coordination loop (all 4 agent roles)
   - scripts/abis/: minimal ABI fragments for all contracts

**Decision:** Pushed everything to https://github.com/zapmarkets/mandala.git. Next: hackathon submission.

---

## Session 3 — March 21, 2026

**Sid:** "lets push the repository changes and submit to hackathon"

**Hermes:** Created project submission via Synthesis API with track targeting:
- Agents With Receipts (ERC-8004) — Protocol Labs
- Best Use of Delegations — MetaMask
- Let the Agent Cook — Protocol Labs
- Agent Services on Base — Base
- Synthesis Open Track — Community

---

## What's Left

- [ ] Deploy to Base Sepolia + verify contracts
- [ ] MetaMask Delegation integration (MandalaAllowance.sol)
- [ ] Demo video
- [x] Tests passing + contracts clean (88/88)
- [x] TypeScript demo scripts
- [x] Submission creation via API
