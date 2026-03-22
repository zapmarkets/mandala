#!/usr/bin/env tsx
/**
 * Deploy Mandala to local Anvil and output config JSON.
 * 
 * Usage: npx tsx scripts/deploy-local.ts > demo/deployed.json
 *        (or just: npx tsx scripts/deploy-local.ts)
 * 
 * Uses Anvil's default funded accounts (10000 ETH each).
 */
import { ethers, Contract, Wallet, JsonRpcProvider } from "ethers";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadAbi(name: string) {
  const raw = readFileSync(resolve(__dirname, `abis/${name}.json`), "utf-8");
  return JSON.parse(raw);
}

// Anvil default accounts (deterministic from mnemonic "test test test test test test test test test test test junk")
const ANVIL_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Account 0
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Account 1
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Account 2
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // Account 3
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // Account 4
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // Account 5
];

async function main() {
  const rpc = process.env.ANVIL_RPC || "http://127.0.0.1:8545";
  const provider = new JsonRpcProvider(rpc);

  // Verify anvil is running and reset state
  try {
    await provider.getBlockNumber();
  } catch {
    console.error("ERROR: Anvil not running at", rpc);
    console.error("Start it with: anvil");
    process.exit(1);
  }

  const deployer = new Wallet(ANVIL_KEYS[0], provider);
  const deployerAddr = await deployer.getAddress();
  
  const policyAbi = loadAbi("MandalaPolicy");
  const registryAbi = loadAbi("MandalaAgentRegistry");
  const taskAbi = loadAbi("MandalaTask");
  const factoryAbi = loadAbi("MandalaFactory");

  // Load bytecodes from forge artifacts
  function loadBytecode(contract: string): string {
    const artifact = JSON.parse(
      readFileSync(resolve(__dirname, `../out/${contract}.sol/${contract}.json`), "utf-8")
    );
    return artifact.bytecode.object;
  }

  const stderr = (msg: string) => process.stderr.write(msg + "\n");

  stderr("\n  Deploying Mandala to local Anvil...\n");

  let nonce = await provider.getTransactionCount(deployerAddr);

  // 1. Deploy Policy
  stderr("  [1/4] MandalaPolicy...");
  const PolicyFactory = new ethers.ContractFactory(policyAbi, loadBytecode("MandalaPolicy"), deployer);
  const policy = await PolicyFactory.deploy(
    deployerAddr,                    // admin
    ethers.parseEther("0.5"),        // humanGateThreshold (0.5 ETH)
    ethers.parseEther("0.001"),      // minStake
    deployerAddr,                    // treasury
    { nonce: nonce++ }
  );
  await policy.waitForDeployment();
  const policyAddr = await policy.getAddress();
  stderr(`         ${policyAddr}`);

  // 2. Deploy Registry
  stderr("  [2/4] MandalaAgentRegistry...");
  const RegistryFactory = new ethers.ContractFactory(registryAbi, loadBytecode("MandalaAgentRegistry"), deployer);
  const registry = await RegistryFactory.deploy(deployerAddr, policyAddr, { nonce: nonce++ });
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  stderr(`         ${registryAddr}`);

  // 3. Deploy Task Implementation
  stderr("  [3/4] MandalaTask (implementation)...");
  const TaskFactory = new ethers.ContractFactory(taskAbi, loadBytecode("MandalaTask"), deployer);
  const taskImpl = await TaskFactory.deploy({ nonce: nonce++ });
  await taskImpl.waitForDeployment();
  const taskImplAddr = await taskImpl.getAddress();
  stderr(`         ${taskImplAddr}`);

  // 4. Deploy Factory
  stderr("  [4/4] MandalaFactory...");
  const FactoryFactory = new ethers.ContractFactory(factoryAbi, loadBytecode("MandalaFactory"), deployer);
  const factory = await FactoryFactory.deploy(
    deployerAddr,    // admin
    taskImplAddr,    // task implementation
    registryAddr,    // registry
    policyAddr,      // policy
    deployerAddr,    // treasury
    100,             // 1% protocol fee
    { nonce: nonce++ }
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  stderr(`         ${factoryAddr}`);

  // 5. Grant Factory MANAGER_ROLE on Registry
  stderr("  [5/5] Granting roles...");
  const MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MANAGER_ROLE"));
  const registryContract = new Contract(registryAddr, registryAbi, deployer);
  const tx = await registryContract.grantRole(MANAGER_ROLE, factoryAddr, { nonce: nonce++ });
  await tx.wait();
  stderr("         Factory granted MANAGER_ROLE on Registry");

  // Output JSON config
  const config = {
    rpc,
    chainId: Number((await provider.getNetwork()).chainId),
    deployer: deployerAddr,
    contracts: {
      policy: policyAddr,
      registry: registryAddr,
      taskImpl: taskImplAddr,
      factory: factoryAddr,
    },
    agents: {
      coordinator: { key: ANVIL_KEYS[1], label: "Atlas (Coordinator)" },
      workerA:     { key: ANVIL_KEYS[2], label: "Nova (Researcher)" },
      workerB:     { key: ANVIL_KEYS[3], label: "Cipher (Coder)" },
      workerC:     { key: ANVIL_KEYS[4], label: "Sentinel (Auditor)" },
      verifier:    { key: ANVIL_KEYS[5], label: "Oracle (Verifier)" },
    },
  };

  // Write config to file
  const outPath = resolve(__dirname, "../demo/deployed.json");
  const { mkdirSync, writeFileSync } = await import("fs");
  mkdirSync(resolve(__dirname, "../demo"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(config, null, 2));
  
  stderr(`\n  ✓ Config written to ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
