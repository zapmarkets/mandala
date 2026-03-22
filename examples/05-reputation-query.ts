#!/usr/bin/env tsx
/**
 * Example 05: Reputation Query (Read-Only)
 * 
 * A read-only script that queries the Mandala protocol state:
 *   - List all registered agents
 *   - Show reputation scores (wins / totalTasks)
 *   - List all deployed tasks
 *   - Show task details (status, reward, submissions)
 * 
 * No transactions — just reads. Safe to run anytime.
 * 
 * Usage: npx tsx examples/05-reputation-query.ts
 */
import {
  getProvider, getRegistry, getFactory, getTask, getPolicy,
  getSigner, log, shortAddr, TaskStatus,
  formatEther,
} from "../scripts/setup";

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  const signer = getSigner();

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  Mandala — Protocol State Query                       ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  log("NET", `${network.name} (chain ${network.chainId})`);

  // ── Policy State ──────────────────────────────────────────────
  console.log("\n── Protocol Policy ─────────────────────────────────────");

  const policy = getPolicy(signer);
  try {
    const paused = await policy.isPaused();
    const minStake = await policy.minStakeRequired();
    const threshold = await policy.humanGateThreshold();
    const treasury = await policy.treasury();

    log("POLICY", `Paused: ${paused}`);
    log("POLICY", `Min stake: ${formatEther(minStake)} ETH`);
    log("POLICY", `Human gate threshold: ${formatEther(threshold)} ETH`);
    log("POLICY", `Treasury: ${shortAddr(treasury)}`);
  } catch (err: any) {
    log("POLICY", `Could not read policy: ${err.message?.slice(0, 60)}`);
  }

  // ── Agent Registry ────────────────────────────────────────────
  console.log("\n── Registered Agents ───────────────────────────────────");

  const registry = getRegistry(signer);
  try {
    const agents = await registry.getAllAgents();

    if (agents.length === 0) {
      log("AGENTS", "No agents registered yet.");
    } else {
      log("AGENTS", `${agents.length} agent(s) registered:\n`);

      console.log("  ┌──────────────────┬───────┬──────┬──────────┬─────────┐");
      console.log("  │ Address          │ Tasks │ Wins │ Disputes │ Rep (%) │");
      console.log("  ├──────────────────┼───────┼──────┼──────────┼─────────┤");

      for (const agentAddr of agents) {
        const info = await registry.getAgent(agentAddr);
        const rep = await registry.reputationScore(agentAddr);
        const suspended = info.suspended ? " [SUSPENDED]" : "";

        console.log(
          `  │ ${shortAddr(agentAddr).padEnd(16)} │ ${String(info.totalTasks).padStart(5)} │ ${String(info.wins).padStart(4)} │ ${String(info.disputes).padStart(8)} │ ${String(rep).padStart(7)} │${suspended}`
        );
      }

      console.log("  └──────────────────┴───────┴──────┴──────────┴─────────┘");
    }
  } catch (err: any) {
    log("AGENTS", `Could not read registry: ${err.message?.slice(0, 60)}`);
  }

  // ── Tasks ─────────────────────────────────────────────────────
  console.log("\n── Deployed Tasks ──────────────────────────────────────");

  const factory = getFactory(signer);
  try {
    const tasks = await factory.allTasks();

    if (tasks.length === 0) {
      log("TASKS", "No tasks deployed yet.");
    } else {
      log("TASKS", `${tasks.length} task(s) deployed:\n`);

      for (let i = 0; i < tasks.length; i++) {
        const taskAddr = tasks[i];
        const task = getTask(taskAddr, signer);
        const config = await task.getConfig();
        const subCount = await task.submissionCount();
        const timeLeft = await task.timeRemaining();
        const status = TaskStatus[Number(config.status)];

        console.log(`  Task #${i + 1}: ${taskAddr}`);
        console.log(`    Status:      ${status}`);
        console.log(`    Coordinator: ${shortAddr(config.coordinator)}`);
        console.log(`    Reward:      ${formatEther(config.reward)} ETH`);
        console.log(`    Stake req:   ${formatEther(config.stakeRequired)} ETH`);
        console.log(`    Submissions: ${subCount}`);
        console.log(`    Time left:   ${Number(timeLeft) > 0 ? `${timeLeft}s` : "expired"}`);

        // Show submissions if any
        if (Number(subCount) > 0) {
          const subs = await task.getSubmissions();
          console.log(`    Submissions:`);
          for (const sub of subs) {
            const dq = sub.disqualified ? " [DISQUALIFIED]" : "";
            console.log(`      - ${shortAddr(sub.agent)} | stake: ${formatEther(sub.stake)} ETH${dq}`);
          }
        }

        // Show pending winner if in Verifying state
        if (Number(config.status) === 1 || Number(config.status) === 3) {
          const winner = await task.pendingWinner();
          if (winner !== "0x0000000000000000000000000000000000000000") {
            console.log(`    Winner:      ${shortAddr(winner)}`);
          }
        }

        console.log();
      }
    }
  } catch (err: any) {
    log("TASKS", `Could not read tasks: ${err.message?.slice(0, 60)}`);
  }

  console.log("╚════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
