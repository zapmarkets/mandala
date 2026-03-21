#!/usr/bin/env tsx
/**
 * Full Demo Orchestrator
 * Runs the complete Mandala agent coordination loop:
 *   1. Coordinator registers + deploys task
 *   2. Two workers register + submit proofs
 *   3. Verifier selects winner
 *   4. Wait for dispute window + finalize
 *   5. Print final balances and reputation
 *
 * Requires .env with:
 *   COORDINATOR_KEY, WORKER_A_KEY, WORKER_B_KEY, VERIFIER_KEY
 *   (or PRIVATE_KEY as fallback for coordinator)
 *   REGISTRY_ADDRESS, FACTORY_ADDRESS, POLICY_ADDRESS
 *   BASE_SEPOLIA_RPC
 */
import {
  getProvider, getSigner, getRegistry, getFactory, getTask,
  ensureRegistered, log, shortAddr, ABIS, ENV, TaskStatus,
  parseEther, formatEther, ZeroAddress, keccak256, toUtf8Bytes,
} from "./setup";
import { Wallet } from "ethers";

const DIVIDER = "=".repeat(60);

function section(title: string) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${title}`);
  console.log(DIVIDER);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  log("DEMO", `Network: ${network.name} (chainId: ${network.chainId})`);

  // -----------------------------------------------------------------------
  // Setup signers
  // -----------------------------------------------------------------------
  const coordinator = getSigner(ENV.coordinatorKey);
  const coordAddr = await coordinator.getAddress();

  if (!ENV.workerAKey || !ENV.workerBKey || !ENV.verifierKey) {
    log("DEMO", "Missing WORKER_A_KEY, WORKER_B_KEY, or VERIFIER_KEY in .env");
    log("DEMO", "Generating random wallets for demo...");
  }

  const workerA = ENV.workerAKey
    ? new Wallet(ENV.workerAKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const workerB = ENV.workerBKey
    ? new Wallet(ENV.workerBKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const verifier = ENV.verifierKey
    ? new Wallet(ENV.verifierKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const workerAAddr = await workerA.getAddress();
  const workerBAddr = await workerB.getAddress();
  const verifierAddr = await verifier.getAddress();

  log("DEMO", `Coordinator : ${coordAddr}`);
  log("DEMO", `Worker A    : ${workerAAddr}`);
  log("DEMO", `Worker B    : ${workerBAddr}`);
  log("DEMO", `Verifier    : ${verifierAddr}`);

  // Print balances
  for (const [label, addr] of [
    ["Coordinator", coordAddr],
    ["Worker A", workerAAddr],
    ["Worker B", workerBAddr],
    ["Verifier", verifierAddr],
  ]) {
    const bal = await provider.getBalance(addr);
    log("DEMO", `${label} balance: ${formatEther(bal)} ETH`);
  }

  // -----------------------------------------------------------------------
  // Step 1: Register all agents
  // -----------------------------------------------------------------------
  section("STEP 1: Register Agents");

  const registryCoord = getRegistry(coordinator);
  const registryWorkerA = getRegistry(workerA);
  const registryWorkerB = getRegistry(workerB);
  const registryVerifier = getRegistry(verifier);

  await ensureRegistered(registryCoord, coordinator, "COORD");
  await ensureRegistered(registryWorkerA, workerA, "WORKER-A");
  await ensureRegistered(registryWorkerB, workerB, "WORKER-B");
  await ensureRegistered(registryVerifier, verifier, "VERIFIER");

  // -----------------------------------------------------------------------
  // Step 2: Coordinator deploys task
  // -----------------------------------------------------------------------
  section("STEP 2: Deploy Task");

  const factory = getFactory(coordinator);
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const disputeWindow = 300; // 5 minutes
  const reward = parseEther("0.01");
  const stakeRequired = parseEther("0.001");
  const criteriaText = "Demonstrate autonomous agent coordination on Base Sepolia";
  const criteriaHash = keccak256(toUtf8Bytes(criteriaText));

  const deployParams = {
    verifier: ZeroAddress,
    token: ZeroAddress,
    stakeRequired,
    deadline,
    disputeWindow,
    criteriaHash,
    criteriaURI: "ipfs://QmDemoCriteria",
    humanGateEnabled: false,
  };

  log("COORD", `Deploying task: ${formatEther(reward)} ETH reward, ${formatEther(stakeRequired)} ETH stake`);
  const deployTx = await factory.deployTask(deployParams, { value: reward });
  const deployReceipt = await deployTx.wait();

  let taskAddress = "";
  for (const l of deployReceipt.logs) {
    try {
      const parsed = factory.interface.parseLog({ topics: l.topics as string[], data: l.data });
      if (parsed && parsed.name === "TaskDeployed") {
        taskAddress = parsed.args.taskAddress;
        break;
      }
    } catch {}
  }

  if (!taskAddress) {
    const tasks = await factory.tasksByCoordinator(coordAddr);
    taskAddress = tasks[tasks.length - 1];
  }

  log("COORD", `Task deployed: ${taskAddress}`);
  log("COORD", `  tx: ${deployTx.hash}`);

  // -----------------------------------------------------------------------
  // Step 3: Workers submit proofs
  // -----------------------------------------------------------------------
  section("STEP 3: Submit Proofs");

  for (const [label, worker, workerAddr] of [
    ["WORKER-A", workerA, workerAAddr],
    ["WORKER-B", workerB, workerBAddr],
  ] as const) {
    const task = getTask(taskAddress, worker as Wallet);
    const proofContent = `Agent ${workerAddr} completed task. Timestamp: ${Date.now()}`;
    const proofHash = keccak256(toUtf8Bytes(proofContent));
    const evidenceURI = `ipfs://QmProof_${(workerAddr as string).slice(2, 10)}`;

    log(label, `Submitting proof with ${formatEther(stakeRequired)} ETH stake...`);
    const tx = await task.submitProof(proofHash, evidenceURI, { value: stakeRequired });
    const receipt = await tx.wait();
    log(label, `Proof submitted! tx: ${tx.hash} (block ${receipt.blockNumber})`);

    // Small delay between submissions
    await sleep(2000);
  }

  // -----------------------------------------------------------------------
  // Step 4: Verifier selects winner
  // -----------------------------------------------------------------------
  section("STEP 4: Select Winner");

  const taskForVerifier = getTask(taskAddress, verifier);
  const submissions = await taskForVerifier.getSubmissions();

  log("VERIFY", `${submissions.length} submission(s) found:`);
  for (const sub of submissions) {
    log("VERIFY", `  ${shortAddr(sub.agent)} | hash: ${sub.proofHash.slice(0, 18)}... | valid: ${!sub.disqualified}`);
  }

  // Pick first valid submission
  const winner = submissions.find((s: any) => !s.disqualified);
  if (!winner) {
    log("VERIFY", "No valid submissions!");
    process.exit(1);
  }

  log("VERIFY", `Selecting winner: ${shortAddr(winner.agent)}`);
  const selectTx = await taskForVerifier.selectWinner(winner.agent);
  const selectReceipt = await selectTx.wait();

  for (const l of selectReceipt.logs) {
    try {
      const parsed = taskForVerifier.interface.parseLog({ topics: l.topics as string[], data: l.data });
      if (parsed && parsed.name === "WinnerSelected") {
        log("VERIFY", `WinnerSelected: ${shortAddr(parsed.args.winner)}`);
      }
    } catch {}
  }

  log("VERIFY", `tx: ${selectTx.hash}`);

  // -----------------------------------------------------------------------
  // Step 5: Wait for dispute window + finalize
  // -----------------------------------------------------------------------
  section("STEP 5: Finalize");

  const config = await taskForVerifier.getConfig();
  const dw = Number(config.disputeWindow);
  log("FINAL", `Dispute window: ${dw}s`);
  log("FINAL", `Waiting for dispute window to pass...`);

  // Poll until we can finalize
  const maxWait = dw + 60; // extra buffer
  const startTime = Date.now();

  while (true) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed > maxWait) {
      log("FINAL", "Timeout waiting for dispute window. Try finalizing manually.");
      break;
    }

    try {
      const taskForCoord = getTask(taskAddress, coordinator);
      const finalizeTx = await taskForCoord.finalize();
      const finalizeReceipt = await finalizeTx.wait();

      for (const l of finalizeReceipt.logs) {
        try {
          const parsed = taskForCoord.interface.parseLog({ topics: l.topics as string[], data: l.data });
          if (parsed && parsed.name === "TaskFinalized") {
            log("FINAL", `TaskFinalized: winner=${parsed.args.winner}, reward=${formatEther(parsed.args.reward)} ETH`);
          }
          if (parsed && parsed.name === "StakeReturned") {
            log("FINAL", `StakeReturned: ${shortAddr(parsed.args.agent)} => ${formatEther(parsed.args.amount)} ETH`);
          }
        } catch {}
      }

      log("FINAL", `Finalized! tx: ${finalizeTx.hash}`);
      break;
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("DisputeWindowActive") || msg.includes("dispute")) {
        // Still waiting
        const remaining = dw - elapsed;
        log("FINAL", `Dispute window active. ~${Math.max(0, remaining)}s remaining...`);
        await sleep(15000); // check every 15s
      } else {
        throw err;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 6: Print final state
  // -----------------------------------------------------------------------
  section("FINAL STATE");

  const finalTask = getTask(taskAddress, coordinator);
  const finalConfig = await finalTask.getConfig();
  log("STATE", `Task status: ${TaskStatus[Number(finalConfig.status)]}`);

  // Balances
  for (const [label, addr] of [
    ["Coordinator", coordAddr],
    ["Worker A", workerAAddr],
    ["Worker B", workerBAddr],
    ["Verifier", verifierAddr],
  ]) {
    const bal = await provider.getBalance(addr);
    log("STATE", `${label} balance: ${formatEther(bal)} ETH`);
  }

  // Reputation
  for (const [label, addr] of [
    ["Coordinator", coordAddr],
    ["Worker A", workerAAddr],
    ["Worker B", workerBAddr],
    ["Verifier", verifierAddr],
  ]) {
    try {
      const info = await registryCoord.getAgent(addr);
      log("STATE", `${label} rep: ${info.wins} wins, ${info.disputes} disputes, ${info.totalTasks} tasks`);
    } catch {}
  }

  console.log(`\n${DIVIDER}`);
  console.log("  DEMO COMPLETE");
  console.log(DIVIDER);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
