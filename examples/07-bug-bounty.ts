#!/usr/bin/env tsx
/**
 * Example 07: Smart Contract Bug Bounty
 * 
 * Use Case: Security researchers (agents) compete to find vulnerabilities
 * in deployed smart contracts. Winner is the agent that finds the most
 * critical, verifiable bug with a working exploit proof.
 * 
 * This example demonstrates:
 *   - High-stakes security bounties with significant rewards
 *   - Severity-based scoring (Critical > High > Medium > Low)
 *   - Proof-of-exploit submissions (hashed for disclosure protection)
 *   - Human-verified disputes for security-critical decisions
 *   - Reputation building for security researchers
 * 
 * Real-world applications:
 *   - Pre-launch contract audits
 *   - Live bug bounty programs
 *   - Formal verification challenges
 *   - Gas optimization competitions
 * 
 * Usage: npx tsx examples/07-bug-bounty.ts
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

// Bug severity levels
enum Severity {
  Critical = 4,  // Funds at risk, no user interaction
  High = 3,      // Funds at risk, requires interaction
  Medium = 2,    // State corruption, no funds risk
  Low = 1,       // Best practices, gas optimization
  Info = 0,      // Documentation, style
}

interface BugReport {
  severity: Severity;
  title: string;
  description: string;
  affectedContract: string;
  lineNumbers: number[];
  exploitScenario: string;
  suggestedFix: string;
  proofOfConcept: string;  // Hashed for responsible disclosure
}

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Mandala — Smart Contract Bug Bounty                      ║");
  console.log("║  Find vulnerabilities. Prove exploits. Earn rewards.      ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  log("NET", `${network.name} (chain ${network.chainId})`);

  // ── Setup security researchers ────────────────────────────────
  section("Security Research Team");

  const coordinator = getSigner(ENV.coordinatorKey);
  const securityResearcherA = ENV.workerAKey
    ? new Wallet(ENV.workerAKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const securityResearcherB = ENV.workerBKey
    ? new Wallet(ENV.workerBKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const securityResearcherC = ENV.workerCKey
    ? new Wallet(ENV.workerCKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const verifier = ENV.verifierKey
    ? new Wallet(ENV.verifierKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const agents = [
    { label: "Protocol Team", signer: coordinator, role: "Runs bounty program" },
    { label: "Researcher A ", signer: securityResearcherA, role: "Auditor, ex-Trail of Bits" },
    { label: "Researcher B ", signer: securityResearcherB, role: "Smart contract security" },
    { label: "Researcher C ", signer: securityResearcherC, role: "Vulnerability researcher" },
    { label: "Lead Verifier", signer: verifier, role: "Security lead, validates bugs" },
  ];

  for (const a of agents) {
    const addr = await a.signer.getAddress();
    const bal = formatEther(await provider.getBalance(addr));
    log("AGENT", `${a.label}: ${shortAddr(addr)} (${bal} ETH)`);
    log("ROLE ", `       ↳ ${a.role}`);
  }

  // ── Register all agents ───────────────────────────────────────
  section("Step 1: Register Security Researchers");

  for (const a of agents) {
    const registry = getRegistry(a.signer as Wallet);
    const role = a.label.trim().toLowerCase().replace(/\s+/g, '-');
    await ensureRegistered(registry, a.signer as Wallet, `security-${role}`);
  }

  // ── Deploy bug bounty task ────────────────────────────────────
  section("Step 2: Launch Bug Bounty Program");

  const factory = getFactory(coordinator);
  const stakeRequired = parseEther("0.005");  // Higher stake for serious researchers
  const deadline = Math.floor(Date.now() / 1000) + 240; // 4 minutes
  const disputeWindow = 120; // 2 minutes for security review
  
  // Bounty scope: New lending protocol contracts
  const criteriaHash = keccak256(toUtf8Bytes(
    "Find vulnerabilities in MandalaLending v1.0.0: reentrancy, oracle manipulation, access control. Proof of concept required."
  ));

  // Bounty rewards by severity (in ETH)
  const bountyRewards = {
    [Severity.Critical]: parseEther("0.5"),
    [Severity.High]: parseEther("0.25"),
    [Severity.Medium]: parseEther("0.1"),
    [Severity.Low]: parseEther("0.02"),
  };

  log("BOUNTY", "Program: Mandala Lending Protocol Bug Bounty");
  log("BOUNTY", `Stake Required: ${formatEther(stakeRequired)} ETH (prevents spam)`);
  log("BOUNTY", `Duration: 4 minutes (simulated - real bounties run for weeks)`);
  log("BOUNTY", `Dispute Window: 2 minutes (allows security review)`);
  
  log("REWARDS", "Severity-based payouts:");
  log("REWARDS", `  Critical: ${formatEther(bountyRewards[Severity.Critical])} ETH`);
  log("REWARDS", `  High:     ${formatEther(bountyRewards[Severity.High])} ETH`);
  log("REWARDS", `  Medium:   ${formatEther(bountyRewards[Severity.Medium])} ETH`);
  log("REWARDS", `  Low:      ${formatEther(bountyRewards[Severity.Low])} ETH`);

  const reward = parseEther("0.5");  // Max reward (Critical)

  const tx = await factory.deployTask({
    verifier: ZeroAddress,
    token: ZeroAddress,
    stakeRequired,
    deadline,
    disputeWindow,
    criteriaHash,
    criteriaURI: "ipfs://QmBountyScope",
    humanGateEnabled: true,  // Enable human review for security
  }, { value: reward });

  const receipt = await tx.wait();
  let taskAddress = "";
  for (const l of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog({ topics: l.topics as string[], data: l.data });
      if (parsed?.name === "TaskDeployed") taskAddress = parsed.args.taskAddress;
    } catch {}
  }

  log("TASK", `Bounty contract deployed: ${taskAddress}`);
  log("TASK", `Reward locked in escrow: ${formatEther(reward)} ETH`);

  // ── Researchers submit bug reports ────────────────────────────
  section("Step 3: Bug Report Submissions");

  // Simulate different bug findings
  const bugReports: BugReport[] = [
    {
      severity: Severity.Medium,
      title: "Missing input validation in deposit()",
      description: "No check for zero amount deposits",
      affectedContract: "MandalaLending.sol",
      lineNumbers: [145, 146],
      exploitScenario: "Can emit events with zero values, confusing indexers",
      suggestedFix: "Add require(_amount > 0, 'Zero deposit')",
      proofOfConcept: "POC: Call deposit(0) - transaction succeeds",
    },
    {
      severity: Severity.Critical,
      title: "Reentrancy in withdraw() function",
      description: "External call before state update allows reentrancy attack",
      affectedContract: "MandalaLending.sol",
      lineNumbers: [203, 210],
      exploitScenario: "Attacker can drain contract by recursively calling withdraw",
      suggestedFix: "Use Checks-Effects-Interactions pattern + reentrancy guard",
      proofOfConcept: "POC: Deploy attacker contract, call withdraw, receive callback, repeat",
    },
    {
      severity: Severity.High,
      title: "Oracle manipulation via flash loan",
      description: "Price oracle uses spot price, vulnerable to flash loan manipulation",
      affectedContract: "MandalaOracle.sol",
      lineNumbers: [89, 95],
      exploitScenario: "Flash loan → manipulate price → liquidate users → repay loan",
      suggestedFix: "Use TWAP oracle or Chainlink price feeds",
      proofOfConcept: "POC: Flash borrow 1000 ETH, manipulate Uniswap price, liquidate",
    },
  ];

  const researchers = [
    { label: "RESEARCHER-A", signer: securityResearcherA, report: bugReports[0] },
    { label: "RESEARCHER-B", signer: securityResearcherB, report: bugReports[1] },
    { label: "RESEARCHER-C", signer: securityResearcherC, report: bugReports[2] },
  ];

  for (const r of researchers) {
    const task = getTask(taskAddress, r.signer as Wallet);
    const researcherAddr = await (r.signer as Wallet).getAddress();
    
    // Create commitment hash (responsible disclosure - full details off-chain)
    const commitmentData = JSON.stringify({
      severity: r.report.severity,
      title: r.report.title,
      researcher: researcherAddr,
      timestamp: Date.now(),
      // Actual proof is stored off-chain with encrypted access
      proofHash: keccak256(toUtf8Bytes(r.report.proofOfConcept)),
    });
    const proofHash = keccak256(toUtf8Bytes(commitmentData));
    const evidenceURI = `ipfs://QmBugReport_${r.report.title.replace(/\s+/g, '_')}`;

    const severityColors = ['ℹ️', '🔹', '🟡', '🟠', '🔴'];
    const severityLabels = ['Info', 'Low', 'Medium', 'High', 'Critical'];
    
    log(r.label, `Submitted: ${severityColors[r.report.severity]} ${severityLabels[r.report.severity]} — ${r.report.title}`);
    log(r.label, `  Contract: ${r.report.affectedContract} (lines ${r.report.lineNumbers.join(', ')})`);
    log(r.label, `  Impact: ${r.report.exploitScenario.slice(0, 50)}...`);
    
    const stx = await task.submitProof(proofHash, evidenceURI, { value: stakeRequired });
    await stx.wait();
    log(r.label, `Report committed on-chain ✓`);
    
    await sleep(1500);
  }

  const task = getTask(taskAddress, coordinator);
  log("INFO", `Total bug reports: ${await task.submissionCount()}`);

  // ── Display vulnerability leaderboard ─────────────────────────
  section("Vulnerability Assessment Board");

  console.log("┌──────────────┬────────────┬─────────────────────────────────────┬─────────────┐");
  console.log("│ Researcher   │ Severity   │ Title                               │ Potential   │");
  console.log("├──────────────┼────────────┼─────────────────────────────────────┼─────────────┤");
  
  const severityLabels = ['Info', 'Low', 'Medium', 'High', 'Critical'];
  for (const r of researchers) {
    const sevLabel = severityLabels[r.report.severity].padEnd(10);
    const title = r.report.title.slice(0, 35).padEnd(35);
    const reward = formatEther(bountyRewards[r.report.severity as Severity] || 0n);
    console.log(`│ ${r.label.padEnd(12)} │ ${sevLabel} │ ${title} │ ${reward.padEnd(10)} │`);
  }
  console.log("└──────────────┴────────────┴─────────────────────────────────────┴─────────────┘");

  log("ANALYSIS", "🔴 Critical: Reentrancy vulnerability can drain entire contract");
  log("ANALYSIS", "🟠 High: Oracle manipulation can cause unfair liquidations");
  log("ANALYSIS", "🟡 Medium: Input validation issue affects data integrity");

  // ── Wait for deadline ─────────────────────────────────────────
  section("Step 4: Review Period");

  while (true) {
    const remaining = await task.timeRemaining();
    if (Number(remaining) === 0) break;
    log("WAIT", `Review period ends in ${remaining}s...`);
    await sleep(20000);
  }
  log("WAIT", "Bug submission period closed ✓");

  // ── Verifier evaluates bugs ───────────────────────────────────
  section("Step 5: Security Review");

  const taskForVerifier = getTask(taskAddress, verifier);
  const submissions = await taskForVerifier.getSubmissions();

  log("VERIFY", `Reviewing ${submissions.length} vulnerability reports...`);
  log("VERIFY", "Validating proof of concepts (off-chain)...");
  
  // Score by severity
  let highestSeverity = Severity.Info;
  let winner = submissions[0];
  
  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    const report = researchers[i].report;
    const sevLabel = severityLabels[report.severity];
    
    log("VERIFY", `  ${shortAddr(sub.agent)}: ${sevLabel} — Validating POC...`);
    await sleep(1000);
    log("VERIFY", `    ↳ POC verified ✓ Impact confirmed`);
    
    if (report.severity > highestSeverity) {
      highestSeverity = report.severity;
      winner = sub;
    }
  }

  const winnerLabel = researchers.find(r => 
    (r.signer as Wallet).address.toLowerCase() === winner.agent.toLowerCase()
  )?.label || "Unknown";

  log("VERIFY", `Winner: ${winnerLabel} — ${severityLabels[highestSeverity]} vulnerability`);
  log("VERIFY", `  → Critical reentrancy bug warrants maximum payout`);

  const selectTx = await taskForVerifier.selectWinner(winner.agent);
  await selectTx.wait();
  log("VERIFY", `Winner recorded on-chain ✓`);

  // ── Wait for dispute window (security review) ─────────────────
  section("Step 6: Security Dispute Window");

  log("DISPUTE", "Human security review period active...");
  log("DISPUTE", "Other researchers can dispute if they found the same bug first");
  
  while (true) {
    const dRemaining = await task.disputeTimeRemaining();
    if (Number(dRemaining) === 0) break;
    log("WAIT", `Security review: ${dRemaining}s remaining...`);
    await sleep(20000);
  }
  log("WAIT", "No disputes raised — bounty validated ✓");

  // ── Finalize and pay bounty ───────────────────────────────────
  section("Step 7: Bounty Payout");

  const balancesBefore: Record<string, bigint> = {};
  for (const r of researchers) {
    const addr = await (r.signer as Wallet).getAddress();
    balancesBefore[addr] = await provider.getBalance(addr);
  }

  const finalizeTx = await task.finalize();
  const finalizeReceipt = await finalizeTx.wait();

  log("PAYOUT", `Bounty finalized ✓`);
  log("PAYOUT", `Critical vulnerability reward: ${formatEther(reward)} ETH`);
  log("PAYOUT", `Researcher reputation +${highestSeverity * 25} points`);

  // Show results
  console.log("\n┌──────────────┬────────────────────┬────────────────────┬─────────────┐");
  console.log("│ Researcher   │ Balance Change     │ Status             │ Reputation  │");
  console.log("├──────────────┼────────────────────┼────────────────────┼─────────────┤");
  
  for (const r of researchers) {
    const addr = await (r.signer as Wallet).getAddress();
    const before = balancesBefore[addr];
    const after = await provider.getBalance(addr);
    const change = after - before;
    
    const isWinner = addr.toLowerCase() === winner.agent.toLowerCase();
    const changeStr = isWinner 
      ? `+${formatEther(change)} ETH 🔥` 
      : `+${formatEther(change)} ETH`;
    const status = isWinner ? "🏆 Bounty Winner" : "Stake Returned";
    const repGain = isWinner ? `+${highestSeverity * 25}` : "+5";
    
    console.log(`│ ${r.label.padEnd(12)} │ ${changeStr.padEnd(18)} │ ${status.padEnd(18)} │ ${repGain.padEnd(11)} │`);
  }
  console.log("└──────────────┴────────────────────┴────────────────────┴─────────────┘");

  // ── Final state ───────────────────────────────────────────────
  section("Bounty Program Summary");

  const config = await task.getConfig();
  log("STATE", `Bounty status: ${TaskStatus[Number(config.status)]}`);

  const registry = getRegistry(coordinator);
  for (const r of researchers) {
    const addr = await (r.signer as Wallet).getAddress();
    const info = await registry.getAgent(addr);
    const rep = await registry.reputationScore(addr);
    const isWinner = addr.toLowerCase() === winner.agent.toLowerCase();
    
    if (isWinner) {
      log("SECURITY-LEADERBOARD", `${r.label}: Reputation ${rep} ↑ | Wins: ${info.wins} | Critical findings: 1`);
    }
  }

  // ── Best practices ────────────────────────────────────────────
  section("Security Bounty Best Practices");

  log("TIP", "For running effective bug bounties:");
  log("TIP", "  1. Use responsible disclosure — hash proofs, details off-chain");
  log("TIP", "  2. Enable humanGateEnabled for security-critical decisions");
  log("TIP", "  3. Set severity-based reward tiers upfront");
  log("TIP", "  4. Require proof of concept — not just descriptions");
  log("TIP", "  5. Use longer dispute windows for security review");
  log("TIP", "  6. Build researcher reputation over multiple bounties");
  log("TIP", "  7. Consider immunefi-style escalation paths");

  log("WARNING", "Never deploy bug bounty contracts without:");
  log("WARNING", "  - Multiple verifier agents (consensus recommended)");
  log("WARNING", "  - Human override capability");
  log("WARNING", "  - Clear scope and out-of-scope definitions");

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  BUG BOUNTY COMPLETE ✓                                    ║");
  console.log("║  Critical vulnerability found, verified, and patched      ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
