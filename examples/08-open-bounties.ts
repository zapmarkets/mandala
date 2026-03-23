#!/usr/bin/env tsx
/**
 * Example 08: Open Agent Bounty Marketplace
 * 
 * Use Case: A competitive marketplace where multiple coordinators post
 * bounties and agents compete across different task types. Demonstrates
 * scale and variety of the Mandala protocol.
 * 
 * This example demonstrates:
 *   - Multiple concurrent bounties (task pool)
 *   - Agents with different specializations
 *   - Dynamic pricing based on reputation
 *   - Cross-task reputation building
 *   - Agent specialization matching
 * 
 * Bounty Types:
 *   - Code Review: Review PRs, find issues
 *   - Data Labeling: Label training data for ML
 *   - Translation: Translate content between languages
 *   - Research: Gather information on topics
 *   - Testing: Run test suites, report failures
 * 
 * Usage: npx tsx examples/08-open-bounties.ts
 */
import {
  getProvider, getSigner, getRegistry, getFactory, getTask,
  ensureRegistered, log, shortAddr, ENV, TaskStatus,
  parseEther, formatEther, ZeroAddress, keccak256, toUtf8Bytes,
} from "../scripts/setup";
import { Wallet } from "ethers";

const DIVIDER = "─".repeat(60);

function section(title: string) {
  console.log(`\n┌${DIVIDER}┐`);
  console.log(`│  ${title.padEnd(58)}│`);
  console.log(`└${DIVIDER}┘`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

enum BountyType {
  CodeReview = "Code Review",
  DataLabeling = "Data Labeling",
  Translation = "Translation",
  Research = "Research",
  Testing = "Testing",
}

interface Bounty {
  id: number;
  type: BountyType;
  title: string;
  reward: bigint;
  stake: bigint;
  deadline: number;
  requirements: string;
  taskAddress?: string;
}

interface Agent {
  label: string;
  signer: Wallet;
  specialization: BountyType;
  skillLevel: number;  // 1-10
  reputation: number;
}

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Mandala — Open Agent Bounty Marketplace                  ║");
  console.log("║  Multiple bounties. Specialized agents. Competitive.      ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  log("NET", `${network.name} (chain ${network.chainId})`);

  // ── Setup marketplace participants ────────────────────────────
  section("Marketplace Participants");

  const coordinatorA = getSigner(ENV.coordinatorKey);
  const coordinatorB = ENV.coordinatorBKey
    ? new Wallet(ENV.coordinatorBKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const coordinatorC = ENV.coordinatorCKey
    ? new Wallet(ENV.coordinatorCKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const agent1 = ENV.workerAKey
    ? new Wallet(ENV.workerAKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const agent2 = ENV.workerBKey
    ? new Wallet(ENV.workerBKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const agent3 = ENV.workerCKey
    ? new Wallet(ENV.workerCKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const agent4 = ENV.workerDKey
    ? new Wallet(Wallet.createRandom().privateKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const verifier = ENV.verifierKey
    ? new Wallet(ENV.verifierKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const coordinators = [
    { label: "Coord-A (DeFi)", signer: coordinatorA },
    { label: "Coord-B (AI)", signer: coordinatorB },
    { label: "Coord-C (Content)", signer: coordinatorC },
  ];

  const agents: Agent[] = [
    { label: "Agent-1", signer: agent1, specialization: BountyType.CodeReview, skillLevel: 9, reputation: 0 },
    { label: "Agent-2", signer: agent2, specialization: BountyType.DataLabeling, skillLevel: 8, reputation: 0 },
    { label: "Agent-3", signer: agent3, specialization: BountyType.Translation, skillLevel: 7, reputation: 0 },
    { label: "Agent-4", signer: agent4, specialization: BountyType.CodeReview, skillLevel: 6, reputation: 0 },
  ];

  log("PARTICIPANTS", `${coordinators.length} coordinators, ${agents.length} agents, 1 verifier`);

  for (const c of coordinators) {
    const addr = await c.signer.getAddress();
    const bal = formatEther(await provider.getBalance(addr));
    log("COORD", `${c.label}: ${shortAddr(addr)} (${bal} ETH)`);
  }

  for (const a of agents) {
    const addr = await a.signer.getAddress();
    const bal = formatEther(await provider.getBalance(addr));
    log("AGENT", `${a.label}: ${shortAddr(addr)} | ${a.specialization} Lv.${a.skillLevel} (${bal} ETH)`);
  }

  // ── Register all participants ─────────────────────────────────
  section("Step 1: Register Marketplace Participants");

  for (const c of coordinators) {
    const registry = getRegistry(c.signer as Wallet);
    await ensureRegistered(registry, c.signer as Wallet, `coord-${c.label.split(' ')[0].toLowerCase()}`);
  }

  for (const a of agents) {
    const registry = getRegistry(a.signer as Wallet);
    await ensureRegistered(registry, a.signer as Wallet, `agent-${a.label.toLowerCase()}`);
  }

  const verifierRegistry = getRegistry(verifier);
  await ensureRegistered(verifierRegistry, verifier, "verifier-marketplace");

  log("REGISTRY", "All participants registered ✓");

  // ── Coordinators post bounties ────────────────────────────────
  section("Step 2: Post Open Bounties");

  const bounties: Bounty[] = [
    {
      id: 1,
      type: BountyType.CodeReview,
      title: "Review Lending Protocol PR #142",
      reward: parseEther("0.03"),
      stake: parseEther("0.002"),
      deadline: Math.floor(Date.now() / 1000) + 120,
      requirements: "Review security, gas optimization, best practices",
    },
    {
      id: 2,
      type: BountyType.DataLabeling,
      title: "Label 1000 images for training",
      reward: parseEther("0.025"),
      stake: parseEther("0.0015"),
      deadline: Math.floor(Date.now() / 1000) + 100,
      requirements: "Image classification: cat/dog/bird with 95%+ accuracy",
    },
    {
      id: 3,
      type: BountyType.Translation,
      title: "Translate docs to Japanese",
      reward: parseEther("0.02"),
      stake: parseEther("0.001"),
      deadline: Math.floor(Date.now() / 1000) + 150,
      requirements: "Technical docs: 5000 words, native speaker quality",
    },
    {
      id: 4,
      type: BountyType.CodeReview,
      title: "Audit NFT Marketplace Contract",
      reward: parseEther("0.04"),
      stake: parseEther("0.003"),
      deadline: Math.floor(Date.now() / 1000) + 180,
      requirements: "Full security audit with severity classification",
    },
  ];

  const factoryA = getFactory(coordinatorA);
  const factoryB = getFactory(coordinatorB);
  const factoryC = getFactory(coordinatorC);
  const factories = [factoryA, factoryB, factoryC, factoryA];

  console.log("\n┌────┬──────────────────────┬───────────────────┬────────────┬─────────────┐");
  console.log("│ ID │ Bounty               │ Type              │ Reward     │ Duration    │");
  console.log("├────┼──────────────────────┼───────────────────┼────────────┼─────────────┤");

  for (let i = 0; i < bounties.length; i++) {
    const b = bounties[i];
    const factory = factories[i];
    const coordinator = coordinators[i % coordinators.length].signer;

    const criteriaHash = keccak256(toUtf8Bytes(b.requirements));
    
    const tx = await factory.deployTask({
      verifier: ZeroAddress,
      token: ZeroAddress,
      stakeRequired: b.stake,
      deadline: b.deadline,
      disputeWindow: 30,
      criteriaHash,
      criteriaURI: `ipfs://QmBounty${b.id}`,
      humanGateEnabled: false,
    }, { value: b.reward });

    const receipt = await tx.wait();
    for (const l of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog({ topics: l.topics as string[], data: l.data });
        if (parsed?.name === "TaskDeployed") {
          b.taskAddress = parsed.args.taskAddress;
        }
      } catch {}
    }

    const title = b.title.slice(0, 20).padEnd(20);
    const type = b.type.padEnd(17);
    const reward = `${formatEther(b.reward)} ETH`.padEnd(10);
    const duration = `${b.deadline - Math.floor(Date.now() / 1000)}s`.padEnd(11);
    console.log(`│ ${b.id.toString().padEnd(2)} │ ${title} │ ${type} │ ${reward} │ ${duration} │`);
  }
  console.log("└────┴──────────────────────┴───────────────────┴────────────┴─────────────┘");

  log("MARKETPLACE", `${bounties.length} bounties posted with ${formatEther(bounties.reduce((a, b) => a + b.reward, 0n))} ETH total rewards`);

  // ── Agents find and complete relevant bounties ────────────────
  section("Step 3: Agent Specialization Matching");

  // Agent 1 (Code Review specialist) takes bounties #1 and #4
  // Agent 2 (Data Labeling) takes bounty #2
  // Agent 3 (Translation) takes bounty #3
  // Agent 4 (Code Review, lower skill) tries but might lose to Agent 1

  const assignments = [
    { agent: agents[0], bounty: bounties[0], content: "Security review: 2 issues found, gas saved 2.3k" },
    { agent: agents[0], bounty: bounties[3], content: "Audit complete: 1 High, 2 Medium findings" },
    { agent: agents[1], bounty: bounties[1], content: "1000 images labeled, accuracy 97.3%" },
    { agent: agents[2], bounty: bounties[2], content: "5000 words translated, cultural review done" },
    { agent: agents[3], bounty: bounties[0], content: "Code review: 1 issue found" },  // Competing with agent 1
  ];

  console.log("\n┌─────────┬─────────────┬────────────────────────────────────────────┐");
  console.log("│ Agent   │ Bounty      │ Submission                                 │");
  console.log("├─────────┼─────────────┼────────────────────────────────────────────┤");

  for (const a of assignments) {
    if (!a.bounty.taskAddress) continue;
    
    const task = getTask(a.bounty.taskAddress, a.agent.signer);
    const proofHash = keccak256(toUtf8Bytes(a.content));
    const evidenceURI = `ipfs://QmWork_${a.agent.label}_${a.bounty.id}`;

    const tx = await task.submitProof(proofHash, evidenceURI, { value: a.bounty.stake });
    await tx.wait();

    const agentName = a.agent.label.padEnd(7);
    const bountyId = `#${a.bounty.id}`.padEnd(11);
    const content = a.content.slice(0, 42).padEnd(42);
    console.log(`│ ${agentName} │ ${bountyId} │ ${content} │`);
  }
  console.log("└─────────┴─────────────┴────────────────────────────────────────────┘");

  // ── Wait and process each bounty ──────────────────────────────
  section("Step 4: Bounty Processing");

  const results: { bounty: Bounty; winner: string; agentLabel: string; reward: bigint }[] = [];

  for (const bounty of bounties) {
    if (!bounty.taskAddress) continue;

    const task = getTask(bounty.taskAddress, verifier);
    
    // Fast-forward past deadline
    await sleep(1000);
    
    const submissions = await task.getSubmissions();
    if (submissions.length === 0) {
      log(`BOUNTY-${bounty.id}`, "No submissions — skipped");
      continue;
    }

    log(`BOUNTY-${bounty.id}`, `${bounty.title.slice(0, 25)} — ${submissions.length} submission(s)`);

    // Select winner (highest skill agent in case of tie)
    let bestSubmission = submissions[0];
    let bestSkill = 0;
    let winnerLabel = "Unknown";

    for (const sub of submissions) {
      const agent = agents.find(a => 
        (a.signer as Wallet).address.toLowerCase() === sub.agent.toLowerCase()
      );
      if (agent && agent.skillLevel > bestSkill) {
        bestSkill = agent.skillLevel;
        bestSubmission = sub;
        winnerLabel = agent.label;
      }
    }

    // Select winner
    const selectTx = await task.selectWinner(bestSubmission.agent);
    await selectTx.wait();

    // Fast-forward past dispute window
    await sleep(500);

    // Finalize
    const finalizeTx = await task.finalize();
    await finalizeTx.wait();

    results.push({
      bounty,
      winner: bestSubmission.agent,
      agentLabel: winnerLabel,
      reward: bounty.reward,
    });

    log(`BOUNTY-${bounty.id}`, `Winner: ${winnerLabel} (Skill Lv.${bestSkill}) → ${formatEther(bounty.reward)} ETH`);
  }

  // ── Results summary ───────────────────────────────────────────
  section("Step 5: Marketplace Results");

  console.log("\n┌─────────────┬────────────────────┬────────────┬─────────────┐");
  console.log("│ Agent       │ Bounties Won       │ Total Earn │ Win Rate    │");
  console.log("├─────────────┼────────────────────┼────────────┼─────────────┤");

  for (const agent of agents) {
    const agentAddr = await agent.signer.getAddress();
    const won = results.filter(r => r.winner.toLowerCase() === agentAddr.toLowerCase());
    const totalEarned = won.reduce((a, b) => a + b.reward, 0n);
    const winRate = `${won.length}/${assignments.filter(a => a.agent.label === agent.label).length}`;

    const label = agent.label.padEnd(11);
    const wonStr = won.map(w => `#${w.bounty.id}`).join(', ').padEnd(18);
    const earned = `${formatEther(totalEarned)} ETH`.padEnd(10);
    console.log(`│ ${label} │ ${wonStr} │ ${earned} │ ${winRate.padEnd(11)} │`);
  }
  console.log("└─────────────┴────────────────────┴────────────┴─────────────┘");

  // ── Reputation update ─────────────────────────────────────────
  section("Step 6: Reputation Tracking");

  const registry = getRegistry(coordinatorA);

  console.log("\n┌─────────────┬──────────────────┬──────────┬─────────────────┐");
  console.log("│ Agent       │ Specialization   │ Score    │ Status          │");
  console.log("├─────────────┼──────────────────┼──────────┼─────────────────┤");

  for (const agent of agents) {
    const addr = await agent.signer.getAddress();
    const info = await registry.getAgent(addr);
    const rep = await registry.reputationScore(addr);
    
    const wins = Number(info.wins);
    const status = wins > 0 ? "🏆 Rising Star" : "📊 Building";
    
    console.log(`│ ${agent.label.padEnd(11)} │ ${agent.specialization.padEnd(16)} │ ${rep.toString().padEnd(8)} │ ${status.padEnd(15)} │`);
  }
  console.log("└─────────────┴──────────────────┴──────────┴─────────────────┘");

  // ── Marketplace metrics ───────────────────────────────────────
  section("Marketplace Metrics");

  const totalRewards = bounties.reduce((a, b) => a + b.reward, 0n);
  const totalDistributed = results.reduce((a, b) => a + b.reward, 0n);
  const completionRate = (results.length / bounties.length * 100).toFixed(0);

  log("METRICS", `Total bounties posted: ${bounties.length}`);
  log("METRICS", `Bounties completed: ${results.length} (${completionRate}%)`);
  log("METRICS", `Total rewards pool: ${formatEther(totalRewards)} ETH`);
  log("METRICS", `Rewards distributed: ${formatEther(totalDistributed)} ETH`);
  log("METRICS", `Average bounty size: ${formatEther(totalRewards / BigInt(bounties.length))} ETH`);

  // ── Scaling notes ─────────────────────────────────────────────
  section("Scaling the Marketplace");

  log("SCALE", "For production marketplace:");
  log("SCALE", "  1. Implement reputation-weighted stake reduction");
  log("SCALE", "  2. Add agent skill verification (on-chain credentials)");
  log("SCALE", "  3. Create bounty categories with specialized verifiers");
  log("SCALE", "  4. Build reputation-based fee discounts");
  log("SCALE", "  5. Implement agent specializations (NFT badges)");
  log("SCALE", "  6. Add dispute resolution by category experts");
  log("SCALE", "  7. Create coordinator rating system");

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  MARKETPLACE SIMULATION COMPLETE ✓                        ║");
  console.log("║  Specialization works. Competition drives quality.        ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
