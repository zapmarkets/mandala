#!/usr/bin/env tsx
/**
 * Worker Agent
 * - Accepts task address as CLI arg
 * - Registers in AgentRegistry
 * - Reads task config
 * - Submits proof with stake
 */
import {
  getSigner, getRegistry, getTask,
  ensureRegistered, log, shortAddr,
  formatEther, keccak256, toUtf8Bytes, ENV,
} from "./setup";

async function main() {
  const taskAddress = process.argv[2];
  if (!taskAddress) {
    console.error("Usage: tsx scripts/worker.ts <TASK_ADDRESS> [PRIVATE_KEY]");
    process.exit(1);
  }

  // Optional: use a specific private key (2nd arg or env)
  const keyOverride = process.argv[3];
  const signer = getSigner(keyOverride);
  const addr = await signer.getAddress();

  log("WORKER", `Worker address: ${addr}`);
  log("WORKER", `Task: ${shortAddr(taskAddress)}`);

  // Step 1: Register
  const registry = getRegistry(signer);
  await ensureRegistered(registry, signer, "WORKER");

  // Step 2: Read task config
  const task = getTask(taskAddress, signer);
  const config = await task.getConfig();

  log("WORKER", `Task config:`);
  log("WORKER", `  Coordinator: ${shortAddr(config.coordinator)}`);
  log("WORKER", `  Reward: ${formatEther(config.reward)} ETH`);
  log("WORKER", `  Stake required: ${formatEther(config.stakeRequired)} ETH`);
  log("WORKER", `  Deadline: ${new Date(Number(config.deadline) * 1000).toISOString()}`);
  log("WORKER", `  Criteria URI: ${config.criteriaURI}`);
  log("WORKER", `  Status: ${["Open", "Verifying", "Disputed", "Finalized", "Cancelled"][Number(config.status)]}`);

  if (Number(config.status) !== 0) {
    log("WORKER", "Task is not Open. Cannot submit.");
    process.exit(1);
  }

  // Step 3: Submit proof
  const proofContent = `Agent ${addr} completed task at ${new Date().toISOString()}. Result: autonomous coordination verified.`;
  const proofHash = keccak256(toUtf8Bytes(proofContent));
  const evidenceURI = `ipfs://QmProof_${addr.slice(2, 10)}`;

  log("WORKER", `Submitting proof...`);
  log("WORKER", `  Proof hash: ${proofHash}`);
  log("WORKER", `  Evidence: ${evidenceURI}`);
  log("WORKER", `  Staking: ${formatEther(config.stakeRequired)} ETH`);

  const tx = await task.submitProof(proofHash, evidenceURI, {
    value: config.stakeRequired,
  });
  const receipt = await tx.wait();

  log("WORKER", `Proof submitted! tx: ${tx.hash}`);
  log("WORKER", `  Block: ${receipt.blockNumber}`);
  log("WORKER", `  Gas used: ${receipt.gasUsed.toString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
