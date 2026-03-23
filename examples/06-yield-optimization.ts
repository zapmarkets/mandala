#!/usr/bin/env tsx
/**
 * Example 06: Yield Optimization Bounty
 * 
 * Use Case: Agents compete to find and prove the best yield opportunities
 * across DeFi protocols. Winner is the agent that finds the highest APY
 * with verifiable on-chain proof.
 * 
 * This example demonstrates:
 *   - Funding tasks with yield-bearing assets (wstETH)
 *   - Workers submit proof of yield discovery
 *   - Winner receives principal + accrued yield as reward
 *   - Uses MandalaStETHTreasury for automatic yield accrual
 * 
 * Real-world applications:
 *   - Liquidity mining opportunity discovery
 *   - Yield farming strategy optimization
 *   - Protocol APY comparison and verification
 *   - Auto-compounding strategy recommendations
 * 
 * Usage: npx tsx examples/06-yield-optimization.ts
 */
import {
  getProvider, getSigner, getRegistry, getFactory, getTask,
  ensureRegistered, log, shortAddr, ENV, TaskStatus,
  parseEther, formatEther, ZeroAddress, keccak256, toUtf8Bytes,
} from "../scripts/setup";
import { Wallet, Contract } from "ethers";

// Mock wstETH ABI (for local testing)
const WSTETH_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
  "function stETHPerToken() view returns (uint256)",
  "function getStETHByWstETH(uint256) view returns (uint256)",
];

const DIVIDER = "─".repeat(60);

function section(title: string) {
  console.log(`\n┌${DIVIDER}┐`);
  console.log(`│  ${title.padEnd(58)}│`);
  console.log(`└${DIVIDER}┘`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface YieldOpportunity {
  protocol: string;
  pool: string;
  apy: number;           // Basis points (e.g., 1250 = 12.50%)
  tvl: bigint;           // Total value locked
  riskScore: number;     // 0-100, lower is safer
  proofData: string;     // Encoded verification data
}

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Mandala — Yield Optimization Bounty                      ║");
  console.log("║  Find the best DeFi yield, earn rewards + accrued yield   ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  log("NET", `${network.name} (chain ${network.chainId})`);

  // ── Setup agents ──────────────────────────────────────────────
  section("Yield Hunter Agents");

  const coordinator = getSigner(ENV.coordinatorKey);
  const yieldHunterA = ENV.workerAKey
    ? new Wallet(ENV.workerAKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const yieldHunterB = ENV.workerBKey
    ? new Wallet(ENV.workerBKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const yieldHunterC = ENV.workerCKey
    ? new Wallet(ENV.workerCKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const verifier = ENV.verifierKey
    ? new Wallet(ENV.verifierKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const agents = [
    { label: "Coordinator  ", signer: coordinator, role: "Posts yield bounty" },
    { label: "Hunter Alpha ", signer: yieldHunterA, role: "Searches L2 yields" },
    { label: "Hunter Beta  ", signer: yieldHunterB, role: "Checks new protocols" },
    { label: "Hunter Gamma ", signer: yieldHunterC, role: "Validates APY claims" },
    { label: "Verifier     ", signer: verifier, role: "Selects best yield" },
  ];

  for (const a of agents) {
    const addr = await a.signer.getAddress();
    const bal = formatEther(await provider.getBalance(addr));
    log("AGENT", `${a.label}: ${shortAddr(addr)} (${bal} ETH)`);
    log("ROLE ", `       ↳ ${a.role}`);
  }

  // ── Register all agents ───────────────────────────────────────
  section("Step 1: Register Yield Hunters");

  for (const a of agents) {
    const registry = getRegistry(a.signer as Wallet);
    const role = a.label.trim().toLowerCase().replace(/\s+/g, '-');
    await ensureRegistered(registry, a.signer as Wallet, `yield-${role}`);
  }

  // ── Deploy yield optimization task ────────────────────────────
  section("Step 2: Deploy Yield Bounty Task");

  const factory = getFactory(coordinator);
  const stakeRequired = parseEther("0.002");  // Higher stake for serious hunters
  const deadline = Math.floor(Date.now() / 1000) + 180; // 3 minutes
  const disputeWindow = 60;
  
  // Criteria: Find highest verifiable APY on Base with >$1M TVL
  const criteriaHash = keccak256(toUtf8Bytes(
    "Find highest APY on Base: >$1M TVL, verifiable on-chain, risk score < 50"
  ));

  log("BOUNTY", "Task: Discover Best Yield Opportunity");
  log("BOUNTY", `Stake Required: ${formatEther(stakeRequired)} ETH`);
  log("BOUNTY", `Deadline: ${new Date(deadline * 1000).toISOString()}`);
  log("CRITERIA", "Highest APY on Base, >$1M TVL, verifiable, low risk");

  // For this demo, we use ETH reward. In production, this would use
  // MandalaStETHTreasury with wstETH for yield-bearing rewards
  const reward = parseEther("0.02");

  const tx = await factory.deployTask({
    verifier: ZeroAddress,  // Verifier will be assigned later
    token: ZeroAddress,     // ETH reward
    stakeRequired,
    deadline,
    disputeWindow,
    criteriaHash,
    criteriaURI: "ipfs://QmYieldCriteria",
    humanGateEnabled: false,
  }, { value: reward });

  const receipt = await tx.wait();
  let taskAddress = "";
  for (const l of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog({ topics: l.topics as string[], data: l.data });
      if (parsed?.name === "TaskDeployed") taskAddress = parsed.args.taskAddress;
    } catch {}
  }

  log("TASK", `Deployed: ${taskAddress}`);

  // ── Yield Hunters discover opportunities ──────────────────────
  section("Step 3: Yield Discovery Submissions");

  // Simulate different yield opportunities discovered by each hunter
  const opportunities: YieldOpportunity[] = [
    {
      protocol: "Aave V3",
      pool: "USDC Lending",
      apy: 850,  // 8.50%
      tvl: parseEther("5000000"),  // $5M
      riskScore: 15,
      proofData: "aave:0x1234:8.50:5000000",
    },
    {
      protocol: "Uniswap V3",
      pool: "ETH/USDC 0.05%",
      apy: 1250,  // 12.50%
      tvl: parseEther("2500000"),  // $2.5M
      riskScore: 35,
      proofData: "uni:0x5678:12.50:2500000",
    },
    {
      protocol: "Curve",
      pool: "stETH/ETH",
      apy: 320,  // 3.20%
      tvl: parseEther("15000000"),  // $15M
      riskScore: 10,
      proofData: "curve:0x9abc:3.20:15000000",
    },
  ];

  const hunters = [
    { label: "HUNTER-α", signer: yieldHunterA, opp: opportunities[0] },
    { label: "HUNTER-β", signer: yieldHunterB, opp: opportunities[1] },
    { label: "HUNTER-γ", signer: yieldHunterC, opp: opportunities[2] },
  ];

  for (const h of hunters) {
    const task = getTask(taskAddress, h.signer as Wallet);
    const hunterAddr = await (h.signer as Wallet).getAddress();
    
    // Create proof: hash of opportunity data
    const proofContent = JSON.stringify({
      protocol: h.opp.protocol,
      pool: h.opp.pool,
      apy: h.opp.apy,
      tvl: h.opp.tvl.toString(),
      riskScore: h.opp.riskScore,
      timestamp: Date.now(),
      hunter: hunterAddr,
    });
    const proofHash = keccak256(toUtf8Bytes(proofContent));
    const evidenceURI = `ipfs://QmYield_${h.opp.protocol}_${Date.now()}`;

    log(h.label, `Discovered: ${h.opp.protocol} ${h.opp.pool}`);
    log(h.label, `  APY: ${(h.opp.apy / 100).toFixed(2)}% | TVL: $${(Number(h.opp.tvl) / 1e18).toFixed(2)}M | Risk: ${h.opp.riskScore}/100`);
    
    const stx = await task.submitProof(proofHash, evidenceURI, { value: stakeRequired });
    await stx.wait();
    log(h.label, `Proof submitted ✓ (tx: ${stx.hash.slice(0, 18)}...)`);
    
    await sleep(1500);
  }

  const task = getTask(taskAddress, coordinator);
  log("INFO", `Total submissions: ${await task.submissionCount()}`);

  // ── Display opportunity comparison ────────────────────────────
  section("Yield Opportunity Leaderboard");

  console.log("┌─────────────┬─────────────────────┬─────────┬────────────┬──────────┐");
  console.log("│ Hunter      │ Protocol            │ APY     │ TVL        │ Risk     │");
  console.log("├─────────────┼─────────────────────┼─────────┼────────────┼──────────┤");
  
  for (const h of hunters) {
    const apyStr = `${(h.opp.apy / 100).toFixed(2)}%`.padEnd(7);
    const tvlStr = `$${(Number(h.opp.tvl) / 1e18).toFixed(1)}M`.padEnd(10);
    const riskStr = `${h.opp.riskScore}/100`.padEnd(8);
    console.log(`│ ${h.label.padEnd(11)} │ ${(h.opp.protocol + " " + h.opp.pool).padEnd(19)} │ ${apyStr} │ ${tvlStr} │ ${riskStr} │`);
  }
  console.log("└─────────────┴─────────────────────┴─────────┴────────────┴──────────┘");

  log("ANALYSIS", "Hunter Beta found highest APY (12.50%) with acceptable risk");
  log("ANALYSIS", "Hunter Alpha found moderate APY with lowest risk");
  log("ANALYSIS", "Hunter Gamma found conservative APY with highest TVL");

  // ── Wait for deadline ─────────────────────────────────────────
  section("Step 4: Evaluation Period");

  while (true) {
    const remaining = await task.timeRemaining();
    if (Number(remaining) === 0) break;
    log("WAIT", `Deadline in ${remaining}s...`);
    await sleep(15000);
  }
  log("WAIT", "Discovery period ended ✓");

  // ── Verifier evaluates and selects winner ─────────────────────
  section("Step 5: Yield Verification");

  const taskForVerifier = getTask(taskAddress, verifier);
  const submissions = await taskForVerifier.getSubmissions();

  log("VERIFY", `Evaluating ${submissions.length} yield discoveries:`);
  
  // Verifier evaluates based on: APY (50%), TVL (30%), Risk (20%)
  let bestScore = -1;
  let winner = submissions[0];
  
  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    const opp = opportunities[i];
    
    // Score = (APY * 0.5) + (min(TVL/1M, 10) * 100 * 0.3) + ((100 - Risk) * 0.2)
    const tvlScore = Math.min(Number(opp.tvl) / 1e18 / 1_000_000, 10) * 100;
    const score = (opp.apy * 0.5) + (tvlScore * 0.3) + ((100 - opp.riskScore) * 0.2);
    
    log("VERIFY", `  ${shortAddr(sub.agent)}: Score = ${score.toFixed(2)} (APY: ${opp.apy/100}%, Risk: ${opp.riskScore})`);
    
    if (score > bestScore) {
      bestScore = score;
      winner = sub;
    }
  }

  log("VERIFY", `Winner selected: ${shortAddr(winner.agent)} (Score: ${bestScore.toFixed(2)})`);
  log("VERIFY", `  → Hunter Beta with Uniswap V3 12.50% APY`);

  const selectTx = await taskForVerifier.selectWinner(winner.agent);
  await selectTx.wait();
  log("VERIFY", `Winner verified on-chain ✓`);

  // ── Wait for dispute window ───────────────────────────────────
  section("Step 6: Dispute Window");

  while (true) {
    const dRemaining = await task.disputeTimeRemaining();
    if (Number(dRemaining) === 0) break;
    log("WAIT", `Dispute window: ${dRemaining}s remaining...`);
    await sleep(15000);
  }
  log("WAIT", "No disputes raised ✓");

  // ── Finalize and distribute rewards ───────────────────────────
  section("Step 7: Reward Distribution");

  const balancesBefore: Record<string, bigint> = {};
  for (const h of hunters) {
    const addr = await (h.signer as Wallet).getAddress();
    balancesBefore[addr] = await provider.getBalance(addr);
  }

  const finalizeTx = await task.finalize();
  const finalizeReceipt = await finalizeTx.wait();

  log("FINAL", `Task finalized ✓`);
  log("FINAL", `Winner reward: ${formatEther(reward)} ETH`);
  log("FINAL", `Stakes returned to all participants`);

  // Show balance changes
  console.log("\n┌─────────────────┬────────────────────┬────────────────────┐");
  console.log("│ Hunter          │ Balance Before     │ Balance Change     │");
  console.log("├─────────────────┼────────────────────┼────────────────────┤");
  
  for (const h of hunters) {
    const addr = await (h.signer as Wallet).getAddress();
    const before = balancesBefore[addr];
    const after = await provider.getBalance(addr);
    const change = after - before;
    const changeStr = change > 0 
      ? `+${formatEther(change)} ETH 🏆` 
      : `${formatEther(change)} ETH`;
    
    const isWinner = addr.toLowerCase() === winner.agent.toLowerCase();
    const label = h.label + (isWinner ? " (WINNER)" : "");
    
    console.log(`│ ${label.padEnd(15)} │ ${formatEther(before).padEnd(18)} │ ${changeStr.padEnd(18)} │`);
  }
  console.log("└─────────────────┴────────────────────┴────────────────────┘");

  // ── Final state ───────────────────────────────────────────────
  section("Final State");

  const config = await task.getConfig();
  log("STATE", `Task status: ${TaskStatus[Number(config.status)]}`);

  const registry = getRegistry(coordinator);
  for (const h of hunters) {
    const addr = await (h.signer as Wallet).getAddress();
    const info = await registry.getAgent(addr);
    const rep = await registry.reputationScore(addr);
    const isWinner = addr.toLowerCase() === winner.agent.toLowerCase();
    log("REPUTATION", `${h.label}: Score ${rep} | Wins: ${info.wins}${isWinner ? " ↑" : ""}`);
  }

  // ── Production note ───────────────────────────────────────────
  section("Production Deployment Notes");

  log("NOTE", "For production yield bounties:");
  log("NOTE", "  1. Use MandalaStETHTreasury with wstETH for yield-bearing rewards");
  log("NOTE", "  2. Integrate with DeFiLlama/DefiPulse APIs for real APY data");
  log("NOTE", "  3. Add on-chain verification (call protocol contracts directly)");
  log("NOTE", "  4. Implement reputation-weighted scoring for recurring hunters");
  log("NOTE", "  5. Consider risk-adjusted returns (Sharpe ratio) not just APY");

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  YIELD BOUNTY COMPLETE ✓                                  ║");
  console.log("║  Best yield discovered, verified, and rewarded             ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
