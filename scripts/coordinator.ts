#!/usr/bin/env tsx
/**
 * Coordinator Agent
 * - Registers in AgentRegistry
 * - Deploys a task via Factory with ETH reward
 * - Watches for ProofSubmitted events
 */
import {
  getSigner, getRegistry, getFactory, getTask, ABIS,
  ensureRegistered, log, shortAddr,
  parseEther, formatEther, ZeroAddress, keccak256, toUtf8Bytes,
} from "./setup";

async function main() {
  const signer = getSigner();
  const addr = await signer.getAddress();
  const registry = getRegistry(signer);
  const factory = getFactory(signer);

  log("COORD", `Coordinator address: ${addr}`);

  // Step 1: Register
  await ensureRegistered(registry, signer, "COORD");

  // Step 2: Deploy task
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const disputeWindow = 300; // 5 minutes
  const reward = parseEther("0.01");
  const stakeRequired = parseEther("0.001");
  const criteriaText = "Demonstrate autonomous agent coordination on Base Sepolia";
  const criteriaHash = keccak256(toUtf8Bytes(criteriaText));
  const criteriaURI = "ipfs://QmDemoCriteria";

  const params = {
    verifier: ZeroAddress,            // any registered agent can verify
    token: ZeroAddress,               // ETH
    stakeRequired,
    deadline,
    disputeWindow,
    criteriaHash,
    criteriaURI,
    humanGateEnabled: false,
  };

  log("COORD", `Deploying task with ${formatEther(reward)} ETH reward...`);
  log("COORD", `  Stake required: ${formatEther(stakeRequired)} ETH`);
  log("COORD", `  Deadline: ${new Date(deadline * 1000).toISOString()}`);
  log("COORD", `  Dispute window: ${disputeWindow}s`);

  const tx = await factory.deployTask(params, { value: reward });
  const receipt = await tx.wait();

  // Parse TaskDeployed event
  const iface = factory.interface;
  let taskAddress = "";
  for (const l of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: l.topics as string[], data: l.data });
      if (parsed && parsed.name === "TaskDeployed") {
        taskAddress = parsed.args.taskAddress;
        break;
      }
    } catch {}
  }

  if (!taskAddress) {
    // Fallback: get from tasksByCoordinator
    const tasks = await factory.tasksByCoordinator(addr);
    taskAddress = tasks[tasks.length - 1];
  }

  log("COORD", `Task deployed at: ${taskAddress}`);
  log("COORD", `  tx: ${tx.hash}`);

  // Step 3: Watch for ProofSubmitted events
  const task = getTask(taskAddress, signer);
  log("COORD", "Watching for ProofSubmitted events (30s)...");

  const filter = task.filters.ProofSubmitted();
  task.on(filter, (agent: string, proofHash: string, evidenceURI: string) => {
    log("COORD", `Proof received from ${shortAddr(agent)}`);
    log("COORD", `  hash: ${proofHash}`);
    log("COORD", `  evidence: ${evidenceURI}`);
  });

  // Wait 30 seconds for submissions
  await new Promise((resolve) => setTimeout(resolve, 30000));
  await task.removeAllListeners();

  log("COORD", "Done watching. Task address for workers:");
  console.log(taskAddress);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
