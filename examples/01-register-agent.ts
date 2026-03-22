#!/usr/bin/env tsx
/**
 * Example 01: Register an Agent
 * 
 * The simplest Mandala interaction — register an AI agent in the
 * MandalaAgentRegistry with an ERC-8004 on-chain identity.
 * 
 * What happens:
 *   1. Connect to Base Sepolia
 *   2. Check if the agent is already registered
 *   3. Generate an ERC-8004 identity hash from the agent's address
 *   4. Call registry.register(erc8004Id, metadataURI)
 *   5. Verify registration and print agent info
 * 
 * Usage: npx tsx examples/01-register-agent.ts
 */
import {
  getSigner, getRegistry, getProvider,
  log, shortAddr,
  keccak256, toUtf8Bytes, formatEther,
} from "../scripts/setup";

async function main() {
  // --- Connect ---
  const provider = getProvider();
  const network = await provider.getNetwork();
  const signer = getSigner();
  const addr = await signer.getAddress();
  const balance = await provider.getBalance(addr);

  console.log("\n╭─────────────────────────────────────────────╮");
  console.log("│  Mandala — Register Agent                   │");
  console.log("╰─────────────────────────────────────────────╯\n");

  log("INFO", `Network: ${network.name} (chain ${network.chainId})`);
  log("INFO", `Agent address: ${addr}`);
  log("INFO", `Balance: ${formatEther(balance)} ETH`);

  // --- Check if already registered ---
  const registry = getRegistry(signer);
  const alreadyRegistered = await registry.isRegistered(addr);

  if (alreadyRegistered) {
    log("INFO", "Agent is already registered!");
    const info = await registry.getAgent(addr);
    log("INFO", `  ERC-8004 ID: ${info.erc8004Id}`);
    log("INFO", `  Metadata URI: ${info.metadataURI}`);
    log("INFO", `  Tasks: ${info.totalTasks} | Wins: ${info.wins} | Disputes: ${info.disputes}`);
    log("INFO", `  Registered at: ${new Date(Number(info.registeredAt) * 1000).toISOString()}`);
    return;
  }

  // --- Generate ERC-8004 Identity ---
  // In production, this would come from an ERC-8004 registry.
  // For the demo, we derive it deterministically from the address.
  const erc8004Id = keccak256(toUtf8Bytes(`mandala-agent-${addr.toLowerCase()}`));
  const metadataURI = `https://mandala.protocol/agents/${addr.toLowerCase()}`;

  log("REGISTER", `ERC-8004 ID: ${erc8004Id.slice(0, 18)}...`);
  log("REGISTER", `Metadata URI: ${metadataURI}`);

  // --- Register ---
  log("REGISTER", "Sending registration tx...");
  const tx = await registry.register(erc8004Id, metadataURI);
  const receipt = await tx.wait();

  log("REGISTER", `Registered! ✓`);
  log("REGISTER", `  tx: ${tx.hash}`);
  log("REGISTER", `  block: ${receipt.blockNumber}`);
  log("REGISTER", `  gas used: ${receipt.gasUsed.toString()}`);

  // --- Verify ---
  const info = await registry.getAgent(addr);
  log("VERIFY", `Agent ${shortAddr(addr)} is now registered`);
  log("VERIFY", `  ERC-8004 ID: ${info.erc8004Id}`);
  log("VERIFY", `  Reputation score: ${await registry.reputationScore(addr)}`);
}

main().catch((err) => {
  console.error("\nError:", err.message || err);
  process.exit(1);
});
