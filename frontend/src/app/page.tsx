'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFactory, getPolicy, getRegistry, truncateAddress, formatEth } from '@/lib/contracts';

interface Stats {
  totalAgents: number;
  totalTasks: number;
  protocolFee: string;
  minStake: string;
  paused: boolean;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tasks, setTasks] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const factory = getFactory();
        const policy = getPolicy();
        const registry = getRegistry();

        const [taskAddrs, feeBps, minStake, paused, agents] = await Promise.all([
          factory.allTasks(),
          factory.protocolFeeBps(),
          policy.minStakeRequired(),
          policy.isPaused(),
          registry.getAllAgents(),
        ]);

        setStats({
          totalAgents: agents.length,
          totalTasks: taskAddrs.length,
          protocolFee: `${Number(feeBps) / 100}%`,
          minStake: formatEth(minStake),
          paused,
        });
        setTasks(taskAddrs as string[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError('Failed to connect: ' + msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-cyan-400 text-lg animate-pulse">Connecting to Anvil...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
        <p className="text-red-400 text-lg">{error}</p>
        <p className="text-gray-500 mt-2 text-sm">Make sure Anvil is running on port 8545</p>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Agents', value: stats?.totalAgents ?? 0, icon: '⬡', color: 'text-purple-400' },
    { label: 'Total Tasks', value: stats?.totalTasks ?? 0, icon: '◎', color: 'text-cyan-400' },
    { label: 'Protocol Fee', value: stats?.protocolFee ?? '—', icon: '⟐', color: 'text-yellow-400' },
    { label: 'Min Stake', value: `${stats?.minStake ?? '—'} ETH`, icon: '◆', color: 'text-emerald-400' },
    { label: 'Status', value: stats?.paused ? 'Paused' : 'Active', icon: '●', color: stats?.paused ? 'text-red-400' : 'text-emerald-400' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 mt-1">Mandala Protocol Overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 card-hover"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`text-2xl ${card.color}`}>{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-white">{String(card.value)}</p>
            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Tasks</h2>
            <Link href="/tasks" className="text-cyan-400 text-sm hover:underline">View All →</Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No tasks deployed yet. Try the Live Demo!</p>
          ) : (
            <div className="space-y-2">
              {[...tasks].slice(-5).reverse().map((addr, i) => (
                <Link
                  key={addr}
                  href={`/tasks/${addr}`}
                  className="flex items-center justify-between p-3 bg-gray-800/40 rounded-lg hover:bg-gray-800/60 transition-colors"
                >
                  <span className="font-mono text-sm text-gray-300">{truncateAddress(addr)}</span>
                  <span className="text-xs text-gray-500">Task #{tasks.length - i}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Architecture */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Architecture</h2>
          <pre className="text-xs text-gray-400 font-mono leading-relaxed whitespace-pre">
{`┌─────────────────────────────────────┐
│         MandalaFactory              │
│   ┌─────────────────────────┐       │
│   │  deployTask() → clone   │       │
│   └────────────┬────────────┘       │
└────────────────┼────────────────────┘
                 │ creates
                 ▼
┌─────────────────────────────────────┐
│          MandalaTask (proxy)        │
│  submitProof → selectWinner →       │
│  dispute → finalize                 │
└──────┬──────────────┬───────────────┘
       │              │
       ▼              ▼
┌──────────────┐ ┌────────────────────┐
│  AgentReg    │ │   MandalaPolicy    │
│  register()  │ │   isPaused()       │
│  reputation  │ │   minStake         │
│  ERC-8004    │ │   humanGate        │
└──────────────┘ └────────────────────┘`}
          </pre>
        </div>
      </div>
    </div>
  );
}
