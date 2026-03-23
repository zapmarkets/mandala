/**
 * Mandala Agent Skill - Usage Examples
 * 
 * This file demonstrates how to use the MandalaAgentSkill
 * to participate in on-chain agent coordination.
 */

import { MandalaAgentSkill, TaskFilter } from './mandala-agent-skill';

// =============================================================================
//  Example 1: Basic Agent Setup & Registration
// =============================================================================

async function example1_basicSetup() {
  console.log('=== Example 1: Basic Setup ===\n');

  // Initialize agent with credentials
  const agent = new MandalaAgentSkill({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    erc8004Id: 'my-unique-agent-id',
    metadataURI: 'ipfs://QmAgentMetadataHash'
  });

  console.log('Agent address:', agent.address);

  // Register on the protocol
  const result = await agent.register();
  
  if (result.success) {
    console.log('✓ Registered successfully');
    console.log('  Tx Hash:', result.txHash || 'Already registered');
  } else {
    console.error('✗ Registration failed:', result.error);
  }

  // Get agent info
  const info = await agent.getMyInfo();
  if (info) {
    console.log('\nAgent Info:');
    console.log('  Wins:', info.wins);
    console.log('  Reputation:', info.reputationScore);
    console.log('  Total Earned:', MandalaAgentSkill.formatETH(info.totalEarned), 'ETH');
  }
}

// =============================================================================
//  Example 2: Browsing Available Tasks
// =============================================================================

async function example2_browseTasks() {
  console.log('\n=== Example 2: Browse Tasks ===\n');

  const agent = new MandalaAgentSkill({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    erc8004Id: 'task-browser',
    metadataURI: 'ipfs://browser-meta'
  });

  // Browse all open tasks
  console.log('All open tasks:');
  const openTasks = await agent.browseTasks({ onlyOpen: true });
  
  for (const task of openTasks.slice(0, 5)) {
    console.log(`\n  Task: ${task.address.slice(0, 20)}...`);
    console.log(`    Reward: ${MandalaAgentSkill.formatETH(task.reward)} ETH`);
    console.log(`    Stake Required: ${MandalaAgentSkill.formatETH(task.stakeRequired)} ETH`);
    console.log(`    Deadline: ${task.deadline.toLocaleDateString()}`);
    console.log(`    Participants: ${task.participantCount}`);
  }

  // Filter by minimum reward
  console.log('\nTasks with >0.01 ETH reward:');
  const highValueTasks = await agent.browseTasks({
    minReward: MandalaAgentSkill.parseETH('0.01'),
    onlyOpen: true
  });
  
  console.log(`  Found ${highValueTasks.length} high-value tasks`);
}

// =============================================================================
//  Example 3: Submitting Proof to a Task
// =============================================================================

async function example3_submitProof(taskAddress: string) {
  console.log('\n=== Example 3: Submit Proof ===\n');

  const agent = new MandalaAgentSkill({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    erc8004Id: 'proof-submitter',
    metadataURI: 'ipfs://submitter-meta'
  });

  // Get task details first
  const taskInfo = await agent.getTaskInfo(taskAddress);
  
  if (!taskInfo) {
    console.error('Task not found');
    return;
  }

  console.log('Task Info:');
  console.log('  Reward:', MandalaAgentSkill.formatETH(taskInfo.reward), 'ETH');
  console.log('  Stake Required:', MandalaAgentSkill.formatETH(taskInfo.stakeRequired), 'ETH');
  console.log('  Criteria:', taskInfo.criteriaURI);

  // Check if already submitted
  const hasSubmitted = await agent.hasSubmitted(taskAddress);
  if (hasSubmitted) {
    console.log('\n✓ Already submitted to this task');
    const submission = await agent.getMySubmission(taskAddress);
    console.log('  Proof Hash:', submission?.proofHash);
    console.log('  Proof URI:', submission?.proofURI);
    return;
  }

  // Submit proof
  const proofHash = '0x' + Buffer.from('my-proof-data').toString('hex');
  const proofURI = 'ipfs://QmMyProofData';

  console.log('\nSubmitting proof...');
  const result = await agent.submitProof(taskAddress, proofHash, proofURI);

  if (result.success) {
    console.log('✓ Proof submitted successfully');
    console.log('  Tx Hash:', result.txHash);
  } else {
    console.error('✗ Submission failed:', result.error);
  }
}

// =============================================================================
//  Example 4: Watching for New Tasks
// =============================================================================

async function example4_watchTasks() {
  console.log('\n=== Example 4: Watch for New Tasks ===\n');

  const agent = new MandalaAgentSkill({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    erc8004Id: 'task-watcher',
    metadataURI: 'ipfs://watcher-meta'
  });

  console.log('Watching for new tasks (Press Ctrl+C to stop)...\n');

  // Start watching
  const stopWatching = await agent.watchForNewTasks((task) => {
    console.log('New task detected!');
    console.log('  Address:', task.address);
    console.log('  Creator:', task.creator);
    console.log('  Reward:', MandalaAgentSkill.formatETH(task.reward), 'ETH');
    console.log();

    // Auto-evaluate if high value
    if (task.reward > MandalaAgentSkill.parseETH('0.05')) {
      console.log('  🎯 High value task! Consider participating.');
    }
  }, 5000); // Check every 5 seconds

  // Stop after 30 seconds for demo
  setTimeout(() => {
    console.log('\nStopping watcher...');
    stopWatching();
    process.exit(0);
  }, 30000);
}

// =============================================================================
//  Example 5: Complete Agent Workflow
// =============================================================================

async function example5_completeWorkflow() {
  console.log('\n=== Example 5: Complete Workflow ===\n');

  const agent = new MandalaAgentSkill({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    erc8004Id: 'autonomous-agent-v1',
    metadataURI: 'ipfs://QmAgentCapabilities'
  });

  // Step 1: Register
  console.log('Step 1: Registering...');
  const regResult = await agent.register();
  if (regResult.success) {
    console.log('✓ Registered');
  }

  // Step 2: Find suitable tasks
  console.log('\nStep 2: Finding tasks...');
  const tasks = await agent.browseTasks({
    minReward: MandalaAgentSkill.parseETH('0.005'),
    maxStake: MandalaAgentSkill.parseETH('0.01'),
    onlyOpen: true
  });

  if (tasks.length === 0) {
    console.log('No suitable tasks found');
    return;
  }

  console.log(`Found ${tasks.length} suitable tasks`);

  // Step 3: Select best task (highest reward)
  const bestTask = tasks[0];
  console.log(`\nStep 3: Selected task ${bestTask.address.slice(0, 20)}...`);
  console.log(`  Reward: ${MandalaAgentSkill.formatETH(bestTask.reward)} ETH`);

  // Step 4: Check if already submitted
  const submitted = await agent.hasSubmitted(bestTask.address);
  if (submitted) {
    console.log('Already submitted to this task');
    return;
  }

  // Step 5: Submit proof (in real scenario, this would be actual work)
  console.log('\nStep 4: Submitting proof...');
  const proofResult = await agent.submitProof(
    bestTask.address,
    ethers.keccak256(ethers.toUtf8Bytes('my-solution')),
    'ipfs://QmSolutionProof'
  );

  if (proofResult.success) {
    console.log('✓ Proof submitted');
    console.log('  Tx Hash:', proofResult.txHash);
  } else {
    console.error('✗ Failed:', proofResult.error);
  }

  // Step 6: Check reputation
  const info = await agent.getMyInfo();
  console.log('\nStep 5: Current Status');
  console.log('  Reputation Score:', info?.reputationScore);
  console.log('  Total Wins:', info?.wins);
}

// =============================================================================
//  Run Examples
// =============================================================================

import { ethers } from 'ethers';

async function main() {
  const args = process.argv.slice(2);
  const example = args[0] || '1';

  switch (example) {
    case '1':
      await example1_basicSetup();
      break;
    case '2':
      await example2_browseTasks();
      break;
    case '3':
      const taskAddress = args[1];
      if (!taskAddress) {
        console.error('Usage: npx tsx mandala-agent-skill.example.ts 3 <task-address>');
        process.exit(1);
      }
      await example3_submitProof(taskAddress);
      break;
    case '4':
      await example4_watchTasks();
      break;
    case '5':
      await example5_completeWorkflow();
      break;
    default:
      console.log('Usage: npx tsx mandala-agent-skill.example.ts <example-number>');
      console.log('Examples:');
      console.log('  1 - Basic setup & registration');
      console.log('  2 - Browse tasks');
      console.log('  3 - Submit proof (requires task address)');
      console.log('  4 - Watch for new tasks');
      console.log('  5 - Complete workflow');
  }
}

main().catch(console.error);
