#!/usr/bin/env tsx
/**
 * Example 02: Create a Task
 * 
 * A coordinator agent deploys a new task via the MandalaFactory.
 * The task locks ETH reward in escrow and waits for worker agents
 * to submit proofs.
 * 
 * What happens:
 *   1. Ensure coordinator is registered
 *   2. Set task parameters (reward, stake, deadline, criteria)
 *   3. Call factory.deployTask(params, { value: reward })
 *   4. Parse the TaskDeployed event to get the task address
 *   5. Read back the task config to verify
 * 
 * Usage: npx tsx examples/02-create-task.ts
 */
import {
  getSigner, getProvider, getRegistry, getFactory, getTask,
  ensureRegistered, log, shortAddr,
  parseEther, formatEther, ZeroAddress, keccak256, toUtf8Bytes,
} from "../scripts/setup";

async function main() {
  const provider = getProvider();
  const signer = getSigner();
  const addr = await signer.getAddress();

  console.log("\n╭─────────────────────────────────────────────╮");
  console.log("│  Mandala — Create Task                      │");
  console.log("╰─────────────────────────────────────────────╯\n");

  log("COORD", `Coordinator: ${addr}`);
  log("COORD", `Balance: ${formatEther(await provider.getBalance(addr))} ETH`);

  // --- Step 1: Ensure registered ---
  const registry = getRegistry(signer);
  await ensureRegistered(registry, signer, "COORD");

  // --- Step 2: Define task parameters ---
  const reward = parseEther("0.01");           // 0.01 ETH reward
  const stakeRequired = parseEther("0.001");   // 0.001 ETH stake per worker
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const disputeWindow = 300;                   // 5 minute dispute window

  // Criteria: what the task asks agents to do
  const criteriaText = "Demonstrate autonomous agent coordination on Base Sepolia";
  const criteriaHash = keccak256(toUtf8Bytes(criteriaText));
  const criteriaURI = "ipfs://QmDemoCriteria";

  const params = {
    verifier: ZeroAddress,        // any registered agent can verify
    token: ZeroAddress,           // ETH (not ERC20)
    stakeRequired,
    deadline,
    disputeWindow,
    criteriaHash,
    criteriaURI,
    humanGateEnabled: false,      // no human approval needed to finalize
  };

  log("TASK", `Reward:         ${formatEther(reward)} ETH`);
  log("TASK", `Stake required: ${formatEther(stakeRequired)} ETH`);
  log("TASK", `Deadline:       ${new Date(deadline * 1000).toISOString()}`);
  log("TASK", `Dispute window: ${disputeWindow}s`);
  log("TASK", `Human gate:     ${params.humanGateEnabled}`);

  // --- Step 3: Deploy task ---
  log("DEPLOY", "Deploying task via factory...");
  const factory = getFactory(signer);
  const tx = await factory.deployTask(params, { value: reward });
  const receipt = await tx.wait();

  // --- Step 4: Parse TaskDeployed event ---
  let taskAddress = "";
  for (const l of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog({
        topics: l.topics as string[],
        data: l.data,
      });
      if (parsed && parsed.name === "TaskDeployed") {
        taskAddress = parsed.args.taskAddress;
        log("EVENT", `TaskDeployed: ${taskAddress}`);
        log("EVENT", `  coordinator: ${parsed.args.coordinator}`);
        log("EVENT", `  reward: ${formatEther(parsed.args.reward)} ETH`);
        log("EVENT", `  deadline: ${new Date(Number(parsed.args.deadline) * 1000).toISOString()}`);
      }
    } catch {}
  }

  if (!taskAddress) {
    const tasks = await factory.tasksByCoordinator(addr);
    taskAddress = tasks[tasks.length - 1];
  }

  log("DEPLOY", `Task deployed! ✓`);
  log("DEPLOY", `  address: ${taskAddress}`);
  log("DEPLOY", `  tx: ${tx.hash}`);
  log("DEPLOY", `  gas: ${receipt.gasUsed.toString()}`);

  // --- Step 5: Verify task config ---
  const task = getTask(taskAddress, signer);
  const config = await task.getConfig();

  log("VERIFY", "Task configuration:");
  log("VERIFY", `  status: Open`);
  log("VERIFY", `  coordinator: ${shortAddr(config.coordinator)}`);
  log("VERIFY", `  reward: ${formatEther(config.reward)} ETH`);
  log("VERIFY", `  stakeRequired: ${formatEther(config.stakeRequired)} ETH`);

  console.log("\n  Workers can now submit proofs to:", taskAddress);
  console.log("  Set TASK_ADDRESS=" + taskAddress + " in your .env\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
