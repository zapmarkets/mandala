#!/usr/bin/env tsx
/**
 * Verifier Agent
 * - Accepts task address as CLI arg
 * - Lists all submissions
 * - Selects the first agent with a valid proof hash as winner
 */
import {
  getSigner, getRegistry, getTask,
  ensureRegistered, log, shortAddr,
  formatEther, ENV,
} from "./setup";

async function main() {
  const taskAddress = process.argv[2];
  if (!taskAddress) {
    console.error("Usage: tsx scripts/verifier.ts <TASK_ADDRESS> [PRIVATE_KEY]");
    process.exit(1);
  }

  const keyOverride = process.argv[3];
  const signer = getSigner(keyOverride);
  const addr = await signer.getAddress();

  log("VERIFY", `Verifier address: ${addr}`);
  log("VERIFY", `Task: ${shortAddr(taskAddress)}`);

  // Register
  const registry = getRegistry(signer);
  await ensureRegistered(registry, signer, "VERIFY");

  // Read submissions
  const task = getTask(taskAddress, signer);
  const submissions = await task.getSubmissions();

  log("VERIFY", `Found ${submissions.length} submission(s):`);

  let winner: string | null = null;
  for (const sub of submissions) {
    const isValid = sub.proofHash !== "0x" + "0".repeat(64) && !sub.disqualified;
    log("VERIFY", `  ${shortAddr(sub.agent)} | hash: ${sub.proofHash.slice(0, 18)}... | stake: ${formatEther(sub.stake)} ETH | ${isValid ? "VALID" : "INVALID"}`);
    if (isValid && !winner) {
      winner = sub.agent;
    }
  }

  if (!winner) {
    log("VERIFY", "No valid submissions found.");
    process.exit(1);
  }

  // Select winner
  log("VERIFY", `Selecting winner: ${shortAddr(winner)}`);
  const tx = await task.selectWinner(winner);
  const receipt = await tx.wait();

  // Parse WinnerSelected event
  for (const l of receipt.logs) {
    try {
      const parsed = task.interface.parseLog({ topics: l.topics as string[], data: l.data });
      if (parsed && parsed.name === "WinnerSelected") {
        log("VERIFY", `WinnerSelected event: winner=${shortAddr(parsed.args.winner)}, proofHash=${parsed.args.proofHash.slice(0, 18)}...`);
      }
    } catch {}
  }

  log("VERIFY", `Winner selected! tx: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
