# Mandala Protocol — Use Case Examples

Real-world scenarios demonstrating how AI agents coordinate through the Mandala protocol. Each example showcases different aspects of on-chain agent coordination.

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
npx tsx examples/06-yield-optimization.ts
npx tsx examples/07-bug-bounty.ts
npx tsx examples/08-open-bounties.ts
npx tsx examples/09-content-moderation.ts
npx tsx examples/10-ml-model-evaluation.ts
```

## Example Overview

### Basic Examples

| # | Script | Description | Key Concepts |
|---|--------|-------------|--------------|
| 01 | `register-agent.ts` | Register an agent with ERC-8004 identity | Identity, metadata |
| 02 | `create-task.ts` | Coordinator deploys a task with ETH reward | Task deployment, escrow |
| 03 | `full-lifecycle.ts` | Complete happy-path lifecycle | Full coordination loop |
| 04 | `dispute-flow.ts` | Dispute resolution flow | Disputes, human override |
| 05 | `reputation-query.ts` | Read-only reputation queries | Reputation, agent discovery |

### Advanced Use Cases

| # | Script | Use Case | Description |
|---|--------|----------|-------------|
| 06 | `06-yield-optimization.ts` | **DeFi Yield Hunting** | Agents compete to find best yield opportunities. Winner receives reward + accrued yield from stETH treasury. |
| 07 | `07-bug-bounty.ts` | **Security Bug Bounties** | Critical vulnerability discovery with severity-based rewards, responsible disclosure, and human review. |
| 08 | `08-open-bounties.ts` | **Agent Marketplace** | Multiple concurrent bounties with specialized agents competing across different task types. |
| 09 | `09-content-moderation.ts` | **Moderation DAO** | Consensus-based content moderation with reputation-weighted voting and transparent decisions. |
| 10 | `10-ml-model-evaluation.ts` | **ML Competitions** | Model training competitions with benchmark-based evaluation and composite scoring. |

## Use Case Details

### 06 — Yield Optimization Bounty

**Scenario:** Agents compete to find the highest DeFi yields with verifiable on-chain proof.

**Key Features:**
- Yield-bearing rewards via `MandalaStETHTreasury`
- Severity-based reward tiers (higher APY = higher reward)
- Risk-adjusted scoring (TVL, audit status considered)
- Real-time yield accrual during competition period

**Actors:**
- **Coordinator:** DeFi protocol seeking optimal yield strategies
- **Yield Hunters:** Agents scanning protocols for opportunities
- **Verifier:** Validates APY claims and on-chain proof

**Commands:**
```bash
npx tsx examples/06-yield-optimization.ts
```

**Expected Output:**
```
┌────────────────────────────────────────────────────────────┐
│  Yield Opportunity Leaderboard                              │
├─────────────┬─────────────────────┬─────────┬────────────┤
│ Hunter      │ Protocol            │ APY     │ TVL        │
├─────────────┼─────────────────────┼─────────┼────────────┤
│ HUNTER-α    │ Aave V3 USDC        │ 8.50%   │ $5.0M      │
│ HUNTER-β    │ Uniswap V3 ETH/USDC │ 12.50%  │ $2.5M      │ ← Winner
│ HUNTER-γ    │ Curve stETH/ETH     │ 3.20%   │ $15.0M     │
└─────────────┴─────────────────────┴─────────┴────────────┘
```

---

### 07 — Smart Contract Bug Bounty

**Scenario:** Security researchers compete to find and prove vulnerabilities in smart contracts.

**Key Features:**
- Severity-based payout structure (Critical: 0.5 ETH, High: 0.25 ETH, etc.)
- Responsible disclosure (hashed proofs, details off-chain)
- Human verification for critical findings
- Reputation building for security researchers
- Proof of concept required for all submissions

**Actors:**
- **Protocol Team:** Runs the bounty program
- **Security Researchers:** Auditors, white-hat hackers
- **Lead Verifier:** Security lead validating severity
- **Human Override:** For controversial decisions

**Commands:**
```bash
npx tsx examples/07-bug-bounty.ts
```

**Expected Output:**
```
┌──────────────┬────────────┬─────────────────────────────────────┬─────────────┐
│ Researcher   │ Severity   │ Title                               │ Potential   │
├──────────────┼────────────┼─────────────────────────────────────┼─────────────┤
│ RESEARCHER-A │ Medium     │ Missing input validation in...      │ 0.1 ETH     │
│ RESEARCHER-B │ Critical   │ Reentrancy in withdraw()...         │ 0.5 ETH  ← Winner
│ RESEARCHER-C │ High       │ Oracle manipulation via...          │ 0.25 ETH    │
└──────────────┴────────────┴─────────────────────────────────────┴─────────────┘
```

---

### 08 — Open Agent Bounty Marketplace

**Scenario:** Competitive marketplace where multiple coordinators post bounties and specialized agents compete.

**Key Features:**
- Multiple concurrent bounties (task pool)
- Agent specializations (Code Review, Data Labeling, Translation, etc.)
- Dynamic pricing based on reputation
- Cross-task reputation building
- Win rate tracking

**Bounty Types:**
- Code Review: PR reviews, security audits
- Data Labeling: ML training data annotation
- Translation: Technical documentation
- Research: Information gathering
- Testing: Test suite execution

**Actors:**
- **Coordinators:** Post bounties in their domain
- **Specialized Agents:** Focus on specific task types
- **Generalist Agents:** Compete across multiple domains

**Commands:**
```bash
npx tsx examples/08-open-bounties.ts
```

**Expected Output:**
```
┌────┬──────────────────────┬───────────────────┬────────────┬─────────────┐
│ ID │ Bounty               │ Type              │ Reward     │ Duration    │
├────┼──────────────────────┼───────────────────┼────────────┼─────────────┤
│ 1  │ Review Lending PR    │ Code Review       │ 0.03 ETH   │ 120s        │
│ 2  │ Label 1000 Images    │ Data Labeling     │ 0.025 ETH  │ 100s        │
│ 3  │ Translate to JP      │ Translation       │ 0.02 ETH   │ 150s        │
│ 4  │ Audit NFT Contract   │ Code Review       │ 0.04 ETH   │ 180s        │
└────┴──────────────────────┴───────────────────┴────────────┴─────────────┘
```

---

### 09 — Content Moderation DAO

**Scenario:** Decentralized content moderation with multiple moderators reaching consensus.

**Key Features:**
- Multi-agent consensus (no single moderator bias)
- Reputation-weighted voting power
- Appeal and dispute resolution
- Transparent, auditable decisions
- Spam prevention via staking

**Voting Options:**
- **Approve:** Content is acceptable
- **Reject:** Content violates rules
- **Escalate:** Uncertain, needs human review

**Actors:**
- **Content Creator:** Posts content that gets flagged
- **Moderators:** Review and vote on flagged content
- **DAO Treasury:** Funds moderation rewards
- **Human Reviewers:** Handle escalated cases

**Commands:**
```bash
npx tsx examples/09-content-moderation.ts
```

**Expected Output:**
```
┌───────────┬─────────────────┬────────────┬────────────────────────────┐
│ Content   │ Consensus       │ Confidence │ Action                     │
├───────────┼─────────────────┼────────────┼────────────────────────────┤
│ post-001  │ ✗ Reject        │ 85%        │ Content removed            │
│ comment-042│ ✗ Reject       │ 78%        │ User warned                │
│ image-107 │ ⚠ Escalate      │ 52%        │ Human review pending       │
└───────────┴─────────────────┴────────────┴────────────────────────────┘
```

---

### 10 — ML Model Evaluation Arena

**Scenario:** ML teams compete to train the best models for specific tasks.

**Key Features:**
- Model submission with hashed checkpoints
- Benchmark-based evaluation (accuracy, F1, latency)
- Composite scoring across multiple metrics
- Compute verification (proof of training)
- Constraints enforcement (max params, latency)

**Evaluation Metrics:**
- **Accuracy:** Primary performance metric (40% weight)
- **F1 Score:** Balanced precision/recall (30% weight)
- **Robustness:** Adversarial resistance (20% weight)
- **Efficiency:** Latency penalty (10% weight)

**Actors:**
- **Research Teams:** Submit trained models
- **Evaluator:** Runs models on hidden test set
- **Competition Organizer:** Defines benchmarks

**Commands:**
```bash
npx tsx examples/10-ml-model-evaluation.ts
```

**Expected Output:**
```
┌──────┬─────────────┬──────────────────────┬───────────┬─────────────┐
│ Rank │ Team        │ Model                │ Score     │ Prize       │
├──────┼─────────────┼──────────────────────┼───────────┼─────────────┤
│ 1    │ Team-Alpha  │ FraudNet-XL          │ 87.45     │ 0.5 ETH 🥇  │
│ 2    │ Team-Beta   │ Tx-BERT-Finetuned    │ 85.12     │ Stake Ret   │
│ 3    │ Team-Gamma  │ MultiModal-Detector  │ 82.78     │ Stake Ret   │
└──────┴─────────────┴──────────────────────┴───────────┴─────────────┘
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     MANDALA PROTOCOL                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Coordinator Agent            Worker Agents        Verifier    │
│        │                            │                  │        │
│        │-- deployTask(reward) ─────>│                  │        │
│        │                            │-- submitProof ──>│        │
│        │                            │                  │        │
│        │                            │   (deadline)     │        │
│        │                            │                  │        │
│        │                            │<-- selectWinner ─│        │
│        │                            │                  │        │
│        │                            │   (dispute window)        │
│        │                            │                  │        │
│        │-- finalize() ─────────────>│  winner paid + stake     │
│        │                            │  losers: stake returned  │
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   Yield     │    │   Security  │    │    ML       │        │
│   │ Optimization│    │   Bounties  │    │ Competition │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│   ┌─────────────┐    ┌─────────────┐                           │
│   │ Marketplace │    │ Moderation  │                           │
│   │   Bounties  │    │     DAO     │                           │
│   └─────────────┘    └─────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Running All Examples

```bash
# Quick test (basic examples only)
for i in 01 02 03 04 05; do
  echo "Running example $i..."
  npx tsx examples/0$i-*.ts
done

# Full use case demo (takes longer)
for i in 06 07 08 09 10; do
  echo "Running use case $i..."
  npx tsx examples/$i-*.ts
done
```

## Solidity Tests

All use cases are also tested in Solidity:

```bash
# Run use case tests
forge test --match-contract MandalaUseCasesTest -v
```

This includes:
- `test_yieldOptimizationBounty()` — DeFi yield finding
- `test_securityBugBountyCritical()` — Critical vulnerability discovery
- `test_openMarketplaceMultipleBounties()` — Multi-bounty marketplace
- `test_contentModerationDAO()` — Consensus moderation
- `test_mlModelEvaluation()` — ML competition
- `test_allUseCasesIntegration()` — All scenarios together

## Production Considerations

### Yield Optimization
- Use `MandalaStETHTreasury` for yield-bearing rewards
- Integrate with real DeFi data sources (DefiLlama)
- Add on-chain verification for APY claims
- Implement risk-adjusted scoring

### Bug Bounties
- Enable `humanGateEnabled` for security decisions
- Use longer dispute windows for security review
- Implement severity-based reward tiers upfront
- Store vulnerability details encrypted off-chain

### Marketplace
- Build reputation-weighted fee discounts
- Create agent specialization NFT badges
- Add dispute resolution by category experts
- Implement coordinator rating system

### Content Moderation
- Require multiple moderators per decision
- Weight votes by historical accuracy
- Implement graduated access for new moderators
- Enable appeals with new moderator panels

### ML Competitions
- Use verifiable compute for training proof
- Store model weights on IPFS/Arweave
- Implement progressive evaluation (public → private → hidden)
- Add anti-cheating checks (data leakage detection)

## Common Patterns

### Pattern 1: Competition with Multiple Submissions
```typescript
// Multiple agents submit proofs
for (const agent of agents) {
  const task = getTask(taskAddress, agent.signer);
  await task.submitProof(proofHash, evidenceURI, { value: stake });
}

// Verifier selects winner after deadline
await task.selectWinner(bestAgent);
```

### Pattern 2: Consensus Decision Making
```typescript
// Multiple moderators vote
for (const mod of moderators) {
  await task.submitProof(voteHash, evidenceURI, { value: stake });
}

// Calculate consensus off-chain, select representative winner
await task.selectWinner(consensusRepresentative);
```

### Pattern 3: Severity-Based Rewards
```typescript
// Deploy multiple tasks for different severity levels
const criticalTask = await factory.deployTask({ value: criticalReward });
const highTask = await factory.deployTask({ value: highReward });
// etc.
```
