import { ethers, Contract, JsonRpcProvider, Wallet } from "ethers";
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

// Load .env from project root
config({ path: resolve(__dirname, "../.env") });

// ---------------------------------------------------------------------------
// ABI loading
// ---------------------------------------------------------------------------
function loadAbi(name: string): string[] {
  const raw = readFileSync(resolve(__dirname, `abis/${name}.json`), "utf-8");
  return JSON.parse(raw);
}

export const ABIS = {
  registry: loadAbi("MandalaAgentRegistry"),
  factory: loadAbi("MandalaFactory"),
  task: loadAbi("MandalaTask"),
  policy: loadAbi("MandalaPolicy"),
};

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
export const ENV = {
  rpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  privateKey: process.env.PRIVATE_KEY || "",
  policyAddress: process.env.POLICY_ADDRESS || "",
  registryAddress: process.env.REGISTRY_ADDRESS || "",
  factoryAddress: process.env.FACTORY_ADDRESS || "",
  taskImplAddress: process.env.TASK_IMPL_ADDRESS || "",
  // Multi-agent keys for demo
  coordinatorKey: process.env.COORDINATOR_KEY || process.env.PRIVATE_KEY || "",
  workerAKey: process.env.WORKER_A_KEY || "",
  workerBKey: process.env.WORKER_B_KEY || "",
  verifierKey: process.env.VERIFIER_KEY || "",
};

// ---------------------------------------------------------------------------
// Provider + Signer (default)
// ---------------------------------------------------------------------------
export function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(ENV.rpc);
}

export function getSigner(privateKey?: string): Wallet {
  const key = privateKey || ENV.privateKey;
  if (!key) throw new Error("No private key provided");
  return new Wallet(key, getProvider());
}

// ---------------------------------------------------------------------------
// Contract instances
// ---------------------------------------------------------------------------
export function getRegistry(signer?: Wallet): Contract {
  const s = signer || getSigner();
  return new Contract(ENV.registryAddress, ABIS.registry, s);
}

export function getFactory(signer?: Wallet): Contract {
  const s = signer || getSigner();
  return new Contract(ENV.factoryAddress, ABIS.factory, s);
}

export function getTask(taskAddress: string, signer?: Wallet): Contract {
  const s = signer || getSigner();
  return new Contract(taskAddress, ABIS.task, s);
}

export function getPolicy(signer?: Wallet): Contract {
  const s = signer || getSigner();
  return new Contract(ENV.policyAddress, ABIS.policy, s);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const { parseEther, formatEther, keccak256, toUtf8Bytes, ZeroAddress } = ethers;

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function log(prefix: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${prefix}] ${msg}`);
}

/**
 * Register an agent in the registry if not already registered.
 */
export async function ensureRegistered(
  registry: Contract,
  signer: Wallet,
  label: string
): Promise<void> {
  const addr = await signer.getAddress();
  const registered = await registry.isRegistered(addr);
  if (registered) {
    log(label, `Already registered: ${shortAddr(addr)}`);
    return;
  }
  log(label, `Registering agent ${shortAddr(addr)}...`);
  const id = keccak256(toUtf8Bytes(`mandala-agent-${addr.toLowerCase()}`));
  const tx = await registry.register(id, `https://mandala.agent/${addr.toLowerCase()}`);
  await tx.wait();
  log(label, `Registered! tx: ${tx.hash}`);
}

export const TaskStatus = ["Open", "Verifying", "Disputed", "Finalized", "Cancelled"];
