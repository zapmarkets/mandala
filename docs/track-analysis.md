# Mandala — Track & Prize Analysis

## Currently Targeting (5 tracks)

| Track | Sponsor | Prize | Our Strength |
|-------|---------|-------|-------------|
| Agents With Receipts — ERC-8004 | Protocol Labs | $2k/$1.5k/$500 | ✅ Full ERC-8004 registry, reputation, 137 tests |
| Best Use of Delegations | MetaMask | $3k/$1.5k/$500 | ✅ MandalaAllowanceEnforcer, 17 tests |
| Let the Agent Cook | Protocol Labs | $2k/$1.5k/$500 | ✅ Full autonomous loop, live demo |
| Agent Services on Base | Base | $1.67k×3 | ⚠️ Need Base Sepolia deploy |
| Synthesis Open Track | Community | $28k pool | ✅ Strong submission |

## HIGH-VALUE New Tracks to Add

### 1. 🔥 stETH Agent Treasury (Lido) — $2k/$1k
**Perfect fit.** "Build a contract primitive that lets a human give an AI agent a yield-bearing operating budget backed by stETH, without giving the agent access to the principal."

**Integration:** Create `MandalaStETHTreasury.sol` — a task reward wrapper where:
- Coordinator deposits wstETH as reward
- While task is Open, the yield accrues
- Winner gets the yield portion + base reward
- Principal stays with coordinator (or returns on cancel)
- Agents earn yield while working — aligned incentives

**Effort:** Medium (new contract + tests)
**Prize potential:** $3,000

### 2. 🔥 ENS Identity (ENS) — $400/$200
**Quick win.** "Use ENS names to establish identity onchain."

**Integration:** 
- Agent registry stores optional ENS name alongside address
- Frontend resolves ENS names for display
- Agents can register with `agent.mandala.eth` subdomain
- All UI shows ENS names instead of hex addresses where available

**Effort:** Low (frontend + minor contract change)
**Prize potential:** $600

### 3. 🔥 Escrow Ecosystem Extensions (Arkhai) — $450
**Natural fit.** "Build new arbiters, verification primitives, and obligation patterns that extend the Alkahest escrow protocol."

**Integration:** Mandala IS an escrow system. We could:
- Make MandalaTask compatible with Alkahest's arbiter interface
- Allow external Arkhai arbiters to resolve Mandala disputes
- Integrate Alkahest obligation patterns for task commitments

**Effort:** Medium (interface adaptation)
**Prize potential:** $450

### 4. 🔥 Best Self Protocol Integration (Self) — $1k
**Good fit.** "ZK-powered identity primitives for AI agents."

**Integration:**
- Agents verify identity via Self Agent ID before registering
- ZK proof of agent authenticity stored on-chain
- Prevents sybil attacks — each real agent verified once
- Adds trust layer: "this agent is verified by Self Protocol"

**Effort:** Medium (integration with Self API)
**Prize potential:** $1,000

### 5. 🔥 Go Gasless: Status Network — $50 each (40 slots)
**Free money.** Deploy contracts on Status Network (gasless L2). Just re-deploy our existing contracts.

**Effort:** Minimal (just deploy)
**Prize potential:** $50

## STRETCH Tracks (harder but big prizes)

### 6. Private Agents, Trusted Actions (Venice) — $5.75k/$3.45k/$2.3k
**Ambitious.** "Agents that reason over sensitive data without exposure."

**Integration:** Verifier agent uses Venice AI for private submission evaluation:
- Submissions contain sensitive data (proofs, research)
- Verifier sends to Venice for private scoring
- Score committed on-chain without revealing evaluation reasoning
- Privacy-preserving task verification

**Effort:** High (Venice API integration, privacy flow)
**Prize potential:** $11,500 total

### 7. Agentic Finance / Uniswap — $2.5k/$1.5k/$1k
**Possible.** Mandala could use Uniswap API for:
- Auto-swapping ERC20 rewards to ETH
- Price oracle for reward valuation
- Cross-token task rewards

**Effort:** Medium-High
**Prize potential:** $5,000

## Recommended Priority Order

| Priority | Track | Effort | Prize | Why |
|----------|-------|--------|-------|-----|
| 1 | stETH Agent Treasury (Lido) | Medium | $3k | Perfect architectural fit |
| 2 | ENS Identity | Low | $600 | Quick win, improves UX |
| 3 | Self Protocol Integration | Medium | $1k | Adds real security value |
| 4 | Status Network Gasless | Minimal | $50 | Free money |
| 5 | Arkhai Escrow Extensions | Medium | $450 | Natural fit |
| 6 | Venice Private Agents | High | $11.5k | Biggest prize but hardest |

**Total new prize potential: ~$16,600**
**Combined with existing tracks: ~$50,000+**
