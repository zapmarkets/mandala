'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFactory, getTask, truncateAddress, formatEth } from '@/lib/contracts';
import { TaskConfig, TaskStatus, TaskStatusLabels, TaskStatusColors } from '@/lib/types';

interface TaskSummary {
  address: string;
  config: TaskConfig;
  submissionCount: number;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const factory = getFactory();
        const addresses: string[] = await factory.allTasks();

        const taskData = await Promise.all(
          addresses.map(async (addr) => {
            const task = getTask(addr);
            const [config, subCount] = await Promise.all([
              task.getConfig(),
              task.submissionCount(),
            ]);
            return {
              address: addr,
              config: {
                coordinator: config.coordinator,
                verifier: config.verifier,
                token: config.token,
                reward: config.reward,
                stakeRequired: config.stakeRequired,
                deadline: config.deadline,
                disputeWindow: config.disputeWindow,
                criteriaHash: config.criteriaHash,
                criteriaURI: config.criteriaURI,
                humanGateEnabled: config.humanGateEnabled,
                status: Number(config.status) as TaskStatus,
              },
              submissionCount: Number(subCount),
            };
          })
        );
        setTasks(taskData);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError('Failed to load tasks: ' + msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-cyan-400 text-lg animate-pulse">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Tasks</h1>
        <p className="text-gray-500 mt-1">All tasks deployed via MandalaFactory</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-12 text-center">
          <span className="text-4xl mb-4 block">◎</span>
          <p className="text-gray-400 text-lg">No tasks deployed yet</p>
          <p className="text-gray-600 text-sm mt-2">Run the Live Demo to create a task</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tasks.map((t, i) => (
            <Link
              key={t.address}
              href={`/tasks/${t.address}`}
              className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 card-hover block"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-cyan-400 font-bold">
                    #{i + 1}
                  </div>
                  <div>
                    <p className="font-mono text-sm text-cyan-400">{truncateAddress(t.address)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Coordinator: {truncateAddress(t.config.coordinator)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-white font-medium">
                      {t.config.reward > 0n ? formatEth(t.config.reward) : formatEth(t.config.stakeRequired)} ETH
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.config.reward > 0n ? 'Reward' : 'Stake'}
                    </p>
                  </div>

                  <div className="text-center">
                    <p className="text-sm text-white font-medium">{t.submissionCount}</p>
                    <p className="text-xs text-gray-500">Submissions</p>
                  </div>

                  <span className={`px-3 py-1 rounded-full text-xs border ${TaskStatusColors[t.config.status]}`}>
                    {TaskStatusLabels[t.config.status]}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
