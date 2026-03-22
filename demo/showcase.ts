#!/usr/bin/env tsx
/**
 * MANDALA SHOWCASE — Autonomous Agent Task Competition
 * 
 * A self-contained demo showing 5 AI agents coordinating through
 * smart contracts on a local Anvil chain.
 * 
 * Agents:
 *   Atlas    — Coordinator: posts tasks, funds escrow
 *   Nova     — Researcher: finds information, writes reports
 *   Cipher   — Coder: writes code solutions
 *   Sentinel — Auditor: reviews and validates work
 *   Oracle   — Verifier: evaluates submissions, picks winners
 * 
 * Flow:
 *   1. All agents register with ERC-8004 on-chain identities
 *   2. Atlas posts a task with ETH reward locked in escrow
 *   3. Nova, Cipher, and Sentinel compete — each submits their work
 *   4. Deadline passes → Oracle reviews submissions and picks the best
 *   5. Dispute window passes → task finalizes
 *   6. Winner gets reward + stake back, losers get stakes back
 *   7. Atlas posts a second task — agents compete again
 *   8. Final reputation scores printed
 * 
 * Usage:
 *   1. Start Anvil:  anvil
 *   2. Deploy:       npx tsx scripts/deploy-local.ts > demo/deployed.json
 *   3. Run:          npx tsx demo/showcase.ts
 *   (or just:        ./demo/run.sh)
 */
import { ethers, Contract, Wallet, JsonRpcProvider } from "ethers";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Helpers ─────────────────────────────────────────────────────
function loadAbi(name: string) {
  return JSON.parse(readFileSync(resolve(__dirname, `../scripts/abis/${name}.json`), "utf-8"));
}

const ABIS = {
  registry: loadAbi("MandalaAgentRegistry"),
  factory: loadAbi("MandalaFactory"),
  task: loadAbi("MandalaTask"),
  policy: loadAbi("MandalaPolicy"),
};

const FMT = ethers.formatEther;
const PARSE = ethers.parseEther;
const ZERO = ethers.ZeroAddress;
const KECCAK = ethers.keccak256;
const UTF8 = ethers.toUtf8Bytes;

const STATUS = ["Open", "Verifying", "Disputed", "Finalized", "Cancelled"];

// ── Pretty Terminal Output ──────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
};

const AGENT_COLORS: Record<string, string> = {
  "Atlas":    C.cyan,
  "Nova":     C.magenta,
  "Cipher":   C.green,
  "Sentinel": C.yellow,
  "Oracle":   C.blue,
};

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

function agentLog(agent: string, action: string, msg: string) {
  const color = AGENT_COLORS[agent] || C.white;
  const pad = agent.padEnd(8);
  console.log(`  ${C.dim}${timestamp()}${C.reset}  ${color}${C.bold}${pad}${C.reset}  ${C.dim}${action.padEnd(12)}${C.reset}  ${msg}`);
}

function banner(text: string) {
  const w = 62;
  const pad = Math.max(0, w - text.length - 4);
  console.log(`\n${C.bgBlue}${C.white}${C.bold}  ╔${"═".repeat(w)}╗  ${C.reset}`);
  console.log(`${C.bgBlue}${C.white}${C.bold}  ║  ${text}${" ".repeat(pad)}║  ${C.reset}`);
  console.log(`${C.bgBlue}${C.white}${C.bold}  ╚${"═".repeat(w)}╝  ${C.reset}`);
}

function section(num: number, title: string) {
  console.log(`\n  ${C.bold}${C.white}── Step ${num}: ${title} ${"─".repeat(Math.max(0, 48 - title.length))}${C.reset}\n`);
}

function resultBox(lines: string[]) {
  const w = 60;
  console.log(`\n  ${C.green}┌${"─".repeat(w)}┐${C.reset}`);
  for (const line of lines) {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
    const pad = Math.max(0, w - clean.length - 2);
    console.log(`  ${C.green}│${C.reset} ${line}${" ".repeat(pad)} ${C.green}│${C.reset}`);
  }
  console.log(`  ${C.green}└${"─".repeat(w)}┘${C.reset}`);
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
async function mineBlocks(provider: JsonRpcProvider, seconds: number) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

// ── Task Descriptions (realistic agent tasks) ──────────────────
const TASKS = [
  {
    title: "Analyze DeFi Protocol Security Patterns",
    criteria: "Research and document the top 5 DeFi security patterns used in 2024-2025. Include real exploit examples and recommended mitigations. Output: structured report with code references.",
    reward: "0.05",
    stake: "0.005",
    deadline: 180,     // 3 min (we'll fast-forward)
    disputeWindow: 60, // 1 min
  },
  {
    title: "Build an On-Chain Reputation Aggregator",
    criteria: "Design and implement a Solidity contract that aggregates reputation scores from multiple protocols (Mandala, Gitcoin, DegenScore). Must include: interface definition, basic implementation, and 3 unit tests.",
    reward: "0.08",
    stake: "0.008",
    deadline: 180,
    disputeWindow: 60,
  },
];

// ── Agent Work Simulation ──────────────────────────────────────
// Each agent has a specialty and produces different quality work
interface AgentWork {
  proofContent: string;
  evidenceURI: string;
  quality: number; // 0-100
  timeMs: number;  // simulated work time
}

function simulateWork(agentName: string, taskTitle: string, taskNum: number): AgentWork {
  const works: Record<string, () => AgentWork> = {
    "Nova": () => ({
      proofContent: `[Nova Research Report] Task: "${taskTitle}"\n` +
        `Methodology: Systematic literature review + on-chain data analysis.\n` +
        `Sources: 23 academic papers, 15 audit reports, 847 on-chain transactions.\n` +
        `Key findings: Identified 5 critical patterns with empirical evidence.\n` +
        `Confidence: High (cross-validated with 3 independent data sources).`,
      evidenceURI: `ipfs://QmNova${taskNum}_full_research_report_v2`,
      quality: taskNum === 0 ? 92 : 78, // Nova excels at research, weaker at building
      timeMs: 3000,
    }),
    "Cipher": () => ({
      proofContent: `[Cipher Implementation] Task: "${taskTitle}"\n` +
        `Approach: TDD — wrote tests first, then implementation.\n` +
        `Deliverables: 3 Solidity contracts, 12 unit tests, gas optimization.\n` +
        `Code: 487 lines of Solidity, 0 compiler warnings.\n` +
        `Verification: All tests passing, Slither analysis clean.`,
      evidenceURI: `ipfs://QmCipher${taskNum}_code_submission`,
      quality: taskNum === 0 ? 75 : 95, // Cipher excels at building, weaker at research
      timeMs: 4000,
    }),
    "Sentinel": () => ({
      proofContent: `[Sentinel Audit] Task: "${taskTitle}"\n` +
        `Scope: Full security review + formal verification.\n` +
        `Method: Manual review, symbolic execution, fuzzing (1M iterations).\n` +
        `Findings: 3 high, 5 medium, 8 low severity issues.\n` +
        `Mitigations: All findings include fix recommendations with code diffs.`,
      evidenceURI: `ipfs://QmSentinel${taskNum}_audit_report`,
      quality: taskNum === 0 ? 85 : 82, // Sentinel is consistently good
      timeMs: 3500,
    }),
  };
  return (works[agentName] || works["Nova"])();
}

// ══════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════
async function main() {
  // Load config
  let config: any;
  try {
    config = JSON.parse(readFileSync(resolve(__dirname, "deployed.json"), "utf-8"));
  } catch {
    console.error("ERROR: demo/deployed.json not found.");
    console.error("Run: npx tsx scripts/deploy-local.ts > demo/deployed.json");
    process.exit(1);
  }

  const provider = new JsonRpcProvider(config.rpc);
  const { contracts, agents: agentConfigs } = config;

  // Create agent wallets
  const coordinator = new Wallet(agentConfigs.coordinator.key, provider);
  const nova        = new Wallet(agentConfigs.workerA.key, provider);
  const cipher      = new Wallet(agentConfigs.workerB.key, provider);
  const sentinel    = new Wallet(agentConfigs.workerC.key, provider);
  const oracle      = new Wallet(agentConfigs.verifier.key, provider);

  const workers = [
    { name: "Nova",     wallet: nova,     role: "Researcher" },
    { name: "Cipher",   wallet: cipher,   role: "Coder" },
    { name: "Sentinel", wallet: sentinel, role: "Auditor" },
  ];

  const allAgents = [
    { name: "Atlas",    wallet: coordinator, role: "Coordinator" },
    ...workers,
    { name: "Oracle",   wallet: oracle,      role: "Verifier" },
  ];

  // Contract instances
  const getRegistry = (signer: Wallet) => new Contract(contracts.registry, ABIS.registry, signer);
  const getFactory  = (signer: Wallet) => new Contract(contracts.factory, ABIS.factory, signer);
  const getTask     = (addr: string, signer: Wallet) => new Contract(addr, ABIS.task, signer);

  // ════════════════════════════════════════════════════════════════
  banner("MANDALA — Autonomous Agent Task Competition");
  // ════════════════════════════════════════════════════════════════

  console.log(`\n  ${C.dim}Chain: Anvil (local) | Protocol fee: 1% | Min stake: 0.001 ETH${C.reset}`);
  console.log(`  ${C.dim}Contracts: Policy=${shortAddr(contracts.policy)} Registry=${shortAddr(contracts.registry)}${C.reset}`);
  console.log(`  ${C.dim}           Factory=${shortAddr(contracts.factory)}${C.reset}\n`);

  console.log(`  ${C.bold}Agents:${C.reset}`);
  for (const a of allAgents) {
    const addr = await a.wallet.getAddress();
    const bal = FMT(await provider.getBalance(addr));
    const color = AGENT_COLORS[a.name] || C.white;
    console.log(`    ${color}●${C.reset} ${color}${C.bold}${a.name.padEnd(10)}${C.reset} ${C.dim}(${a.role})${C.reset}  ${shortAddr(addr)}  ${C.dim}${parseFloat(bal).toFixed(1)} ETH${C.reset}`);
  }

  // ── Step 1: Register All Agents ───────────────────────────────
  section(1, "Register Agents");

  for (const a of allAgents) {
    const registry = getRegistry(a.wallet);
    const addr = await a.wallet.getAddress();
    const registered = await registry.isRegistered(addr);

    if (registered) {
      agentLog(a.name, "REGISTERED", `Already registered ✓`);
    } else {
      const erc8004Id = KECCAK(UTF8(`mandala-${a.name.toLowerCase()}-${addr}`));
      const tx = await registry.register(erc8004Id, `https://mandala.agents/${a.name.toLowerCase()}`);
      await tx.wait();
      agentLog(a.name, "REGISTER", `On-chain identity created (ERC-8004: ${erc8004Id.slice(0, 14)}…)`);
    }
    await sleep(200);
  }

  // Track winners for final scoreboard
  const taskWinners: string[] = [];

  // ── Run Tasks ─────────────────────────────────────────────────
  for (let t = 0; t < TASKS.length; t++) {
    const task = TASKS[t];

    console.log(`\n${C.bgGreen}${C.white}${C.bold}  ┃ TASK ${t + 1}: ${task.title} ┃  ${C.reset}`);

    // ── Step 2: Coordinator Posts Task ────────────────────────────
    section(2 + t * 5, `Atlas Posts Task ${t + 1}`);

    const factory = getFactory(coordinator);
    const reward = PARSE(task.reward);
    const stakeReq = PARSE(task.stake);
    const block = await provider.getBlock("latest");
    const deadline = block!.timestamp + task.deadline;

    const criteriaHash = KECCAK(UTF8(task.criteria));

    agentLog("Atlas", "DEPLOY", `"${task.title}"`);
    agentLog("Atlas", "ESCROW", `Locking ${task.reward} ETH reward + ${task.stake} ETH stake required`);

    const deployTx = await factory.deployTask({
      verifier: ZERO,
      token: ZERO,
      stakeRequired: stakeReq,
      deadline,
      disputeWindow: task.disputeWindow,
      criteriaHash,
      criteriaURI: `ipfs://QmTaskCriteria_${t}`,
      humanGateEnabled: false,
      reward: 0,  // ETH task: reward comes from msg.value
    }, { value: reward });

    const deployReceipt = await deployTx.wait();
    let taskAddress = "";
    for (const l of deployReceipt.logs) {
      try {
        const parsed = factory.interface.parseLog({ topics: l.topics as string[], data: l.data });
        if (parsed?.name === "TaskDeployed") taskAddress = parsed.args.taskAddress;
      } catch {}
    }

    agentLog("Atlas", "DEPLOYED", `Task contract: ${shortAddr(taskAddress)}`);
    agentLog("Atlas", "CRITERIA", `"${task.criteria.slice(0, 70)}…"`);

    // ── Step 3: Workers Compete ──────────────────────────────────
    section(3 + t * 5, "Workers Compete");

    const submissionQualities: { name: string; quality: number; addr: string }[] = [];

    for (const w of workers) {
      const work = simulateWork(w.name, task.title, t);
      const addr = await w.wallet.getAddress();
      const taskContract = getTask(taskAddress, w.wallet);

      agentLog(w.name, "WORKING", `Analyzing task criteria…`);
      await sleep(800);

      agentLog(w.name, "WORKING", `${w.role} methodology in progress…`);
      await sleep(work.timeMs / 3);

      const proofHash = KECCAK(UTF8(work.proofContent));
      agentLog(w.name, "SUBMIT", `Staking ${task.stake} ETH + submitting proof`);

      const submitTx = await taskContract.submitProof(proofHash, work.evidenceURI, { value: stakeReq });
      await submitTx.wait();

      agentLog(w.name, "SUBMITTED", `Quality: ${work.quality}/100 | Evidence: ${work.evidenceURI}`);
      submissionQualities.push({ name: w.name, quality: work.quality, addr });
      await sleep(500);
    }

    // Show submission summary
    const taskContract = getTask(taskAddress, coordinator);
    const subCount = await taskContract.submissionCount();
    console.log(`\n  ${C.dim}  📋 ${subCount} submissions received. Waiting for deadline…${C.reset}`);

    // ── Step 4: Fast-Forward to Deadline ──────────────────────────
    section(4 + t * 5, "Deadline Passes");

    agentLog("Atlas", "TIME", `Fast-forwarding ${task.deadline}s to deadline…`);
    await mineBlocks(provider, task.deadline + 1);
    agentLog("Atlas", "DEADLINE", `Deadline passed ✓ — submissions locked`);

    // ── Step 5: Oracle Verifies ──────────────────────────────────
    section(5 + t * 5, "Oracle Evaluates Submissions");

    const oracleTask = getTask(taskAddress, oracle);
    const submissions = await oracleTask.getSubmissions();

    agentLog("Oracle", "REVIEW", `Evaluating ${submissions.length} submissions…`);
    await sleep(1500);

    // Oracle picks the highest quality submission
    submissionQualities.sort((a, b) => b.quality - a.quality);
    const best = submissionQualities[0];

    for (const sq of submissionQualities) {
      const marker = sq.name === best.name ? `${C.green}★ WINNER${C.reset}` : `${C.dim}  —${C.reset}`;
      agentLog("Oracle", "SCORE", `${sq.name}: ${sq.quality}/100 ${marker}`);
    }

    agentLog("Oracle", "SELECT", `Winner: ${best.name} (${shortAddr(best.addr)}) with score ${best.quality}/100`);
    const selectTx = await oracleTask.selectWinner(best.addr);
    await selectTx.wait();
    agentLog("Oracle", "SELECTED", `Winner confirmed on-chain ✓`);

    taskWinners.push(best.name);

    // ── Step 6: Dispute Window + Finalize ────────────────────────
    section(6 + t * 5, "Dispute Window & Finalization");

    agentLog("Atlas", "DISPUTE", `Dispute window: ${task.disputeWindow}s — any agent can challenge`);
    await sleep(800);
    agentLog("Atlas", "TIME", `Fast-forwarding dispute window…`);
    await mineBlocks(provider, task.disputeWindow + 1);
    agentLog("Atlas", "WINDOW", `Dispute window passed (no disputes) ✓`);

    // Finalize
    const finTx = await taskContract.finalize();
    const finReceipt = await finTx.wait();

    // Parse events
    for (const l of finReceipt.logs) {
      try {
        const parsed = taskContract.interface.parseLog({ topics: l.topics as string[], data: l.data });
        if (parsed?.name === "TaskFinalized") {
          agentLog("Atlas", "FINALIZED", `${C.green}${C.bold}${best.name} wins ${FMT(parsed.args.reward)} ETH!${C.reset}`);
        }
        if (parsed?.name === "StakeReturned") {
          const loserName = allAgents.find(a => a.wallet.address.toLowerCase() === parsed.args.agent.toLowerCase())?.name || "?";
          agentLog(loserName, "REFUND", `Stake returned: ${FMT(parsed.args.amount)} ETH`);
        }
      } catch {}
    }

    await sleep(500);
  }

  // ══════════════════════════════════════════════════════════════
  banner("FINAL SCOREBOARD");
  // ══════════════════════════════════════════════════════════════

  const registry = getRegistry(coordinator);

  const scores: { name: string; role: string; addr: string; wins: number; tasks: number; disputes: number; rep: number; balance: string }[] = [];

  for (const a of allAgents) {
    const addr = await a.wallet.getAddress();
    const info = await registry.getAgent(addr);
    const rep = await registry.reputationScore(addr);
    const bal = FMT(await provider.getBalance(addr));

    scores.push({
      name: a.name,
      role: a.role,
      addr,
      wins: Number(info.wins),
      tasks: Number(info.totalTasks),
      disputes: Number(info.disputes),
      rep: Number(rep),
      balance: parseFloat(bal).toFixed(4),
    });
  }

  // Print table
  console.log(`\n  ${C.bold}  Agent      Role           Wins  Tasks  Rep    ETH Balance${C.reset}`);
  console.log(`  ${"─".repeat(62)}`);

  for (const s of scores) {
    const color = AGENT_COLORS[s.name] || C.white;
    const winBadge = s.wins > 0 ? `${C.green}${s.wins}${C.reset}` : `${C.dim}0${C.reset}`;
    const repStr = s.tasks > 0 ? `${s.rep}%` : "—";
    console.log(
      `  ${color}●${C.reset} ${color}${C.bold}${s.name.padEnd(10)}${C.reset}` +
      ` ${C.dim}${s.role.padEnd(14)}${C.reset}` +
      `  ${winBadge.padEnd(s.wins > 0 ? 14 : 12)}` +
      `${String(s.tasks).padEnd(7)}` +
      `${repStr.padEnd(7)}` +
      `${s.balance} ETH`
    );
  }

  // Task results
  console.log(`\n  ${C.bold}  Task Results:${C.reset}`);
  for (let i = 0; i < TASKS.length; i++) {
    const winnerColor = AGENT_COLORS[taskWinners[i]] || C.white;
    console.log(`    Task ${i + 1}: "${TASKS[i].title}"`);
    console.log(`      Winner: ${winnerColor}${C.bold}${taskWinners[i]}${C.reset} — earned ${TASKS[i].reward} ETH`);
  }

  // Protocol stats
  const factoryContract = getFactory(coordinator);
  const totalTasks = await factoryContract.taskCount();

  resultBox([
    `${C.bold}Protocol Summary${C.reset}`,
    ``,
    `Total tasks deployed: ${totalTasks}`,
    `Agents registered:    ${allAgents.length}`,
    `Protocol fee:         1% (sent to treasury)`,
    `Disputes:             0 (all tasks resolved cleanly)`,
    ``,
    `${C.green}${C.bold}All rewards distributed. All stakes returned.${C.reset}`,
    `${C.dim}No humans were needed — agents coordinated autonomously.${C.reset}`,
  ]);

  console.log(`\n  ${C.dim}Mandala: trustless coordination for autonomous agents.${C.reset}\n`);
}

main().catch((err) => {
  console.error("\nError:", err);
  process.exit(1);
});
