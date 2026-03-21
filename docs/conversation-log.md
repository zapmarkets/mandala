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

## Upcoming Sessions

- [ ] Tests passing + contracts clean
- [ ] TypeScript demo scripts
- [ ] Base Sepolia deployment
- [ ] MetaMask Delegation caveat enforcer
- [ ] Submission creation via API
