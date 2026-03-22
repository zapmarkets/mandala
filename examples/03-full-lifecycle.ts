#!/usr/bin/env tsx
/**
 * Example 03: Full Task Lifecycle (Happy Path)
 * 
 * The complete Mandala coordination loop:
 *   1. Register 4 agents (coordinator, 2 workers, verifier)
 *   2. Coordinator deploys a task with ETH reward locked in escrow
 *   3. Two worker agents submit proofs with stake
 *   4. After deadline, verifier selects the winner
 *   5. Dispute window passes with no disputes
 *   6. Anyone calls finalize() — winner gets reward + stake, losers get stake back
 *   7. Print final balances and reputation scores
 * 
 * This is the "no humans required" flow — fully autonomous agent coordination.
 * 
 * Usage: npx tsx examples/03-full-lifecycle.ts
 * 
 * Requires: COORDINATOR_KEY, WORKER_A_KEY, WORKER_B_KEY, VERIFIER_KEY in .env
 * (or generates random wallets if missing — fund them first!)
 */
import {
  getProvider, getSigner, getRegistry, getFactory, getTask,
  ensureRegistered, log, shortAddr, ABIS, ENV, TaskStatus,
  parseEther, formatEther, ZeroAddress, keccak256, toUtf8Bytes,
} from "../scripts/setup";
import { Wallet } from "ethers";

const DIVIDER = "─".repeat(56);

function section(title: string) {
  console.log(`\n┌${DIVIDER}┐`);
  console.log(`│  ${title.padEnd(54)}│`);
  console.log(`└${DIVIDER}┘`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  Mandala — Full Lifecycle Demo                        ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  log("NET", `${network.name} (chain ${network.chainId})`);

  // ── Setup agents ──────────────────────────────────────────────
  section("Setting Up Agents");

  const coordinator = getSigner(ENV.coordinatorKey);
  const workerA = ENV.workerAKey
    ? new Wallet(ENV.workerAKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const workerB = ENV.workerBKey
    ? new Wallet(ENV.workerBKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const verifier = ENV.verifierKey
    ? new Wallet(ENV.verifierKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const agents = [
    { label: "Coordinator", signer: coordinator },
    { label: "Worker A   ", signer: workerA },
    { label: "Worker B   ", signer: workerB },
    { label: "Verifier   ", signer: verifier },
  ];

  for (const a of agents) {
    const addr = await a.signer.getAddress();
    const bal = formatEther(await provider.getBalance(addr));
    log("AGENT", `${a.label}: ${shortAddr(addr)} (${bal} ETH)`);
  }

  // ── Register all agents ───────────────────────────────────────
  section("Step 1: Register Agents");

  for (const a of agents) {
    const registry = getRegistry(a.signer as Wallet);
    await ensureRegistered(registry, a.signer as Wallet, a.label.trim());
  }

  // ── Deploy task ───────────────────────────────────────────────
  section("Step 2: Deploy Task");

  const factory = getFactory(coordinator);
  const reward = parseEther("0.01");
  const stakeRequired = parseEther("0.001");
  const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes (short for demo)
  const disputeWindow = 60; // 1 minute
  const criteriaHash = keccak256(toUtf8Bytes("Demo task: prove agent coordination"));

  log("TASK", `Reward: ${formatEther(reward)} ETH | Stake: ${formatEther(stakeRequired)} ETH`);
  log("TASK", `Deadline: ${new Date(deadline * 1000).toISOString()}`);
  log("TASK", `Dispute window: ${disputeWindow}s`);

  const tx = await factory.deployTask({
    verifier: ZeroAddress,
    token: ZeroAddress,
    stakeRequired,
    deadline,
    disputeWindow,
    criteriaHash,
    criteriaURI: "ipfs://QmDemoCriteria",
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
  if (!taskAddress) {
    const tasks = await factory.tasksByCoordinator(await coordinator.getAddress());
    taskAddress = tasks[tasks.length - 1];
  }

  log("TASK", `Deployed: ${taskAddress}`);
  log("TASK", `  tx: ${tx.hash}`);

  // ── Workers submit proofs ─────────────────────────────────────
  section("Step 3: Submit Proofs");

  for (const [label, worker] of [["WORKER-A", workerA], ["WORKER-B", workerB]] as const) {
    const task = getTask(taskAddress, worker as Wallet);
    const workerAddr = await (worker as Wallet).getAddress();
    const proofContent = `Agent ${workerAddr} completed task at ${Date.now()}`;
    const proofHash = keccak256(toUtf8Bytes(proofContent));
    const evidenceURI = `ipfs://QmProof_${workerAddr.slice(2, 10)}`;

    log(label, `Submitting proof with ${formatEther(stakeRequired)} ETH stake...`);
    const stx = await task.submitProof(proofHash, evidenceURI, { value: stakeRequired });
    await stx.wait();
    log(label, `Proof submitted ✓ (tx: ${stx.hash.slice(0, 18)}...)`);
    await sleep(2000);
  }

  const task = getTask(taskAddress, coordinator);
  log("INFO", `Submissions: ${await task.submissionCount()}`);

  // ── Wait for deadline ─────────────────────────────────────────
  section("Step 4: Wait for Deadline");

  while (true) {
    const remaining = await task.timeRemaining();
    if (Number(remaining) === 0) break;
    log("WAIT", `Deadline in ${remaining}s...`);
    await sleep(15000);
  }
  log("WAIT", "Deadline passed ✓");

  // ── Verifier selects winner ───────────────────────────────────
  section("Step 5: Select Winner");

  const taskForVerifier = getTask(taskAddress, verifier);
  const submissions = await taskForVerifier.getSubmissions();

  log("VERIFY", `Reviewing ${submissions.length} submission(s):`);
  for (const sub of submissions) {
    log("VERIFY", `  ${shortAddr(sub.agent)} | hash: ${sub.proofHash.slice(0, 18)}...`);
  }

  const winner = submissions.find((s: any) => !s.disqualified);
  if (!winner) throw new Error("No valid submissions!");

  log("VERIFY", `Selecting winner: ${shortAddr(winner.agent)}`);
  const selectTx = await taskForVerifier.selectWinner(winner.agent);
  await selectTx.wait();
  log("VERIFY", `Winner selected ✓`);

  // ── Wait for dispute window ───────────────────────────────────
  section("Step 6: Dispute Window");

  while (true) {
    const dRemaining = await task.disputeTimeRemaining();
    if (Number(dRemaining) === 0) break;
    log("WAIT", `Dispute window: ${dRemaining}s remaining...`);
    await sleep(15000);
  }
  log("WAIT", "Dispute window passed (no disputes) ✓");

  // ── Finalize ──────────────────────────────────────────────────
  section("Step 7: Finalize");

  const finalizeTx = await task.finalize();
  const finalizeReceipt = await finalizeTx.wait();

  for (const l of finalizeReceipt.logs) {
    try {
      const parsed = task.interface.parseLog({ topics: l.topics as string[], data: l.data });
      if (parsed?.name === "TaskFinalized") {
        log("FINAL", `Winner: ${shortAddr(parsed.args.winner)} → ${formatEther(parsed.args.reward)} ETH`);
      }
      if (parsed?.name === "StakeReturned") {
        log("FINAL", `Stake returned: ${shortAddr(parsed.args.agent)} → ${formatEther(parsed.args.amount)} ETH`);
      }
    } catch {}
  }
  log("FINAL", `Finalized ✓ (tx: ${finalizeTx.hash.slice(0, 18)}...)`);

  // ── Final state ───────────────────────────────────────────────
  section("Final State");

  const config = await task.getConfig();
  log("STATE", `Task status: ${TaskStatus[Number(config.status)]}`);

  for (const a of agents) {
    const addr = await a.signer.getAddress();
    const bal = formatEther(await provider.getBalance(addr));
    const registry = getRegistry(coordinator);
    const info = await registry.getAgent(addr);
    const rep = await registry.reputationScore(addr);
    log("STATE", `${a.label}: ${bal} ETH | rep: ${rep} | wins: ${info.wins} | tasks: ${info.totalTasks}`);
  }

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  LIFECYCLE COMPLETE ✓                                 ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
