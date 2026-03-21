# Mandala — Human + Agent Conversation Log

This log captures the collaboration between Sid (human, @zapmarkets) and Hermes (AI agent, claude-opus-4-6)
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

## Session 4 — March 21, 2026

**Sid:** "cool. now lets audit the contracts, and then refine them too"

**Hermes:** Ran comprehensive security audit across all Mandala contracts. Found 22 issues across 4 severity levels (5 Critical, 7 High, 6 Medium, 4 Low) plus 5 Informational. Applied all fixes:

**Critical fixes:**
- C-01: Fee-on-transfer balance-delta pattern in MandalaTask.initialize()
- C-02: Slashed stakes now transfer to treasury instead of being locked
- C-03: selectWinner restricted to Open state only (no dispute window reset)
- C-04: cancel() restricted to Open state only (no stealing reward after winner selected)
- C-05: recordWin no longer double-increments totalTasks

**High fixes:**
- H-01: Dispute target validated as actual submitter
- H-02: ERC20 try/catch + pull-based withdrawals for failed transfers
- H-03: Deadline enforcement on selectWinner (must wait for deadline)
- H-05: Disqualified agent check in resolveDispute
- H-07: Guarded receive() functions reject accidental ETH

**Medium fixes:**
- M-01: MAX_SUBMISSIONS = 100 cap to prevent gas DoS
- M-02: Reject ETH sent with ERC20 tasks
- M-03: threshold = 0 now disables human gate entirely
- M-04: Event emission in recordTaskParticipation
- M-05: Explicit reward parameter instead of allowance inference
- M-06: revokeTaskRole function added for completed tasks

**Low fixes:**
- L-01: Comment fix in reputation score
- L-02: Removed dead stakedBalance field
- L-03: criteriaHash validation (non-zero required)
- L-04: NatSpec documentation added

**Tests:** 113 passing (up from 88). 25 new tests covering all audit findings.

Full audit report: docs/audit-report.md

---

## Session 5 — March 21, 2026

**Sid:** "cool update docs if needed, write docs for audit too"

**Hermes:** Rewrote all documentation to reflect post-audit state:
- docs/build-plan.md — updated all phase statuses, prize table, demo description
- docs/conversation-log.md — added Session 4 (audit) and Session 5 (docs)
- docs/audit-fixes.md — new file: every finding with its fix and covering test

---

## What's Left

- [ ] Deploy to Base Sepolia + verify contracts
- [ ] MetaMask Delegation integration (MandalaAllowance.sol)
- [ ] Demo video
- [x] Tests passing + contracts audited (113/113)
- [x] TypeScript demo scripts
- [x] Submission creation via API
- [x] Security audit + all fixes applied
- [x] Documentation complete
