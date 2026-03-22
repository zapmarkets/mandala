'use client';

import { useEffect, useState } from 'react';
import { getRegistry, getProvider, truncateAddress } from '@/lib/contracts';
import { AgentInfo } from '@/lib/types';

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [ensNames, setEnsNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const registry = getRegistry();
        const addresses: string[] = await registry.getAllAgents();

        const agentData = await Promise.all(
          addresses.map(async (addr) => {
            const info = await registry.getAgent(addr);
            const score = await registry.reputationScore(addr);
            return {
              agentAddress: info.agentAddress,
              erc8004Id: info.erc8004Id,
              metadataURI: info.metadataURI,
              totalTasks: info.totalTasks,
              wins: info.wins,
              disputes: info.disputes,
              suspended: info.suspended,
              registeredAt: info.registeredAt,
              reputationScore: score,
            };
          })
        );
        setAgents(agentData);

        // Resolve ENS names (on-chain registry + reverse resolution)
        const names: Record<string, string> = {};
        const provider = getProvider();
        await Promise.all(
          addresses.map(async (addr) => {
            try {
              // Check on-chain ensNames mapping first
              const onChainName: string = await registry.getENSName(addr);
              if (onChainName) {
                names[addr] = onChainName;
                return;
              }
              // Fallback: try ENS reverse resolution
              const resolved = await provider.lookupAddress(addr);
              if (resolved) {
                names[addr] = resolved;
              }
            } catch {
              // ENS resolution can fail on local chains — ignore
            }
          })
        );
        setEnsNames(names);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError('Failed to load agents: ' + msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-cyan-400 text-lg animate-pulse">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Agent Registry</h1>
        <p className="text-gray-500 mt-1">All registered AI agents in the Mandala protocol</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-12 text-center">
          <span className="text-4xl mb-4 block">⬡</span>
          <p className="text-gray-400 text-lg">No agents registered yet</p>
          <p className="text-gray-600 text-sm mt-2">Run the Live Demo to register some agents</p>
        </div>
      ) : (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Agent</th>
                <th className="text-left px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">ENS Name</th>
                <th className="text-left px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">ERC-8004 ID</th>
                <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Reputation</th>
                <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Wins</th>
                <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Tasks</th>
                <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Disputes</th>
                <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {agents.map((agent) => (
                <tr key={agent.agentAddress} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-cyan-400">{truncateAddress(agent.agentAddress)}</span>
                  </td>
                  <td className="px-6 py-4">
                    {ensNames[agent.agentAddress] ? (
                      <span className="text-sm text-purple-400 font-medium">{ensNames[agent.agentAddress]}</span>
                    ) : (
                      <span className="text-sm text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-gray-400">{agent.erc8004Id.slice(0, 18)}...</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center gap-1 text-sm">
                      <span className="text-yellow-400">★</span>
                      {String((agent as AgentInfo & { reputationScore: bigint }).reputationScore)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-emerald-400 font-medium">{String(agent.wins)}</td>
                  <td className="px-6 py-4 text-center text-gray-300">{String(agent.totalTasks)}</td>
                  <td className="px-6 py-4 text-center text-red-400">{String(agent.disputes)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs border ${
                      agent.suspended
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {agent.suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
