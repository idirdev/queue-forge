/**
 * Queue Forge - Priority Queue Example
 *
 * Demonstrates: priority-based processing, progress tracking,
 * different priority levels, and bulk job insertion.
 *
 * Run with: npx ts-node examples/priority.ts
 */

import { Queue } from '../src/queue';

// Define the job data type
interface TaskJob {
  name: string;
  complexity: number; // 1-10, affects processing time
}

// Create a priority queue with concurrency of 1
// (so we can clearly see the processing order)
const taskQueue = new Queue<TaskJob, { name: string; time: number }>({
  name: 'task-queue',
  concurrency: 1,
  strategy: 'priority',
  defaultJobOptions: {
    maxRetries: 1,
  },
});

// Track processing order
const processingOrder: string[] = [];

// ─── Event Listeners ────────────────────────────────────────────────────────

taskQueue.on('completed', (event) => {
  const result = (event.data as any)?.result as { name: string; time: number };
  if (result) {
    processingOrder.push(result.name);
    console.log(
      `  [DONE] ${result.name} completed in ${result.time}ms ` +
      `(order: ${processingOrder.length})`
    );
  }
});

taskQueue.on('drained', () => {
  console.log('\n=== Processing Complete ===');
  console.log('Processing order:', processingOrder.join(' -> '));
  console.log('Expected: CRITICAL tasks first, then HIGH, NORMAL, LOW');
  console.log('\nFinal Stats:', taskQueue.getStats());

  taskQueue.destroy();
});

// ─── Register Processor ─────────────────────────────────────────────────────

taskQueue.process(async (data, _jobId, reportProgress) => {
  const processingTime = data.complexity * 20; // 20-200ms based on complexity

  // Simulate work in 4 stages
  for (let i = 1; i <= 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, processingTime / 4));
    reportProgress(i * 25);
  }

  return { name: data.name, time: processingTime };
});

// ─── Add Jobs with Different Priorities ─────────────────────────────────────

console.log('=== Queue Forge: Priority Queue Example ===\n');
console.log('Adding tasks with different priorities...\n');

// Add in mixed order - they should be processed by priority
const jobs = [
  { data: { name: 'Cleanup logs', complexity: 2 }, options: { priority: 1 } },
  { data: { name: 'Send newsletter', complexity: 5 }, options: { priority: 5 } },
  { data: { name: 'Process payment', complexity: 3 }, options: { priority: 100 } },
  { data: { name: 'Generate report', complexity: 7 }, options: { priority: 5 } },
  { data: { name: 'Security scan', complexity: 8 }, options: { priority: 50 } },
  { data: { name: 'Update cache', complexity: 1 }, options: { priority: 1 } },
  { data: { name: 'Alert admin', complexity: 2 }, options: { priority: 100 } },
  { data: { name: 'Resize images', complexity: 6 }, options: { priority: 10 } },
  { data: { name: 'Sync database', complexity: 9 }, options: { priority: 50 } },
  { data: { name: 'Archive old data', complexity: 4 }, options: { priority: 1 } },
];

// Use bulk add
const createdJobs = taskQueue.addBulk(jobs);

console.log(`Added ${createdJobs.length} tasks:\n`);
for (const job of createdJobs) {
  const info = taskQueue.getJob(job.id);
  if (info) {
    console.log(
      `  Priority ${String(info.priority).padStart(3)}: ${(info.data as TaskJob).name}`
    );
  }
}

console.log('\nProcessing (highest priority first):\n');
console.log('Stats:', taskQueue.getStats());
