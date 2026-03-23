#!/usr/bin/env tsx
/**
 * Example 10: ML Model Evaluation & Benchmarking
 * 
 * Use Case: Agents compete to train and submit the best machine learning
 * models for specific tasks. Models are evaluated on-chain (via oracle)
 * or off-chain with proof of evaluation results.
 * 
 * This example demonstrates:
 *   - Model submission with hashed weights/proofs
 *   - Benchmark-based evaluation (accuracy, F1, latency)
 *   - Training compute verification
 *   - Model improvement over time
 *   - Reputation for ML researchers
 * 
 * Real-world applications:
 *   - Decentralized AI training competitions
 *   - Model fine-tuning for specific domains
 *   - Benchmark optimization challenges
 *   - Federated learning coordination
 *   - AI safety evaluations
 * 
 * Usage: npx tsx examples/10-ml-model-evaluation.ts
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

enum ModelType {
  Classification = "Classification",
  Regression = "Regression",
  NLP = "NLP",
  Vision = "Vision",
  Multimodal = "Multimodal",
}

interface ModelSubmission {
  name: string;
  architecture: string;
  parameters: number;  // In millions
  trainingData: string;
  epochs: number;
  computeHours: number;
  checkpointHash: string;  // Hash of model weights
}

interface EvaluationMetrics {
  accuracy: number;      // 0-100
  f1Score: number;       // 0-100
  latency: number;       // ms per inference
  memoryUsage: number;   // MB
  robustness: number;    // 0-100 (adversarial resistance)
}

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Mandala — ML Model Evaluation Arena                      ║");
  console.log("║  Train models. Prove performance. Win rewards.            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  log("NET", `${network.name} (chain ${network.chainId})`);

  // ── Setup ML competition ──────────────────────────────────────
  section("AI Research Teams");

  const competitionOrganizer = getSigner(ENV.coordinatorKey);
  const researcherA = ENV.workerAKey
    ? new Wallet(ENV.workerAKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const researcherB = ENV.workerBKey
    ? new Wallet(ENV.workerBKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const researcherC = ENV.workerCKey
    ? new Wallet(ENV.workerCKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const evaluator = ENV.verifierKey
    ? new Wallet(ENV.verifierKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const researchers = [
    { label: "Team-Alpha", signer: researcherA, specialty: "Computer Vision", papers: 12 },
    { label: "Team-Beta", signer: researcherB, specialty: "NLP", papers: 8 },
    { label: "Team-Gamma", signer: researcherC, specialty: "Multimodal", papers: 5 },
  ];

  log("COMPETITION", "ML Model Benchmark Challenge");

  for (const r of researchers) {
    const addr = await r.signer.getAddress();
    const bal = formatEther(await provider.getBalance(addr));
    log("TEAM", `${r.label}: ${shortAddr(addr)} | ${r.specialty} | ${r.papers} papers (${bal} ETH)`);
  }

  const evaluatorAddr = await evaluator.getAddress();
  log("EVALUATOR", `Benchmark committee: ${shortAddr(evaluatorAddr)}`);

  // ── Register participants ─────────────────────────────────────
  section("Step 1: Register Research Teams");

  for (const r of researchers) {
    const registry = getRegistry(r.signer as Wallet);
    await ensureRegistered(registry, r.signer as Wallet, `ml-${r.label.toLowerCase()}`);
  }

  const evaluatorRegistry = getRegistry(evaluator);
  await ensureRegistered(evaluatorRegistry, evaluator, "ml-evaluator");

  // ── Competition details ───────────────────────────────────────
  section("Step 2: Competition Specifications");

  const competition = {
    name: "DeFi Transaction Fraud Detection",
    type: ModelType.Classification,
    dataset: "ethereum-fraud-2024",
    trainingSize: "100K transactions",
    testSize: "20K hidden transactions",
    evaluationMetrics: ["Accuracy", "F1-Score", "False Positive Rate", "Inference Latency"],
    constraints: {
      maxParams: 100,  // Million parameters
      maxLatency: 100, // ms per prediction
      maxMemory: 500,  // MB
    },
  };

  log("CHALLENGE", competition.name);
  log("DATASET", `${competition.dataset}: ${competition.trainingSize} train, ${competition.testSize} test`);
  log("METRICS", competition.evaluationMetrics.join(", "));
  log("CONSTRAINTS", `Max ${competition.constraints.maxParams}M params, ${competition.constraints.maxLatency}ms latency, ${competition.constraints.maxMemory}MB memory`);

  // ── Deploy competition task ───────────────────────────────────
  section("Step 3: Deploy Competition Contract");

  const factory = getFactory(competitionOrganizer);
  const reward = parseEther("0.5");  // Winner takes all
  const stake = parseEther("0.01");  // Anti-spam stake
  const deadline = Math.floor(Date.now() / 1000) + 180; // 3 minutes
  const disputeWindow = 120;  // For evaluation disputes

  const criteriaHash = keccak256(toUtf8Bytes(
    `ML Competition: ${competition.name}. Max accuracy on hidden test set. ` +
    `Constraints: ${JSON.stringify(competition.constraints)}`
  ));

  log("BOUNTY", `Reward pool: ${formatEther(reward)} ETH`);
  log("BOUNTY", `Stake: ${formatEther(stake)} ETH per submission`);
  log("BOUNTY", `Duration: 3 minutes (simulated)`);

  const tx = await factory.deployTask({
    verifier: ZeroAddress,
    token: ZeroAddress,
    stakeRequired: stake,
    deadline,
    disputeWindow,
    criteriaHash,
    criteriaURI: "ipfs://QmMLCompetitionSpec",
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

  log("TASK", `Competition contract: ${taskAddress}`);

  // ── Teams submit models ───────────────────────────────────────
  section("Step 4: Model Submissions");

  const submissions: { team: typeof researchers[0]; model: ModelSubmission; metrics: EvaluationMetrics }[] = [
    {
      team: researchers[0],
      model: {
        name: "FraudNet-XL",
        architecture: "Transformer + GNN Hybrid",
        parameters: 85,
        trainingData: "ethereum-fraud-2024 + synthetic augmentation",
        epochs: 50,
        computeHours: 240,
        checkpointHash: keccak256(toUtf8Bytes("fraudnet-xl-v3-weights")),
      },
      metrics: {
        accuracy: 94.5,
        f1Score: 93.2,
        latency: 85,
        memoryUsage: 420,
        robustness: 91,
      },
    },
    {
      team: researchers[1],
      model: {
        name: "Tx-BERT-Finetuned",
        architecture: "BERT-based Sequence Classifier",
        parameters: 65,
        trainingData: "ethereum-fraud-2024",
        epochs: 30,
        computeHours: 120,
        checkpointHash: keccak256(toUtf8Bytes("tx-bert-finetuned-v2-weights")),
      },
      metrics: {
        accuracy: 92.8,
        f1Score: 91.5,
        latency: 45,
        memoryUsage: 280,
        robustness: 88,
      },
    },
    {
      team: researchers[2],
      model: {
        name: "MultiModal-Fraud-Detector",
        architecture: "CNN + LSTM Ensemble",
        parameters: 95,
        trainingData: "ethereum-fraud-2024 + etherscan metadata",
        epochs: 75,
        computeHours: 360,
        checkpointHash: keccak256(toUtf8Bytes("mm-fraud-v1-weights")),
      },
      metrics: {
        accuracy: 95.2,
        f1Score: 94.1,
        latency: 95,
        memoryUsage: 480,
        robustness: 89,
      },
    },
  ];

  console.log("\n┌─────────────┬──────────────────────┬────────────┬─────────────┬──────────┐");
  console.log("│ Team        │ Model                │ Parameters │ Train Hours │ Checkpoint │");
  console.log("├─────────────┼──────────────────────┼────────────┼─────────────┼──────────┤");

  for (const sub of submissions) {
    const task = getTask(taskAddress, sub.team.signer as Wallet);
    
    // Submit model metadata hash (actual weights stored off-chain)
    const modelData = JSON.stringify({
      name: sub.model.name,
      architecture: sub.model.architecture,
      checkpointHash: sub.model.checkpointHash,
      metrics: sub.metrics,
    });
    const proofHash = keccak256(toUtf8Bytes(modelData));
    const evidenceURI = `ipfs://QmModel_${sub.team.label}_${sub.model.name}`;

    const submitTx = await task.submitProof(proofHash, evidenceURI, { value: stake });
    await submitTx.wait();

    const team = sub.team.label.padEnd(11);
    const model = sub.model.name.slice(0, 20).padEnd(20);
    const params = `${sub.model.parameters}M`.padEnd(10);
    const hours = `${sub.model.computeHours}h`.padEnd(11);
    const checkpoint = sub.model.checkpointHash.slice(0, 10).padEnd(10);
    console.log(`│ ${team} │ ${model} │ ${params} │ ${hours} │ ${checkpoint} │`);
  }
  console.log("└─────────────┴──────────────────────┴────────────┴─────────────┴──────────┘");

  // ── Evaluation results ────────────────────────────────────────
  section("Step 5: Benchmark Results");

  console.log("\n┌─────────────┬──────────┬─────────┬──────────┬──────────┬────────────┐");
  console.log("│ Model       │ Accuracy │ F1 Score│ Latency  │ Memory   │ Robustness │");
  console.log("├─────────────┼──────────┼─────────┼──────────┼──────────┼────────────┤");

  for (const sub of submissions) {
    const name = sub.model.name.slice(0, 11).padEnd(11);
    const acc = `${sub.metrics.accuracy}%`.padEnd(8);
    const f1 = `${sub.metrics.f1Score}%`.padEnd(7);
    const lat = `${sub.metrics.latency}ms`.padEnd(8);
    const mem = `${sub.metrics.memoryUsage}MB`.padEnd(8);
    const rob = `${sub.metrics.robustness}%`.padEnd(10);
    console.log(`│ ${name} │ ${acc} │ ${f1} │ ${lat} │ ${mem} │ ${rob} │`);
  }
  console.log("└─────────────┴──────────┴─────────┴──────────┴──────────┴────────────┘");

  // Check constraints
  log("VALIDATION", "Checking constraints...");
  for (const sub of submissions) {
    const violations = [];
    if (sub.model.parameters > competition.constraints.maxParams) violations.push("Params");
    if (sub.metrics.latency > competition.constraints.maxLatency) violations.push("Latency");
    if (sub.metrics.memoryUsage > competition.constraints.maxMemory) violations.push("Memory");
    
    if (violations.length === 0) {
      log("VALIDATION", `✓ ${sub.model.name}: All constraints satisfied`);
    } else {
      log("VALIDATION", `✗ ${sub.model.name}: Violations - ${violations.join(", ")}`);
    }
  }

  // ── Scoring ───────────────────────────────────────────────────
  section("Step 6: Final Scoring");

  // Composite score: Accuracy(40%) + F1(30%) + Robustness(20%) - LatencyPenalty(10%)
  const scoredSubmissions = submissions.map(sub => {
    const latencyPenalty = Math.max(0, (sub.metrics.latency - 50) / 5);
    const compositeScore = 
      (sub.metrics.accuracy * 0.4) +
      (sub.metrics.f1Score * 0.3) +
      (sub.metrics.robustness * 0.2) -
      latencyPenalty;
    
    return { ...sub, compositeScore };
  }).sort((a, b) => b.compositeScore - a.compositeScore);

  console.log("\n┌─────────────┬───────────────┬─────────────────────────────────────────┐");
  console.log("│ Rank │ Model                │ Composite │ Score Breakdown            │");
  console.log("├─────────────┼───────────────┼─────────────────────────────────────────┤");

  for (let i = 0; i < scoredSubmissions.length; i++) {
    const sub = scoredSubmissions[i];
    const rank = (i + 1).toString().padEnd(4);
    const model = sub.model.name.slice(0, 20).padEnd(20);
    const score = sub.compositeScore.toFixed(2).padEnd(9);
    const breakdown = `Acc:${sub.metrics.accuracy} F1:${sub.metrics.f1Score} Rob:${sub.metrics.robustness}`;
    console.log(`│ ${rank} │ ${model} │ ${score} │ ${breakdown.padEnd(26)} │`);
  }
  console.log("└─────────────┴───────────────┴─────────────────────────────────────────┘");

  const winner = scoredSubmissions[0];
  log("WINNER", `🏆 ${winner.team.label} with ${winner.model.name}`);
  log("WINNER", `   Composite Score: ${winner.compositeScore.toFixed(2)}`);
  log("WINNER", `   Prize: ${formatEther(reward)} ETH`);

  // ── Finalize competition ──────────────────────────────────────
  section("Step 7: Award Ceremony");

  const task = getTask(taskAddress, evaluator);
  
  // Wait for deadline
  while (true) {
    const remaining = await task.timeRemaining();
    if (Number(remaining) === 0) break;
    await sleep(10000);
  }

  const submissions_list = await task.getSubmissions();
  const winnerSubmission = submissions_list.find(s => 
    s.agent.toLowerCase() === (winner.team.signer as Wallet).address.toLowerCase()
  );

  if (winnerSubmission) {
    const selectTx = await task.selectWinner(winnerSubmission.agent);
    await selectTx.wait();
    log("RESULT", "Winner selected on-chain ✓");

    await sleep(500);

    const finalizeTx = await task.finalize();
    await finalizeTx.wait();
    log("RESULT", "Competition finalized, rewards distributed ✓");
  }

  // ── Final standings ───────────────────────────────────────────
  section("Final Leaderboard");

  console.log("\n┌──────┬─────────────┬──────────────────────┬───────────┬─────────────┐");
  console.log("│ Rank │ Team        │ Model                │ Score     │ Prize       │");
  console.log("├──────┼─────────────┼──────────────────────┼───────────┼─────────────┤");

  for (let i = 0; i < scoredSubmissions.length; i++) {
    const sub = scoredSubmissions[i];
    const rank = (i + 1).toString().padEnd(4);
    const team = sub.team.label.padEnd(11);
    const model = sub.model.name.slice(0, 20).padEnd(20);
    const score = sub.compositeScore.toFixed(2).padEnd(9);
    const prize = i === 0 ? `${formatEther(reward)} ETH 🥇` : "Stake Returned";
    console.log(`│ ${rank} │ ${team} │ ${model} │ ${score} │ ${prize.padEnd(11)} │`);
  }
  console.log("└──────┴─────────────┴──────────────────────┴───────────┴─────────────┘");

  // ── Reputation update ─────────────────────────────────────────
  section("Reputation & Credentials");

  const registry = getRegistry(competitionOrganizer);

  for (let i = 0; i < scoredSubmissions.length; i++) {
    const sub = scoredSubmissions[i];
    const addr = await sub.team.signer.getAddress();
    const info = await registry.getAgent(addr);
    const rep = await registry.reputationScore(addr);
    
    const repGain = i === 0 ? 100 : i === 1 ? 50 : 25;
    const badge = i === 0 ? "🏆 Competition Winner" : i === 1 ? "🥈 Runner-up" : "🥉 Participant";
    
    log("REPUTATION", `${sub.team.label}: ${rep} (+${repGain}) | ${badge}`);
  }

  // ── ML competition best practices ─────────────────────────────
  section("ML Competition Best Practices");

  log("ML", "Running decentralized ML competitions:");
  log("ML", "  1. Use verifiable compute (e.g., RISC Zero) for training proof");
  log("ML", "  2. Store model weights on IPFS/Arweave, hash on-chain");
  log("ML", "  3. Use trusted execution environments (TEEs) for evaluation");
  log("ML", "  4. Implement progressive evaluation: public → private → hidden");
  log("ML", "  5. Require reproducibility: seed, config, data version");
  log("ML", "  6. Anti-cheating: check for data leakage, overfitting");
  log("ML", "  7. Reward incremental improvements, not just winners");
  log("ML", "  8. Build model registry for tracking lineage");

  log("PRIVACY", "For sensitive data:");
  log("PRIVACY", "  - Use federated learning: train locally, share gradients");
  log("PRIVACY", "  - Implement differential privacy in evaluation");
  log("PRIVACY", "  - Zero-knowledge proofs for model properties");

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  ML COMPETITION COMPLETE ✓                                ║");
  console.log("║  Best model identified, verified, and rewarded            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
