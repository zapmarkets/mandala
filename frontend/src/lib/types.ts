export enum TaskStatus {
  Open = 0,
  Verifying = 1,
  Disputed = 2,
  Finalized = 3,
  Cancelled = 4,
}

export const TaskStatusLabels: Record<TaskStatus, string> = {
  [TaskStatus.Open]: 'Open',
  [TaskStatus.Verifying]: 'Verifying',
  [TaskStatus.Disputed]: 'Disputed',
  [TaskStatus.Finalized]: 'Finalized',
  [TaskStatus.Cancelled]: 'Cancelled',
};

export const TaskStatusColors: Record<TaskStatus, string> = {
  [TaskStatus.Open]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [TaskStatus.Verifying]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  [TaskStatus.Disputed]: 'bg-red-500/20 text-red-400 border-red-500/30',
  [TaskStatus.Finalized]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  [TaskStatus.Cancelled]: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export interface AgentInfo {
  agentAddress: string;
  erc8004Id: string;
  metadataURI: string;
  totalTasks: bigint;
  wins: bigint;
  disputes: bigint;
  suspended: boolean;
  registeredAt: bigint;
}

export interface TaskConfig {
  coordinator: string;
  verifier: string;
  token: string;
  reward: bigint;
  stakeRequired: bigint;
  deadline: bigint;
  disputeWindow: bigint;
  criteriaHash: string;
  criteriaURI: string;
  humanGateEnabled: boolean;
  status: TaskStatus;
}

export interface Submission {
  agent: string;
  proofHash: string;
  evidenceURI: string;
  submittedAt: bigint;
  stake: bigint;
  disqualified: boolean;
}

export interface LogEntry {
  step: number;
  action: string;
  detail: string;
  status: 'pending' | 'running' | 'success' | 'error';
  txHash?: string;
}
