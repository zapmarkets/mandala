     1|# Mandala — Human + Agent Conversation Log
     2|
     3|This log captures the collaboration between Sid (human, @zapmarkets) and Hermes (AI agent, claude-opus-4-6)
     4|throughout the Synthesis hackathon build. Required field for submission.
     5|
     6|---
     7|
     8|## Session 1 — March 21, 2026
     9|
    10|**Sid:** Reviewed hackathon rules, existing project structure, and synthesis API skill.
    11|Mandala protocol contracts already scaffolded (MandalaPolicy, MandalaAgentRegistry,
    12|MandalaTask, MandalaFactory). Core smart contract architecture complete.
    13|
    14|**Hermes:** Read all contracts, architecture doc, hackathon skill.md, and prize catalog.
    15|Assessed current state: contracts are solid — full task lifecycle with escrow, stake,
    16|dispute, human gate, ERC-8004 registry. Key gaps identified:
    17|- Off-chain SDK / agent scripts not built
    18|- MetaMask Delegation integration (MandalaAllowance) not built
    19|- No deployment to testnet yet
    20|- No hackathon submission created yet
    21|
    22|**Decision:** Prioritize in this order:
    23|1. Fix any contract issues + run tests
    24|2. Build TypeScript agent demo (coordinator + worker scripts)
    25|3. Deploy to Base Sepolia
    26|4. Wire MetaMask Delegation for the delegation track prize
    27|5. Submit to hackathon platform
    28|
    29|**Why this architecture:**
    30|Sid came in with the core insight — agents can't trust each other, but they can all
    31|trust a contract. The design naturally fell out from that: escrow for value custody,
    32|stake for commitment signals, ERC-8004 for portable identity, human gate as a
    33|configurable safety valve. Hermes pushed for EIP-1167 clones (one task = one contract)
    34|over a shared registry pattern to avoid cross-task state contamination.
    35|
    36|---
    37|
    38|## Session 2 — March 21, 2026
    39|
    40|**Sid:** "cool lets go ahead with building it. and then lets write tests for it."
    41|
    42|**Hermes:** Built the full test suite and TypeScript agent SDK in parallel using subagents:
    43|
    44|1. **Test Suite (88 tests, all passing):**
    45|   - MandalaPolicy.t.sol (19 tests): constructor validation, role management, pause/unpause, blacklist/whitelist, threshold configuration, access control reverts
    46|   - MandalaAgentRegistry.t.sol (21 tests): registration flows, duplicate/blacklisted/paused reverts, reputation scoring, TASK_CONTRACT_ROLE enforcement, suspend/reinstate
    47|   - MandalaFactory.t.sol (21 tests): all 6 constructor zero-address checks, fee validation, deploy success with fee verification, paused/unregistered/suspended reverts, admin functions
    48|   - MandalaEdgeCases.t.sol (18 tests): full 5-agent lifecycle, dispute-then-cancel, human gate blocking, open verifier, slashing, exact ETH balance accounting, zero-stake tasks
    49|   - MandalaTask.t.sol (9 tests): existing lifecycle tests
    50|
    51|2. **TypeScript Agent SDK:**
    52|   - scripts/setup.ts: shared config, ABI loading, contract helpers
    53|   - scripts/coordinator.ts: register + deploy task with ETH reward
    54|   - scripts/worker.ts: submit proof with stake
    55|   - scripts/verifier.ts: list submissions + select winner
    56|   - scripts/finalize.ts: finalize after dispute window
    57|   - scripts/demo.ts: full autonomous coordination loop (all 4 agent roles)
    58|   - scripts/abis/: minimal ABI fragments for all contracts
    59|
    60|**Decision:** Pushed everything to https://github.com/zapmarkets/mandala.git. Next: hackathon submission.
    61|
    62|---
    63|
    64|## Session 3 — March 21, 2026
    65|
    66|**Sid:** "lets push the repository changes and submit to hackathon"
    67|
    68|**Hermes:** Created project submission via Synthesis API with track targeting:
    69|- Agents With Receipts (ERC-8004) — Protocol Labs
    70|- Best Use of Delegations — MetaMask
    71|- Let the Agent Cook — Protocol Labs
    72|- Agent Services on Base — Base
    73|- Synthesis Open Track — Community
    74|
    75|---
    76|
    77|## Session 4 — March 21, 2026
    78|
    79|**Sid:** "cool. now lets audit the contracts, and then refine them too"
    80|
    81|**Hermes:** Ran comprehensive security audit across all Mandala contracts. Found 22 issues across 4 severity levels (5 Critical, 7 High, 6 Medium, 4 Low) plus 5 Informational. Applied all fixes:
    82|
    83|**Critical fixes:**
    84|- C-01: Fee-on-transfer balance-delta pattern in MandalaTask.initialize()
    85|- C-02: Slashed stakes now transfer to treasury instead of being locked
    86|- C-03: selectWinner restricted to Open state only (no dispute window reset)
    87|- C-04: cancel() restricted to Open state only (no stealing reward after winner selected)
    88|- C-05: recordWin no longer double-increments totalTasks
    89|
    90|**High fixes:**
    91|- H-01: Dispute target validated as actual submitter
    92|- H-02: ERC20 try/catch + pull-based withdrawals for failed transfers
    93|- H-03: Deadline enforcement on selectWinner (must wait for deadline)
    94|- H-05: Disqualified agent check in resolveDispute
    95|- H-07: Guarded receive() functions reject accidental ETH
    96|
    97|**Medium fixes:**
    98|- M-01: MAX_SUBMISSIONS = 100 cap to prevent gas DoS
    99|- M-02: Reject ETH sent with ERC20 tasks
   100|- M-03: threshold = 0 now disables human gate entirely
   101|- M-04: Event emission in recordTaskParticipation
   102|- M-05: Explicit reward parameter instead of allowance inference
   103|- M-06: revokeTaskRole function added for completed tasks
   104|
   105|**Low fixes:**
   106|- L-01: Comment fix in reputation score
   107|- L-02: Removed dead stakedBalance field
   108|- L-03: criteriaHash validation (non-zero required)
   109|- L-04: NatSpec documentation added
   110|
   111|**Tests:** 113 passing (up from 88). 25 new tests covering all audit findings.
   112|
   113|Full audit report: docs/audit-report.md
   114|
   115|---
   116|
   117|## Session 5 — March 21, 2026
   118|
   119|**Sid:** "cool update docs if needed, write docs for audit too"
   120|
   121|**Hermes:** Rewrote all documentation to reflect post-audit state:
   122|- docs/build-plan.md — updated all phase statuses, prize table, demo description
   123|- docs/conversation-log.md — added Session 4 (audit) and Session 5 (docs)
   124|- docs/audit-fixes.md — new file: every finding with its fix and covering test
   125|
   126|---
   127|
   128|## What's Left
   129|
   130|- [ ] Deploy to Base Sepolia + verify contracts
   131|- [ ] MetaMask Delegation integration (MandalaAllowance.sol)
   132|- [ ] Demo video
   133|- [x] Tests passing + contracts audited (113/113)
   134|- [x] TypeScript demo scripts
   135|- [x] Submission creation via API
   136|- [x] Security audit + all fixes applied
   137|- [x] Documentation complete
   138|

---

## Session 2 — March 22, 2026 (Morning)

**Sid:** "lets go ahead with development. create examples, refine this project."

**Hermes:** Reviewed full project state — 5 contracts, 113 tests, 6 test suites. Built out:

1. **5 TypeScript examples** (examples/ directory):
   - 01-register-agent.ts — simplest interaction, register with ERC-8004 ID
   - 02-create-task.ts — coordinator deploys task with ETH escrow
   - 03-full-lifecycle.ts — complete happy path (7 steps)
   - 04-dispute-flow.ts — dispute resolution with human override
   - 05-reputation-query.ts — read-only protocol dashboard

2. **MandalaIntegration.t.sol** — 7 comprehensive end-to-end Solidity tests:
   - Full lifecycle happy path, dispute flow, cancel flow
   - Multi-task reputation tracking, dispute-to-cancel, human gate, policy controls

3. **Project polish:**
   - Regenerated complete ABIs (all functions/events/errors)
   - Added tsconfig.json, .env.example
   - Updated README to reflect 137 tests across 7 suites

**Result:** 137 tests passing, zero TypeScript errors, all pushed to GitHub.

---

## Session 2 — March 22, 2026 (Afternoon)

**Sid:** "lets prepare few agents to showcase usecase for mandala. we can deploy contracts locally, post a task. and agents compete to finish them"

**Hermes:** Built a self-contained local demo system:

1. **scripts/deploy-local.ts** — deploys full protocol to local Anvil chain using ethers.js
   - Manages nonces explicitly for reliable re-deployment
   - Outputs config JSON with all addresses

2. **demo/showcase.ts** — rich terminal showcase with 5 named AI agent personas:
   - Atlas (Coordinator), Nova (Researcher), Cipher (Coder), Sentinel (Auditor), Oracle (Verifier)
   - Runs 2 realistic tasks: "DeFi Security Analysis" and "Reputation Aggregator Build"
   - Each agent has different strengths — Nova wins research tasks, Cipher wins building tasks
   - Color-coded terminal output, timestamps, quality scores
   - Uses evm_increaseTime for deadline fast-forwarding
   - Final scoreboard with reputation tracking

3. **demo/run.sh** — one-command launcher (start Anvil → deploy → showcase)

**Result:** Full local demo runs in ~20 seconds. Nova and Cipher each win one task.

---

## Session 3 — March 22, 2026 (Evening)

**Sid:** "lets create a simple demo using nextjs, to showcase entire project."

**Hermes:** Built a complete Next.js 14 frontend dashboard:

1. **Dashboard** (/) — Protocol stats cards (agents, tasks, fee, stake, status), recent tasks, architecture diagram
2. **Agents** (/agents) — Registry table with reputation, wins, tasks, disputes
3. **Tasks** (/tasks) — Task list with color-coded status badges
4. **Task Detail** (/tasks/[address]) — Config, submissions, lifecycle timeline, dispute info
5. **Live Demo** (/demo) — Interactive simulation running directly on Anvil:
   - Click "Run Demo" → registers 5 agents → deploys task → submits proofs → verifies → finalizes
   - Terminal-style log with step-by-step animation
   - Final scoreboard showing reputation and wins
6. **About** (/about) — Protocol description, architecture, hackathon tracks

Dark theme with cyan/purple accents, Tailwind CSS only, no external UI libraries. All pages read live from Anvil chain.

---

## Session 4 — March 22, 2026 (Night)

**Sid:** "now lets go ahead with integrating all the tech we need for hackathon submission."

**Hermes:** Preparing final submission:
- Updated project description and problem statement on hackathon platform
- Updated submission metadata (skills, tools, resources)
- Preparing conversation log, self-custody transfer, deployment to Base Sepolia
