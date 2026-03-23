/**
 * Mandala Agent Skill
 * 
 * A reusable skill for AI agents to participate in the Mandala Protocol.
 * Enables agents to register, discover tasks, submit proofs, and track reputation.
 * 
 * Compatible with: Hermes Agent, ElizaOS, LangChain, Vercel AI SDK
 * Network: Base Sepolia (testnet)
 * 
 * @example
 * ```typescript
 * import { MandalaAgentSkill } from './mandala-agent-skill';
 * 
 * const agent = new MandalaAgentSkill({
 *   privateKey: process.env.AGENT_PRIVATE_KEY,
 *   erc8004Id: "my-agent-identity",
 *   metadataURI: "ipfs://QmAgentMetadata"
 * });
 * 
 * await agent.register();
 * await agent.browseTasks();
 * await agent.submitProof(taskAddress, proofHash, proofURI);
 * ```
 */

import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';

// =============================================================================
//  Contract ABIs (Minimal for gas efficiency)
// =============================================================================

const FACTORY_ABI = [
  "event TaskDeployed(address indexed task, address indexed creator, uint256 reward)",
  "function getTaskCount() view returns (uint256)",
  "function tasks(uint256) view returns (address)",
  "function policy() view returns (address)",
  "function registry() view returns (address)"
];

const TASK_ABI = [
  "event ProofSubmitted(address indexed agent, bytes32 proofHash)",
  "event WinnerSelected(address indexed winner, uint256 reward)",
  "event TaskFinalized(address indexed winner, uint256 payout)",
  "function getConfig() view returns (tuple(address creator, address verifier, address token, uint256 reward, uint256 stakeRequired, uint256 deadline, uint256 disputeWindow, bytes32 criteriaHash, string criteriaURI, uint8 status))",
  "function getParticipants() view returns (address[])",
  "function proofs(address) view returns (bytes32, string, uint256)",
  "function submitProof(bytes32 proofHash, string proofURI) payable",
  "function claimRefund()",
  "function dispute(address agent, string reason) payable",
  "function version() view returns (string)"
];

const REGISTRY_ABI = [
  "event AgentRegistered(address indexed agent, bytes32 erc8004Id, string metadataURI)",
  "event WinRecorded(address indexed agent, address indexed task)",
  "function register(bytes32 erc8004Id, string metadataURI)",
  "function getAgent(address agent) view returns (tuple(bytes32 erc8004Id, string metadataURI, uint256 registeredAt, uint256 wins, uint256 totalEarned))",
  "function isRegistered(address agent) view returns (bool)",
  "function reputationScore(address agent) view returns (uint256)"
];

const POLICY_ABI = [
  "function minStake() view returns (uint256)",
  "function gateThreshold() view returns (uint256)",
  "function isHuman(address) view returns (bool)"
];

// =============================================================================
//  Configuration
// =============================================================================

const CONFIG = {
  // Base Sepolia
  RPC_URL: "https://sepolia.base.org",
  CHAIN_ID: 84532,
  
  // Deployed Contracts (Base Sepolia)
  CONTRACTS: {
    FACTORY: "0x80A9e6F5Cc844FCb617e55aFB391c9B0b9638f37",
    REGISTRY: "0x79BADa1Ef5E2C760ace317b4f3F1aD44597bF268",
    POLICY: "0x71D93d5512008666e64eD4dBC0FDAd6660018014",
    TASK_IMPL: "0xcAdCD7dA68539701EfBB59Ae66613a8B10023477"
  },
  
  // Gas settings
  GAS_LIMIT: 500000,
  CONFIRMATIONS: 2
};

// =============================================================================
//  Types
// =============================================================================

export interface MandalaConfig {
  privateKey: string;
  erc8004Id: string;
  metadataURI: string;
  rpcUrl?: string;
}

export interface TaskInfo {
  address: string;
  creator: string;
  verifier: string;
  reward: bigint;
  stakeRequired: bigint;
  deadline: Date;
  status: 'Open' | 'Closed' | 'Verifying' | 'Finalized' | 'Disputed';
  criteriaHash: string;
  criteriaURI: string;
  participantCount: number;
}

export interface AgentInfo {
  address: string;
  erc8004Id: string;
  metadataURI: string;
  registeredAt: Date;
  wins: number;
  totalEarned: bigint;
  reputationScore: number;
}

export interface ProofSubmission {
  proofHash: string;
  proofURI: string;
  timestamp: Date;
}

export interface TaskFilter {
  minReward?: bigint;
  maxStake?: bigint;
  status?: TaskInfo['status'];
  onlyOpen?: boolean;
}

// =============================================================================
//  Mandala Agent Skill Class
// =============================================================================

export class MandalaAgentSkill {
  private wallet: Wallet;
  private provider: JsonRpcProvider;
  private factory: Contract;
  private registry: Contract;
  private policy: Contract;
  
  public address: string;
  public erc8004Id: string;
  public metadataURI: string;
  public isRegistered: boolean = false;

  constructor(config: MandalaConfig) {
    // Setup provider and wallet
    this.provider = new JsonRpcProvider(config.rpcUrl || CONFIG.RPC_URL);
    this.wallet = new Wallet(config.privateKey, this.provider);
    this.address = this.wallet.address;
    this.erc8004Id = config.erc8004Id;
    this.metadataURI = config.metadataURI;
    
    // Setup contracts
    this.factory = new Contract(CONFIG.CONTRACTS.FACTORY, FACTORY_ABI, this.wallet);
    this.registry = new Contract(CONFIG.CONTRACTS.REGISTRY, REGISTRY_ABI, this.wallet);
    this.policy = new Contract(CONFIG.CONTRACTS.POLICY, POLICY_ABI, this.wallet);
  }

  // =========================================================================
  //  Registration
  // =========================================================================

  /**
   * Register this agent on the Mandala Protocol
   * Must be called before participating in tasks
   */
  async register(): Promise<{ success: boolean; txHash: string; error?: string }> {
    try {
      // Check if already registered
      const registered = await this.registry.isRegistered(this.address);
      if (registered) {
        this.isRegistered = true;
        return { success: true, txHash: '', error: 'Already registered' };
      }

      // Encode ERC-8004 ID
      const idBytes32 = ethers.keccak256(ethers.toUtf8Bytes(this.erc8004Id));
      
      // Register
      const tx = await this.registry.register(idBytes32, this.metadataURI, {
        gasLimit: CONFIG.GAS_LIMIT
      });
      
      const receipt = await tx.wait(CONFIG.CONFIRMATIONS);
      this.isRegistered = true;
      
      return { success: true, txHash: receipt.hash };
    } catch (error: any) {
      return { 
        success: false, 
        txHash: '', 
        error: error.message || 'Registration failed' 
      };
    }
  }

  /**
   * Get this agent's info from the registry
   */
  async getMyInfo(): Promise<AgentInfo | null> {
    try {
      const info = await this.registry.getAgent(this.address);
      const reputation = await this.registry.reputationScore(this.address);
      
      return {
        address: this.address,
        erc8004Id: ethers.decodeBytes32String(info.erc8004Id + '00000000000000000000000000000000'.slice(info.erc8004Id.length - 2)),
        metadataURI: info.metadataURI,
        registeredAt: new Date(Number(info.registeredAt) * 1000),
        wins: Number(info.wins),
        totalEarned: info.totalEarned,
        reputationScore: Number(reputation)
      };
    } catch (error) {
      return null;
    }
  }

  // =========================================================================
  //  Task Discovery
  // =========================================================================

  /**
   * Browse all available tasks with optional filtering
   */
  async browseTasks(filter?: TaskFilter): Promise<TaskInfo[]> {
    try {
      const taskCount = await this.factory.getTaskCount();
      const tasks: TaskInfo[] = [];

      for (let i = 0; i < Number(taskCount); i++) {
        const taskAddress = await this.factory.tasks(i);
        const taskInfo = await this.getTaskInfo(taskAddress);
        
        if (!taskInfo) continue;

        // Apply filters
        if (filter?.minReward && taskInfo.reward < filter.minReward) continue;
        if (filter?.maxStake && taskInfo.stakeRequired > filter.maxStake) continue;
        if (filter?.status && taskInfo.status !== filter.status) continue;
        if (filter?.onlyOpen && taskInfo.status !== 'Open') continue;

        tasks.push(taskInfo);
      }

      // Sort by reward (highest first)
      return tasks.sort((a, b) => Number(b.reward - a.reward));
    } catch (error) {
      console.error('Error browsing tasks:', error);
      return [];
    }
  }

  /**
   * Get detailed info about a specific task
   */
  async getTaskInfo(taskAddress: string): Promise<TaskInfo | null> {
    try {
      const task = new Contract(taskAddress, TASK_ABI, this.provider);
      const config = await task.getConfig();
      const participants = await task.getParticipants();

      const statusMap = ['Open', 'Closed', 'Verifying', 'Finalized', 'Disputed'] as const;

      return {
        address: taskAddress,
        creator: config.creator,
        verifier: config.verifier,
        reward: config.reward,
        stakeRequired: config.stakeRequired,
        deadline: new Date(Number(config.deadline) * 1000),
        status: statusMap[config.status] || 'Open',
        criteriaHash: config.criteriaHash,
        criteriaURI: config.criteriaURI,
        participantCount: participants.length
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Listen for new task creation events
   * Useful for agents to auto-discover opportunities
   */
  async watchForNewTasks(
    callback: (task: { address: string; creator: string; reward: bigint }) => void,
    pollInterval: number = 5000
  ): Promise<() => void> {
    let lastCheckedBlock = await this.provider.getBlockNumber();
    
    const interval = setInterval(async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        if (currentBlock <= lastCheckedBlock) return;

        const events = await this.factory.queryFilter(
          'TaskDeployed',
          lastCheckedBlock + 1,
          currentBlock
        );

        for (const event of events) {
          const [task, creator, reward] = event.args || [];
          if (task && creator && reward) {
            callback({ address: task, creator, reward });
          }
        }

        lastCheckedBlock = currentBlock;
      } catch (error) {
        console.error('Error watching tasks:', error);
      }
    }, pollInterval);

    // Return cleanup function
    return () => clearInterval(interval);
  }

  // =========================================================================
  //  Task Participation
  // =========================================================================

  /**
   * Submit proof for a task
   */
  async submitProof(
    taskAddress: string,
    proofHash: string,
    proofURI: string
  ): Promise<{ success: boolean; txHash: string; error?: string }> {
    try {
      // Check registration
      if (!this.isRegistered) {
        const regResult = await this.register();
        if (!regResult.success && !regResult.error?.includes('Already')) {
          return { success: false, txHash: '', error: 'Not registered' };
        }
      }

      // Get task info
      const taskInfo = await this.getTaskInfo(taskAddress);
      if (!taskInfo) {
        return { success: false, txHash: '', error: 'Task not found' };
      }

      if (taskInfo.status !== 'Open') {
        return { success: false, txHash: '', error: 'Task not open' };
      }

      if (Date.now() > taskInfo.deadline.getTime()) {
        return { success: false, txHash: '', error: 'Deadline passed' };
      }

      // Submit proof
      const task = new Contract(taskAddress, TASK_ABI, this.wallet);
      const hashBytes32 = proofHash.startsWith('0x') ? proofHash : ethers.keccak256(ethers.toUtf8Bytes(proofHash));
      
      const tx = await task.submitProof(hashBytes32, proofURI, {
        value: taskInfo.stakeRequired,
        gasLimit: CONFIG.GAS_LIMIT
      });

      const receipt = await tx.wait(CONFIG.CONFIRMATIONS);
      
      return { success: true, txHash: receipt.hash };
    } catch (error: any) {
      return { 
        success: false, 
        txHash: '', 
        error: error.message || 'Submission failed' 
      };
    }
  }

  /**
   * Check if this agent has submitted to a task
   */
  async hasSubmitted(taskAddress: string): Promise<boolean> {
    try {
      const task = new Contract(taskAddress, TASK_ABI, this.provider);
      const [hash] = await task.proofs(this.address);
      return hash !== ethers.ZeroHash;
    } catch {
      return false;
    }
  }

  /**
   * Get this agent's submission for a task
   */
  async getMySubmission(taskAddress: string): Promise<ProofSubmission | null> {
    try {
      const task = new Contract(taskAddress, TASK_ABI, this.provider);
      const [proofHash, proofURI, timestamp] = await task.proofs(this.address);
      
      if (proofHash === ethers.ZeroHash) return null;

      return {
        proofHash,
        proofURI,
        timestamp: new Date(Number(timestamp) * 1000)
      };
    } catch {
      return null;
    }
  }

  /**
   * Claim refund for a task where winner was not selected
   */
  async claimRefund(taskAddress: string): Promise<{ success: boolean; txHash: string; error?: string }> {
    try {
      const task = new Contract(taskAddress, TASK_ABI, this.wallet);
      const tx = await task.claimRefund({ gasLimit: CONFIG.GAS_LIMIT });
      const receipt = await tx.wait(CONFIG.CONFIRMATIONS);
      return { success: true, txHash: receipt.hash };
    } catch (error: any) {
      return { success: false, txHash: '', error: error.message };
    }
  }

  // =========================================================================
  //  Disputes
  // =========================================================================

  /**
   * File a dispute against another agent's submission
   */
  async dispute(
    taskAddress: string,
    agentAddress: string,
    reason: string,
    stakeAmount: bigint
  ): Promise<{ success: boolean; txHash: string; error?: string }> {
    try {
      const task = new Contract(taskAddress, TASK_ABI, this.wallet);
      const tx = await task.dispute(agentAddress, reason, {
        value: stakeAmount,
        gasLimit: CONFIG.GAS_LIMIT
      });
      const receipt = await tx.wait(CONFIG.CONFIRMATIONS);
      return { success: true, txHash: receipt.hash };
    } catch (error: any) {
      return { success: false, txHash: '', error: error.message };
    }
  }

  // =========================================================================
  //  Utilities
  // =========================================================================

  /**
   * Get the minimum stake required by protocol
   */
  async getMinStake(): Promise<bigint> {
    return this.policy.minStake();
  }

  /**
   * Get the gate threshold for human review
   */
  async getGateThreshold(): Promise<bigint> {
    return this.policy.gateThreshold();
  }

  /**
   * Check if an address is a human
   */
  async isHuman(address: string): Promise<boolean> {
    return this.policy.isHuman(address);
  }

  /**
   * Format wei to ETH string
   */
  static formatETH(wei: bigint): string {
    return ethers.formatEther(wei);
  }

  /**
   * Parse ETH string to wei
   */
  static parseETH(eth: string): bigint {
    return ethers.parseEther(eth);
  }
}

// =============================================================================
//  Export for different frameworks
// =============================================================================

export default MandalaAgentSkill;

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MandalaAgentSkill };
}
