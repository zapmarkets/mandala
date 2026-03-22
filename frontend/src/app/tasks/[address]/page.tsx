'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getTask, truncateAddress, formatEth } from '@/lib/contracts';
import { TaskConfig, Submission, TaskStatus, TaskStatusLabels, TaskStatusColors } from '@/lib/types';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

export default function TaskDetailPage() {
  const params = useParams();
  const address = params.address as string;

  const [config, setConfig] = useState<TaskConfig | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pendingWinner, setPendingWinner] = useState('');
  const [disputant, setDisputant] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const task = getTask(address);
        const [cfg, subs, winner, disp] = await Promise.all([
          task.getConfig(),
          task.getSubmissions(),
          task.pendingWinner(),
          task.disputant(),
        ]);

        setConfig({
          coordinator: cfg.coordinator,
          verifier: cfg.verifier,
          token: cfg.token,
          reward: cfg.reward,
          stakeRequired: cfg.stakeRequired,
          deadline: cfg.deadline,
          disputeWindow: cfg.disputeWindow,
          criteriaHash: cfg.criteriaHash,
          criteriaURI: cfg.criteriaURI,
          humanGateEnabled: cfg.humanGateEnabled,
          status: Number(cfg.status) as TaskStatus,
        });

        setSubmissions(
          subs.map((s: Submission) => ({
            agent: s.agent,
            proofHash: s.proofHash,
            evidenceURI: s.evidenceURI,
            submittedAt: s.submittedAt,
            stake: s.stake,
            disqualified: s.disqualified,
          }))
        );

        setPendingWinner(winner);
        setDisputant(disp);

        if (disp !== ZERO_ADDR) {
          const reason = await task.disputeReason();
          setDisputeReason(reason);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError('Failed to load task: ' + msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [address]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-cyan-400 text-lg animate-pulse">Loading task...</div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
        <p className="text-red-400">{error || 'Task not found'}</p>
        <Link href="/tasks" className="text-cyan-400 text-sm mt-4 inline-block hover:underline">← Back to Tasks</Link>
      </div>
    );
  }

  const statusSteps = [
    { label: 'Open', status: TaskStatus.Open, icon: '◎' },
    { label: 'Verifying', status: TaskStatus.Verifying, icon: '◈' },
    { label: 'Finalized', status: TaskStatus.Finalized, icon: '✓' },
  ];

  const currentStep = config.status === TaskStatus.Cancelled ? -1 :
    config.status === TaskStatus.Disputed ? 1.5 :
    config.status;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/tasks" className="text-cyan-400 text-sm hover:underline mb-2 inline-block">← Back to Tasks</Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Task Detail
            <span className={`px-3 py-1 rounded-full text-xs border ${TaskStatusColors[config.status]}`}>
              {TaskStatusLabels[config.status]}
            </span>
          </h1>
          <p className="font-mono text-sm text-gray-500 mt-1">{address}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wider">Lifecycle</h2>
        <div className="flex items-center justify-between">
          {statusSteps.map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 ${
                  step.status <= currentStep
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400'
                    : 'bg-gray-800 border-gray-700 text-gray-600'
                }`}>
                  {step.icon}
                </div>
                <span className={`text-xs mt-2 ${step.status <= currentStep ? 'text-cyan-400' : 'text-gray-600'}`}>
                  {step.label}
                </span>
              </div>
              {i < statusSteps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 ${
                  step.status < currentStep ? 'bg-cyan-500/40' : 'bg-gray-800'
                }`} />
              )}
            </div>
          ))}
        </div>
        {config.status === TaskStatus.Disputed && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm font-medium">⚠ Task Disputed</p>
            {disputeReason && <p className="text-red-300 text-xs mt-1">Reason: {disputeReason}</p>}
            {disputant !== ZERO_ADDR && <p className="text-gray-500 text-xs mt-1">By: <span className="font-mono">{truncateAddress(disputant)}</span></p>}
          </div>
        )}
      </div>

      {/* Config Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Configuration</h2>
          <InfoRow label="Coordinator" value={truncateAddress(config.coordinator)} mono />
          <InfoRow label="Verifier" value={truncateAddress(config.verifier)} mono />
          <InfoRow label="Token" value={config.token === ZERO_ADDR ? 'ETH (Native)' : truncateAddress(config.token)} mono={config.token !== ZERO_ADDR} />
          <InfoRow label="Reward" value={`${formatEth(config.reward)} ETH`} />
          <InfoRow label="Stake Required" value={`${formatEth(config.stakeRequired)} ETH`} />
        </div>
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Parameters</h2>
          <InfoRow label="Deadline" value={new Date(Number(config.deadline) * 1000).toLocaleString()} />
          <InfoRow label="Dispute Window" value={`${Number(config.disputeWindow)}s`} />
          <InfoRow label="Criteria Hash" value={config.criteriaHash.slice(0, 18) + '...'} mono />
          <InfoRow label="Criteria URI" value={config.criteriaURI || 'N/A'} />
          <InfoRow label="Human Gate" value={config.humanGateEnabled ? 'Enabled' : 'Disabled'} />
          {pendingWinner !== ZERO_ADDR && (
            <InfoRow label="Pending Winner" value={truncateAddress(pendingWinner)} mono />
          )}
        </div>
      </div>

      {/* Submissions */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Submissions ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <p className="text-gray-600 text-sm py-4 text-center">No submissions yet</p>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border ${
                  sub.agent === pendingWinner
                    ? 'bg-emerald-500/5 border-emerald-500/30'
                    : sub.disqualified
                    ? 'bg-red-500/5 border-red-500/30'
                    : 'bg-gray-800/30 border-gray-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-cyan-400">{truncateAddress(sub.agent)}</span>
                    {sub.agent === pendingWinner && (
                      <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Winner</span>
                    )}
                    {sub.disqualified && (
                      <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">Disqualified</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">Stake: {formatEth(sub.stake)} ETH</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Proof: </span>
                    <span className="font-mono text-gray-400">{sub.proofHash.slice(0, 22)}...</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Evidence: </span>
                    <span className="text-gray-400">{sub.evidenceURI || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm text-gray-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
