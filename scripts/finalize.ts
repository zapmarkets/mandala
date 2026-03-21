#!/usr/bin/env tsx
/**
 * Finalize
 * - Accepts task address as CLI arg
 * - Checks if dispute window has passed
 * - Calls finalize()
 * - Logs final state + winner payout
 */
import {
  getSigner, getTask,
  log, shortAddr, formatEther, TaskStatus,
} from "./setup";

async function main() {
  const taskAddress = process.argv[2];
  if (!taskAddress) {
    console.error("Usage: tsx scripts/finalize.ts <TASK_ADDRESS> [PRIVATE_KEY]");
    process.exit(1);
  }

  const keyOverride = process.argv[3];
  const signer = getSigner(keyOverride);
  const addr = await signer.getAddress();

  log("FINAL", `Finalizer: ${shortAddr(addr)}`);
  log("FINAL", `Task: ${shortAddr(taskAddress)}`);

  const task = getTask(taskAddress, signer);
  const config = await task.getConfig();

  log("FINAL", `Current status: ${TaskStatus[Number(config.status)]}`);

  if (Number(config.status) === 3) {
    log("FINAL", "Task already finalized.");
    return;
  }

  if (Number(config.status) !== 1) {
    log("FINAL", "Task is not in Verifying state. Cannot finalize.");
    process.exit(1);
  }

  // Check dispute window
  const provider = signer.provider!;
  const block = await provider.getBlock("latest");
  const now = block!.timestamp;
  const disputeEnd = Number(config.deadline) + Number(config.disputeWindow);

  // The dispute window is relative to when winner was selected, but we approximate
  // using current time. The contract enforces the actual check.
  log("FINAL", `Current time: ${now}`);
  log("FINAL", `Dispute window: ${config.disputeWindow}s`);

  log("FINAL", "Calling finalize()...");
  try {
    const tx = await task.finalize();
    const receipt = await tx.wait();

    // Parse TaskFinalized event
    for (const l of receipt.logs) {
      try {
        const parsed = task.interface.parseLog({ topics: l.topics as string[], data: l.data });
        if (parsed && parsed.name === "TaskFinalized") {
          log("FINAL", `TaskFinalized event:`);
          log("FINAL", `  Winner: ${parsed.args.winner}`);
          log("FINAL", `  Reward: ${formatEther(parsed.args.reward)} ETH`);
        }
        if (parsed && parsed.name === "StakeReturned") {
          log("FINAL", `StakeReturned: ${shortAddr(parsed.args.agent)} got ${formatEther(parsed.args.amount)} ETH`);
        }
      } catch {}
    }

    log("FINAL", `Finalized! tx: ${tx.hash}`);
  } catch (err: any) {
    if (err.message?.includes("DisputeWindowActive")) {
      log("FINAL", "Dispute window still active. Try again later.");
    } else {
      throw err;
    }
  }

  // Print final config
  const finalConfig = await task.getConfig();
  log("FINAL", `Final status: ${TaskStatus[Number(finalConfig.status)]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
