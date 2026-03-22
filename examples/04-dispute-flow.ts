#!/usr/bin/env tsx
/**
 * Example 04: Dispute Flow
 * 
 * Demonstrates the dispute resolution path in Mandala:
 *   1. Register agents, deploy task, workers submit
 *   2. Verifier selects worker A as winner
 *   3. Worker B disputes the selection
 *   4. Task moves to Disputed state → human intervention required
 *   5. Human resolves dispute (picks the real winner)
 *   6. New dispute window starts, then finalize
 * 
 * This shows how Mandala handles disagreements — the human gate
 * ensures fairness when agents can\'t agree.
 * 
 * Usage: npx tsx examples/04-dispute-flow.ts
 */
import {
  getProvider, getSigner, getRegistry, getFactory, getTask, getPolicy,
  ensureRegistered, log, shortAddr, TaskStatus,
  parseEther, formatEther, ZeroAddress, keccak256, toUtf8Bytes,
} from "../scripts/setup";
import { Wallet } from "ethers";

const DIVIDER = "─".repeat(56);
function section(title: string) {
  console.log(`\n┌${DIVIDER}┐`);
  console.log(`│  ${title.padEnd(54)}│`);
  console.log(`└${DIVIDER}┘`);
}
async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const provider = getProvider();

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  Mandala — Dispute Resolution Demo                    ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  // The coordinator is also the "human" (has HUMAN_ROLE from deployment)
  const coordinator = getSigner();
  const workerA = new Wallet(Wallet.createRandom().privateKey, provider);
  const workerB = new Wallet(Wallet.createRandom().privateKey, provider);

  // Fund workers from coordinator
  const coordAddr = await coordinator.getAddress();
  const workerAAddr = await workerA.getAddress();
  const workerBAddr = await workerB.getAddress();

  log("INFO", `Coordinator/Human: ${shortAddr(coordAddr)}`);
  log("INFO", `Worker A: ${shortAddr(workerAAddr)}`);
  log("INFO", `Worker B: ${shortAddr(workerBAddr)}`);

  // ── Setup: Fund + Register ────────────────────────────────────
  section("Setup: Fund & Register Workers");

  // Send ETH to workers for gas + stake
  for (const [label, addr] of [["Worker A", workerAAddr], ["Worker B", workerBAddr]]) {
    const fundTx = await coordinator.sendTransaction({
      to: addr,
      value: parseEther("0.005"),
    });
    await fundTx.wait();
    log("FUND", `Sent 0.005 ETH to ${label}`);
  }

  // Register all agents
  const signers: [string, Wallet][] = [
    ["COORD", coordinator],
    ["WORKER-A", workerA],
    ["WORKER-B", workerB],
  ];
  for (const [label, signer] of signers) {
    await ensureRegistered(getRegistry(signer), signer, label);
  }

  // ── Deploy Task ───────────────────────────────────────────────
  section("Step 1: Deploy Task");

  const factory = getFactory(coordinator);
  const deadline = Math.floor(Date.now() / 1000) + 120;
  const disputeWindow = 60;
  const reward = parseEther("0.005");
  const stakeRequired = parseEther("0.001");

  const tx = await factory.deployTask({
    verifier: ZeroAddress,
    token: ZeroAddress,
    stakeRequired,
    deadline,
    disputeWindow,
    criteriaHash: keccak256(toUtf8Bytes("Dispute demo task")),
    criteriaURI: "ipfs://QmDisputeDemo",
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

  log("TASK", `Task deployed: ${taskAddress}`);

  // ── Submit Proofs ─────────────────────────────────────────────
  section("Step 2: Workers Submit Proofs");

  for (const [label, worker] of [["WORKER-A", workerA], ["WORKER-B", workerB]] as const) {
    const task = getTask(taskAddress, worker as Wallet);
    const addr = await (worker as Wallet).getAddress();
    const proofHash = keccak256(toUtf8Bytes(`proof-${addr}-${Date.now()}`));
    const stx = await task.submitProof(proofHash, `ipfs://QmProof_${addr.slice(2, 10)}`, {
      value: stakeRequired,
    });
    await stx.wait();
    log(label, `Proof submitted ✓`);
    await sleep(2000);
  }

  // ── Wait for deadline ─────────────────────────────────────────
  section("Step 3: Wait for Deadline");
  const task = getTask(taskAddress, coordinator);
  while (Number(await task.timeRemaining()) > 0) {
    log("WAIT", `${await task.timeRemaining()}s remaining...`);
    await sleep(15000);
  }
  log("WAIT", "Deadline passed ✓");

  // ── Verifier selects Worker A ─────────────────────────────────
  section("Step 4: Verifier Selects Worker A");

  // Coordinator acts as verifier (verifier=ZeroAddress means any registered)
  const selectTx = await task.selectWinner(workerAAddr);
  await selectTx.wait();
  log("VERIFY", `Selected winner: ${shortAddr(workerAAddr)} (Worker A)`);

  const config1 = await task.getConfig();
  log("STATE", `Task status: ${TaskStatus[Number(config1.status)]}`); // Verifying

  // ── Worker B disputes ─────────────────────────────────────────
  section("Step 5: Worker B Files Dispute");

  const taskForB = getTask(taskAddress, workerB);
  const disputeTx = await taskForB.dispute(
    workerAAddr,
    "Worker A submitted a low-quality proof. Worker B\'s proof is more comprehensive."
  );
  await disputeTx.wait();
  log("DISPUTE", `Worker B disputed against Worker A ✓`);

  const config2 = await task.getConfig();
  log("STATE", `Task status: ${TaskStatus[Number(config2.status)]}`); // Disputed

  // Read dispute details
  const disputant = await task.disputant();
  const against = await task.disputedAgainst();
  const reason = await task.disputeReason();
  log("DISPUTE", `Disputant: ${shortAddr(disputant)}`);
  log("DISPUTE", `Against: ${shortAddr(against)}`);
  log("DISPUTE", `Reason: "${reason}"`);

  // ── Human resolves dispute ────────────────────────────────────
  section("Step 6: Human Resolves Dispute");

  log("HUMAN", "Reviewing submissions...");
  const submissions = await task.getSubmissions();
  for (const sub of submissions) {
    log("HUMAN", `  ${shortAddr(sub.agent)} | evidence: ${sub.evidenceURI}`);
  }

  // Human decides Worker B had the better proof
  log("HUMAN", `Decision: Worker B (${shortAddr(workerBAddr)}) wins`);
  const resolveTx = await task.resolveDispute(workerBAddr);
  await resolveTx.wait();
  log("HUMAN", "Dispute resolved ✓ — new dispute window started");

  const config3 = await task.getConfig();
  log("STATE", `Task status: ${TaskStatus[Number(config3.status)]}`); // Back to Verifying

  // ── Wait for new dispute window ───────────────────────────────
  section("Step 7: Wait for New Dispute Window");

  while (Number(await task.disputeTimeRemaining()) > 0) {
    log("WAIT", `${await task.disputeTimeRemaining()}s remaining...`);
    await sleep(15000);
  }
  log("WAIT", "Dispute window passed ✓");

  // ── Finalize ──────────────────────────────────────────────────
  section("Step 8: Finalize");

  const finTx = await task.finalize();
  await finTx.wait();
  log("FINAL", "Task finalized ✓");

  const config4 = await task.getConfig();
  log("STATE", `Task status: ${TaskStatus[Number(config4.status)]}`); // Finalized

  // ── Final state ───────────────────────────────────────────────
  section("Results");

  const registry = getRegistry(coordinator);
  for (const [label, addr] of [
    ["Coordinator", coordAddr],
    ["Worker A (lost dispute)", workerAAddr],
    ["Worker B (won dispute)", workerBAddr],
  ]) {
    const bal = formatEther(await provider.getBalance(addr));
    const info = await registry.getAgent(addr);
    log("RESULT", `${label}: ${bal} ETH | wins: ${info.wins} | disputes: ${info.disputes}`);
  }

  console.log("\n  Worker B received the reward after successful dispute!");
  console.log("  Worker A\'s dispute count was incremented.\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
