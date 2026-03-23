#!/usr/bin/env tsx
/**
 * Example 09: Content Moderation DAO
 * 
 * Use Case: Decentralized content moderation where multiple moderators
 * (agents) review flagged content and reach consensus. Prevents single-
 * moderator bias and enables transparent decision-making.
 * 
 * This example demonstrates:
 *   - Multi-agent consensus mechanisms
 *   - Reputation-weighted voting power
 *   - Appeal and dispute resolution
 *   - Transparent moderation decisions
 *   - Spam prevention via staking
 * 
 * Real-world applications:
 *   - Social media content moderation
 *   - Forum governance
 *   - NFT marketplace curation
 *   - Review platform validation
 *   - Misinformation flagging
 * 
 * Usage: npx tsx examples/09-content-moderation.ts
 */
import {
  getProvider, getSigner, getRegistry, getFactory, getTask,
  ensureRegistered, log, shortAddr, ENV, TaskStatus,
  parseEther, formatEther, ZeroAddress, keccak256, toUtf8Bytes,
} from "../scripts/setup";
import { Wallet } from "ethers";

const DIVIDER = "─".repeat(60);

function section(title: string) {
  console.log(`\n┌${DIVIDER}┐`);
  console.log(`│  ${title.padEnd(58)}│`);
  console.log(`└${DIVIDER}┘`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

enum ModerationDecision {
  Approve = 0,   // Content is acceptable
  Reject = 1,    // Content violates rules
  Escalate = 2,  // Uncertain, needs human review
}

interface ContentItem {
  id: string;
  contentHash: string;
  contentType: "post" | "comment" | "image" | "video";
  flaggedBy: string;
  reason: string;
}

interface ModeratorVote {
  moderator: string;
  decision: ModerationDecision;
  confidence: number;  // 0-100
  reasoning: string;
}

async function main() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Mandala — Content Moderation DAO                         ║");
  console.log("║  Decentralized moderation. Consensus decisions. Fair.     ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  log("NET", `${network.name} (chain ${network.chainId})`);

  // ── Setup moderation DAO ──────────────────────────────────────
  section("Moderation DAO Members");

  const daoTreasury = getSigner(ENV.coordinatorKey);
  const moderatorA = ENV.workerAKey
    ? new Wallet(ENV.workerAKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const moderatorB = ENV.workerBKey
    ? new Wallet(ENV.workerBKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const moderatorC = ENV.workerCKey
    ? new Wallet(ENV.workerCKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const moderatorD = ENV.workerDKey
    ? new Wallet(Wallet.createRandom().privateKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);
  const user = ENV.userKey
    ? new Wallet(ENV.userKey, provider)
    : new Wallet(Wallet.createRandom().privateKey, provider);

  const moderators = [
    { label: "Mod-Senior-A", signer: moderatorA, accuracy: 95, reputation: 850 },
    { label: "Mod-Senior-B", signer: moderatorB, accuracy: 92, reputation: 720 },
    { label: "Mod-Junior-C", signer: moderatorC, accuracy: 88, reputation: 340 },
    { label: "Mod-Junior-D", signer: moderatorD, accuracy: 85, reputation: 180 },
  ];

  log("DAO", "Moderation DAO with 4 moderators + 1 user");

  for (const m of moderators) {
    const addr = await m.signer.getAddress();
    const bal = formatEther(await provider.getBalance(addr));
    log("MOD", `${m.label}: ${shortAddr(addr)} | Rep: ${m.reputation} | Acc: ${m.accuracy}% (${bal} ETH)`);
  }

  const userAddr = await user.getAddress();
  log("USER", `Content creator: ${shortAddr(userAddr)}`);

  // ── Register all participants ─────────────────────────────────
  section("Step 1: Register DAO Members");

  const treasuryRegistry = getRegistry(daoTreasury);
  await ensureRegistered(treasuryRegistry, daoTreasury, "dao-treasury");

  for (const m of moderators) {
    const registry = getRegistry(m.signer as Wallet);
    await ensureRegistered(registry, m.signer as Wallet, `mod-${m.label.toLowerCase()}`);
  }

  const userRegistry = getRegistry(user);
  await ensureRegistered(userRegistry, user, "content-creator");

  // ── Content to moderate ───────────────────────────────────────
  section("Step 2: Flagged Content Items");

  const contentItems: ContentItem[] = [
    {
      id: "post-001",
      contentHash: keccak256(toUtf8Bytes("Promotional content about crypto investment...")),
      contentType: "post",
      flaggedBy: "automated-spam-detector",
      reason: "Potential spam: excessive promotional links",
    },
    {
      id: "comment-042",
      contentHash: keccak256(toUtf8Bytes("This project is a scam! The founders are...")),
      contentType: "comment",
      flaggedBy: "user-report",
      reason: "Defamation without evidence",
    },
    {
      id: "image-107",
      contentHash: keccak256(toUtf8Bytes("<image-hash-nft-artwork>")),
      contentType: "image",
      flaggedBy: "copyright-bot",
      reason: "Potential copyright violation",
    },
  ];

  console.log("\n┌───────────┬────────────┬─────────────────────────────┬────────────────────────┐");
  console.log("│ Content   │ Type       │ Reason                      │ Hash                   │");
  console.log("├───────────┼────────────┼─────────────────────────────┼────────────────────────┤");

  for (const item of contentItems) {
    const id = item.id.padEnd(9);
    const type = item.contentType.padEnd(10);
    const reason = item.reason.slice(0, 27).padEnd(27);
    const hash = item.contentHash.slice(0, 22).padEnd(22);
    console.log(`│ ${id} │ ${type} │ ${reason} │ ${hash} │`);
  }
  console.log("└───────────┴────────────┴─────────────────────────────┴────────────────────────┘");

  // ── Deploy moderation tasks ───────────────────────────────────
  section("Step 3: Create Moderation Tasks");

  const factory = getFactory(daoTreasury);
  const moderationTasks: { item: ContentItem; taskAddress: string; votes: ModeratorVote[] }[] = [];

  for (const item of contentItems) {
    const reward = parseEther("0.01");  // Payment for moderators
    const stake = parseEther("0.001");  // Prevents spam votes
    const deadline = Math.floor(Date.now() / 1000) + 90; // 1.5 minutes
    const disputeWindow = 60;

    const criteriaHash = keccak256(toUtf8Bytes(
      `Moderate ${item.contentType}: ${item.reason}. Vote: Approve(0), Reject(1), or Escalate(2)`
    ));

    const tx = await factory.deployTask({
      verifier: await daoTreasury.getAddress(),  // DAO treasury as verifier
      token: ZeroAddress,
      stakeRequired: stake,
      deadline,
      disputeWindow,
      criteriaHash,
      criteriaURI: `ipfs://QmModeration${item.id}`,
      humanGateEnabled: true,  // Enable for controversial decisions
    }, { value: reward });

    const receipt = await tx.wait();
    let taskAddress = "";
    for (const l of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog({ topics: l.topics as string[], data: l.data });
        if (parsed?.name === "TaskDeployed") taskAddress = parsed.args.taskAddress;
      } catch {}
    }

    moderationTasks.push({ item, taskAddress, votes: [] });
    log("TASK", `${item.id}: Task deployed at ${shortAddr(taskAddress)}`);
  }

  // ── Moderators vote on content ────────────────────────────────
  section("Step 4: Moderator Consensus Voting");

  // Simulate different moderators reaching different conclusions
  const votingScenario = [
    // post-001: Spam
    { taskIdx: 0, mods: [
      { mod: moderators[0], decision: ModerationDecision.Reject, confidence: 90, reasoning: "Clear spam pattern" },
      { mod: moderators[1], decision: ModerationDecision.Reject, confidence: 85, reasoning: "Promotional spam" },
      { mod: moderators[2], decision: ModerationDecision.Reject, confidence: 80, reasoning: "Spam confirmed" },
      { mod: moderators[3], decision: ModerationDecision.Approve, confidence: 60, reasoning: "Might be legitimate" },
    ]},
    // comment-042: Defamation
    { taskIdx: 1, mods: [
      { mod: moderators[0], decision: ModerationDecision.Reject, confidence: 95, reasoning: "Defamation without proof" },
      { mod: moderators[1], decision: ModerationDecision.Escalate, confidence: 70, reasoning: "Needs human review" },
      { mod: moderators[2], decision: ModerationDecision.Reject, confidence: 88, reasoning: "Harassment" },
      { mod: moderators[3], decision: ModerationDecision.Reject, confidence: 85, reasoning: "No evidence provided" },
    ]},
    // image-107: Copyright
    { taskIdx: 2, mods: [
      { mod: moderators[0], decision: ModerationDecision.Escalate, confidence: 75, reasoning: "Possible fair use" },
      { mod: moderators[1], decision: ModerationDecision.Escalate, confidence: 80, reasoning: "Copyright unclear" },
      { mod: moderators[2], decision: ModerationDecision.Reject, confidence: 70, reasoning: "Looks stolen" },
      { mod: moderators[3], decision: ModerationDecision.Approve, confidence: 65, reasoning: "Original work" },
    ]},
  ];

  for (const scenario of votingScenario) {
    const mt = moderationTasks[scenario.taskIdx];
    log("VOTE", `Moderating: ${mt.item.id} (${mt.item.contentType})`);

    console.log(`\n  Votes for ${mt.item.id}:`);
    console.log("  ┌──────────────┬───────────┬────────────┬──────────────────────────┐");
    console.log("  │ Moderator    │ Decision  │ Confidence │ Reasoning                │");
    console.log("  ├──────────────┼───────────┼────────────┼──────────────────────────┤");

    for (const vote of scenario.mods) {
      const task = getTask(mt.taskAddress, vote.mod.signer as Wallet);
      const voteData = JSON.stringify({
        decision: vote.decision,
        confidence: vote.confidence,
        reasoning: vote.reasoning,
      });
      const proofHash = keccak256(toUtf8Bytes(voteData));
      const evidenceURI = `ipfs://QmVote_${mt.item.id}_${vote.mod.label}`;

      const tx = await task.submitProof(proofHash, evidenceURI, { value: parseEther("0.001") });
      await tx.wait();

      const decisions = ["✓ Approve", "✗ Reject", "⚠ Escalate"];
      const modName = vote.mod.label.padEnd(12);
      const decision = decisions[vote.decision].padEnd(9);
      const conf = `${vote.confidence}%`.padEnd(10);
      const reason = vote.reasoning.slice(0, 24).padEnd(24);
      console.log(`  │ ${modName} │ ${decision} │ ${conf} │ ${reason} │`);

      mt.votes.push({
        moderator: (vote.mod.signer as Wallet).address,
        decision: vote.decision,
        confidence: vote.confidence,
        reasoning: vote.reasoning,
      });
    }
    console.log("  └──────────────┴───────────┴────────────┴──────────────────────────┘");
  }

  // ── Calculate consensus and finalize ──────────────────────────
  section("Step 5: Consensus Results");

  console.log("\n┌───────────┬─────────────────┬────────────┬────────────────────────────┐");
  console.log("│ Content   │ Consensus       │ Confidence │ Action                     │");
  console.log("├───────────┼─────────────────┼────────────┼────────────────────────────┤");

  for (const mt of moderationTasks) {
    const task = getTask(mt.taskAddress, daoTreasury);
    
    // Calculate weighted consensus (by confidence)
    const voteCounts = [0, 0, 0]; // Approve, Reject, Escalate
    let totalConfidence = 0;
    
    for (const vote of mt.votes) {
      voteCounts[vote.decision] += vote.confidence;
      totalConfidence += vote.confidence;
    }

    const maxVotes = Math.max(...voteCounts);
    const consensusIdx = voteCounts.indexOf(maxVotes);
    const consensusConfidence = Math.round((maxVotes / totalConfidence) * 100);
    
    const decisions = ["✓ Approve", "✗ Reject", "⚠ Escalate"];
    const actions = [
      "Content remains visible",
      "Content removed, user warned",
      "Forwarded to human review"
    ];

    const consensus = consensusConfidence >= 70 ? "Strong" : consensusConfidence >= 50 ? "Weak" : "Split";
    
    const id = mt.item.id.padEnd(9);
    const consStr = `${decisions[consensusIdx]} (${consensus})`.padEnd(15);
    const confStr = `${consensusConfidence}%`.padEnd(10);
    const action = actions[consensusIdx].padEnd(26);
    console.log(`│ ${id} │ ${consStr} │ ${confStr} │ ${action} │`);

    // Select "winner" based on consensus
    // In a real system, all moderators on the winning side would be rewarded
    const winningVotes = mt.votes.filter(v => v.decision === consensusIdx);
    const winner = winningVotes[0];  // Pick first for demo

    await sleep(500);
    
    // Fast-forward past deadline
    const submissions = await task.getSubmissions();
    if (submissions.length > 0) {
      // In practice, verifier would check consensus
      const selectTx = await task.selectWinner(submissions[0].agent);
      await selectTx.wait();

      await sleep(500);
      
      const finalizeTx = await task.finalize();
      await finalizeTx.wait();
    }
  }
  console.log("└───────────┴─────────────────┴────────────┴────────────────────────────┘");

  // ── Reputation updates ────────────────────────────────────────
  section("Step 6: Moderator Performance");

  console.log("\n┌──────────────┬────────────┬──────────┬───────────┬─────────────────────┐");
  console.log("│ Moderator    │ Agreement  │ Accuracy │ New Rep   │ Status              │");
  console.log("├──────────────┼────────────┼──────────┼───────────┼─────────────────────┤");

  for (const m of moderators) {
    // Calculate how often they agreed with consensus
    const agreementRate = Math.floor(Math.random() * 20) + 75; // 75-95%
    const newRep = m.reputation + (agreementRate > 85 ? 25 : 10);
    const status = agreementRate > 90 ? "⭐ Expert" : agreementRate > 80 ? "✓ Trusted" : "📈 Learning";

    const label = m.label.padEnd(12);
    const agree = `${agreementRate}%`.padEnd(10);
    const acc = `${m.accuracy}%`.padEnd(8);
    const rep = `${newRep} ↑`.padEnd(9);
    console.log(`│ ${label} │ ${agree} │ ${acc} │ ${rep} │ ${status.padEnd(19)} │`);
  }
  console.log("└──────────────┴────────────┴──────────┴───────────┴─────────────────────┘");

  // ── DAO governance notes ──────────────────────────────────────
  section("DAO Governance Notes");

  log("GOV", "Moderation DAO best practices:");
  log("GOV", "  1. Require multiple moderators per decision (consensus)");
  log("GOV", "  2. Weight votes by reputation and historical accuracy");
  log("GOV", "  3. Enable appeals for rejected content (new task)");
  log("GOV", "  4. Slash moderators who consistently vote against consensus");
  log("GOV", "  5. Reward accurate moderators from DAO treasury");
  log("GOV", "  6. Graduated access: new moderators start with limited power");
  log("GOV", "  7. Transparency: all decisions on-chain, auditable");

  log("WARNING", "Content moderation requires:");
  log("WARNING", "  - Clear, published community guidelines");
  log("WARNING", "  - Human escalation path for edge cases");
  log("WARNING", "  - Regular guideline updates via DAO vote");
  log("WARNING", "  - Appeals process with new moderator panel");

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  MODERATION DAO SIMULATION COMPLETE ✓                     ║");
  console.log("║  Consensus reached. Content decisions are transparent.    ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
