'use client';

import { useState, useRef, useEffect } from 'react';
import { ethers } from 'ethers';
import { RPC_URL, ADDRESSES, RegistryABI, FactoryABI, TaskABI } from '@/lib/contracts';

interface LogEntry {
  step: number;
  action: string;
  detail: string;
  status: 'pending' | 'running' | 'success' | 'error';
  txHash?: string;
}

const ACCOUNTS = {
  coordinator: {
    name: 'Atlas',
    role: 'Coordinator',
    key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  nova: {
    name: 'Nova',
    role: 'Worker',
    key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
  cipher: {
    name: 'Cipher',
    role: 'Worker',
    key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  },
  sentinel: {
    name: 'Sentinel',
    role: 'Worker',
    key: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  },
  oracle: {
    name: 'Oracle',
    role: 'Verifier',
    key: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  },
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContract = any;

export default function DemoPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [scoreboard, setScoreboard] = useState<Array<{name: string; address: string; wins: string; tasks: string; rep: string}>>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  function addLog(entry: LogEntry) {
    setLogs((prev) => [...prev, entry]);
  }

  function updateLastLog(update: Partial<LogEntry>) {
    setLogs((prev) => {
      const copy = [...prev];
      const last = { ...copy[copy.length - 1], ...update };
      copy[copy.length - 1] = last;
      return copy;
    });
  }

  async function runDemo() {
    setRunning(true);
    setDone(false);
    setLogs([]);
    setScoreboard([]);
    abortRef.current = false;

    let stepNum = 0;

    function step(action: string, detail: string): number {
      stepNum++;
      addLog({ step: stepNum, action, detail, status: 'running' });
      return stepNum;
    }

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);

      // Create wallets
      const coordinator = new ethers.Wallet(ACCOUNTS.coordinator.key, provider);
      const nova = new ethers.Wallet(ACCOUNTS.nova.key, provider);
      const cipher = new ethers.Wallet(ACCOUNTS.cipher.key, provider);
      const sentinel = new ethers.Wallet(ACCOUNTS.sentinel.key, provider);
      const oracle = new ethers.Wallet(ACCOUNTS.oracle.key, provider);

      // Create contract instances connected to signers
      const registryRead = new ethers.Contract(ADDRESSES.registry, RegistryABI, provider);
      const factoryRead = new ethers.Contract(ADDRESSES.factory, FactoryABI, provider);

      // ── Step 1: Initialize ──
      step('Initialize', 'Connecting to Anvil local chain...');
      await delay(500);
      const blockNum = await provider.getBlockNumber();
      updateLastLog({ status: 'success', detail: `Connected! Block #${blockNum}` });
      await delay(300);

      const workers = [
        { wallet: nova, name: 'Nova', id: 'nova-agent-v1' },
        { wallet: cipher, name: 'Cipher', id: 'cipher-agent-v1' },
        { wallet: sentinel, name: 'Sentinel', id: 'sentinel-agent-v1' },
      ];

      // Register coordinator
      step('Register Agent', `Registering ${ACCOUNTS.coordinator.name} (Coordinator)...`);
      await delay(400);
      try {
        const isReg = await registryRead.isRegistered(coordinator.address);
        if (!isReg) {
          const regCoord: AnyContract = new ethers.Contract(ADDRESSES.registry, RegistryABI, coordinator);
          const tx = await regCoord.register(
            ethers.id('atlas-coordinator-v1'),
            'ipfs://atlas-meta'
          );
          await tx.wait();
          updateLastLog({ status: 'success', detail: `${ACCOUNTS.coordinator.name} registered`, txHash: tx.hash });
        } else {
          updateLastLog({ status: 'success', detail: `${ACCOUNTS.coordinator.name} already registered` });
        }
      } catch {
        updateLastLog({ status: 'success', detail: `${ACCOUNTS.coordinator.name} registration handled` });
      }
      await delay(300);

      // Register workers
      for (const w of workers) {
        if (abortRef.current) return;
        step('Register Agent', `Registering ${w.name}...`);
        await delay(300);
        try {
          const isReg = await registryRead.isRegistered(w.wallet.address);
          if (!isReg) {
            const regW: AnyContract = new ethers.Contract(ADDRESSES.registry, RegistryABI, w.wallet);
            const tx = await regW.register(
              ethers.id(w.id),
              `ipfs://${w.id}-meta`
            );
            await tx.wait();
            updateLastLog({ status: 'success', detail: `${w.name} registered ✓`, txHash: tx.hash });
          } else {
            updateLastLog({ status: 'success', detail: `${w.name} already registered ✓` });
          }
        } catch {
          updateLastLog({ status: 'success', detail: `${w.name} registration handled ✓` });
        }
        await delay(200);
      }

      // Register oracle/verifier
      step('Register Agent', `Registering ${ACCOUNTS.oracle.name} (Verifier)...`);
      await delay(300);
      try {
        const isReg = await registryRead.isRegistered(oracle.address);
        if (!isReg) {
          const regOracle: AnyContract = new ethers.Contract(ADDRESSES.registry, RegistryABI, oracle);
          const tx = await regOracle.register(
            ethers.id('oracle-verifier-v1'),
            'ipfs://oracle-meta'
          );
          await tx.wait();
          updateLastLog({ status: 'success', detail: `${ACCOUNTS.oracle.name} registered ✓`, txHash: tx.hash });
        } else {
          updateLastLog({ status: 'success', detail: `${ACCOUNTS.oracle.name} already registered ✓` });
        }
      } catch {
        updateLastLog({ status: 'success', detail: `${ACCOUNTS.oracle.name} registration handled ✓` });
      }
      await delay(500);

      // ── Step 2: Deploy Task ──
      step('Deploy Task', 'Coordinator Atlas deploying a new task...');
      await delay(500);

      const currentBlock = await provider.getBlock('latest');
      const now = currentBlock!.timestamp;
      const deadlineTs = now + 600; // 10 minutes to avoid edge cases
      const disputeWindowSecs = 60;
      const stakeRequired = ethers.parseEther('0.01');
      const rewardAmount = ethers.parseEther('0.1');

      const deployParams = {
        verifier: oracle.address,
        token: ethers.ZeroAddress,
        stakeRequired: stakeRequired,
        deadline: deadlineTs,
        disputeWindow: disputeWindowSecs,
        criteriaHash: ethers.id('AI task: analyze dataset and produce insight report'),
        criteriaURI: 'ipfs://QmCriteriaHash123',
        humanGateEnabled: false,
        reward: 0,
      };

      const factoryCoord: AnyContract = new ethers.Contract(ADDRESSES.factory, FactoryABI, coordinator);
      const tx1 = await factoryCoord.deployTask(deployParams, { value: rewardAmount });
      const receipt = await tx1.wait();

      // Find task address from logs
      let taskAddress = '';
      for (const log of receipt.logs) {
        try {
          const parsed = factoryRead.interface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed && parsed.name === 'TaskDeployed') {
            taskAddress = parsed.args[0];
            break;
          }
        } catch {
          // skip
        }
      }

      if (!taskAddress) {
        const allT = await factoryRead.allTasks();
        taskAddress = allT[allT.length - 1];
      }

      updateLastLog({
        status: 'success',
        detail: `Task deployed at ${taskAddress.slice(0, 10)}...`,
        txHash: tx1.hash,
      });
      await delay(500);

      // ── Step 3: Submit Proofs ──
      for (const w of workers) {
        if (abortRef.current) return;
        step('Submit Proof', `${w.name} submitting proof with ${ethers.formatEther(stakeRequired)} ETH stake...`);
        await delay(400);

        const proofHash = ethers.id(`proof-${w.name}-${Date.now()}`);
        const evidenceURI = `ipfs://evidence-${w.name.toLowerCase()}`;

        const taskW: AnyContract = new ethers.Contract(taskAddress, TaskABI, w.wallet);
        const tx = await taskW.submitProof(proofHash, evidenceURI, { value: stakeRequired });
        await tx.wait();

        updateLastLog({
          status: 'success',
          detail: `${w.name} submitted proof ✓`,
          txHash: tx.hash,
        });
        await delay(300);
      }

      // ── Step 4: Fast-forward past deadline ──
      step('Time Travel', 'Fast-forwarding past submission deadline...');
      await delay(400);
      await provider.send('evm_increaseTime', [610]);
      await provider.send('evm_mine', []);
      updateLastLog({ status: 'success', detail: 'Deadline passed (evm_increaseTime +610s)' });
      await delay(400);

      // ── Step 5: Verifier selects winner ──
      step('Select Winner', `Verifier ${ACCOUNTS.oracle.name} reviewing submissions...`);
      await delay(600);

      const taskOracle: AnyContract = new ethers.Contract(taskAddress, TaskABI, oracle);
      const tx2 = await taskOracle.selectWinner(nova.address);
      await tx2.wait();

      updateLastLog({
        status: 'success',
        detail: `Nova selected as pending winner! Dispute window open.`,
        txHash: tx2.hash,
      });
      await delay(500);

      // ── Step 6: Fast-forward past dispute window ──
      step('Time Travel', 'Fast-forwarding past dispute window...');
      await delay(400);
      await provider.send('evm_increaseTime', [70]);
      await provider.send('evm_mine', []);
      updateLastLog({ status: 'success', detail: 'Dispute window expired (evm_increaseTime +70s)' });
      await delay(400);

      // ── Step 7: Finalize ──
      step('Finalize', 'Finalizing task and distributing rewards...');
      await delay(500);

      const taskCoord: AnyContract = new ethers.Contract(taskAddress, TaskABI, coordinator);
      const tx3 = await taskCoord.finalize();
      await tx3.wait();

      updateLastLog({
        status: 'success',
        detail: 'Task finalized! Nova wins 0.1 ETH reward ✓',
        txHash: tx3.hash,
      });
      await delay(500);

      // ── Step 8: Scoreboard ──
      step('Scoreboard', 'Fetching final agent scores...');
      await delay(400);

      const allAccounts = [
        { wallet: coordinator, name: 'Atlas (Coordinator)' },
        { wallet: nova, name: 'Nova' },
        { wallet: cipher, name: 'Cipher' },
        { wallet: sentinel, name: 'Sentinel' },
        { wallet: oracle, name: 'Oracle (Verifier)' },
      ];

      const scores = await Promise.all(
        allAccounts.map(async (a) => {
          try {
            const info = await registryRead.getAgent(a.wallet.address);
            const rep = await registryRead.reputationScore(a.wallet.address);
            return {
              name: a.name,
              address: a.wallet.address,
              wins: String(info.wins),
              tasks: String(info.totalTasks),
              rep: String(rep),
            };
          } catch {
            return { name: a.name, address: a.wallet.address, wins: '—', tasks: '—', rep: '—' };
          }
        })
      );

      setScoreboard(scores);
      updateLastLog({ status: 'success', detail: 'Demo complete! Check the scoreboard below.' });

      setDone(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ step: stepNum + 1, action: 'Error', detail: msg, status: 'error' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Live Demo</h1>
          <p className="text-gray-500 mt-1">Watch the full Mandala protocol lifecycle on Anvil</p>
        </div>
        <button
          onClick={runDemo}
          disabled={running}
          className={`px-6 py-3 rounded-lg font-medium text-sm transition-all ${
            running
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-cyan-500 text-gray-950 hover:bg-cyan-400 shadow-lg shadow-cyan-500/20'
          }`}
        >
          {running ? '⟳ Running...' : done ? '↻ Run Again' : '▶ Run Demo'}
        </button>
      </div>

      {/* Cast of Characters */}
      <div className="grid grid-cols-5 gap-3">
        {Object.values(ACCOUNTS).map((acc) => (
          <div key={acc.name} className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 text-center">
            <div className="text-lg mb-1">
              {acc.role === 'Coordinator' ? '👑' : acc.role === 'Verifier' ? '🔮' : '🤖'}
            </div>
            <p className="text-sm font-medium text-white">{acc.name}</p>
            <p className="text-xs text-gray-500">{acc.role}</p>
          </div>
        ))}
      </div>

      {/* Log Output */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
          <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
          <span className="w-3 h-3 rounded-full bg-green-500"></span>
          <span className="text-xs text-gray-500 ml-2 font-mono">mandala-demo</span>
        </div>
        <div ref={logRef} className="p-4 h-96 overflow-y-auto log-container font-mono text-sm">
          {logs.length === 0 ? (
            <p className="text-gray-600 text-center py-16">Click &quot;Run Demo&quot; to start the protocol walkthrough</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5">
                <span className="text-gray-600 w-6 text-right flex-shrink-0">{log.step}.</span>
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  log.status === 'success' ? 'bg-emerald-400' :
                  log.status === 'error' ? 'bg-red-400' :
                  log.status === 'running' ? 'bg-yellow-400 animate-pulse-dot' :
                  'bg-gray-600'
                }`} />
                <span className={`font-medium w-32 flex-shrink-0 ${
                  log.status === 'error' ? 'text-red-400' : 'text-purple-400'
                }`}>
                  [{log.action}]
                </span>
                <span className="text-gray-300 flex-1">{log.detail}</span>
                {log.txHash && (
                  <span className="text-gray-600 text-xs">{log.txHash.slice(0, 10)}...</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Scoreboard */}
      {scoreboard.length > 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">🏆 Final Scoreboard</h2>
          <div className="grid grid-cols-5 gap-4">
            {scoreboard.map((s) => (
              <div
                key={s.address}
                className={`p-4 rounded-lg border text-center ${
                  s.name === 'Nova'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-gray-800/30 border-gray-800'
                }`}
              >
                <p className="text-sm font-medium text-white mb-2">{s.name}</p>
                <div className="space-y-1 text-xs">
                  <p><span className="text-gray-500">Rep:</span> <span className="text-yellow-400">{s.rep}</span></p>
                  <p><span className="text-gray-500">Wins:</span> <span className="text-emerald-400">{s.wins}</span></p>
                  <p><span className="text-gray-500">Tasks:</span> <span className="text-gray-300">{s.tasks}</span></p>
                </div>
                {s.name === 'Nova' && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Winner 🏆
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
