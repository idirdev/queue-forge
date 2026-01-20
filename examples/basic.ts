/**
 * Queue Forge - Basic Usage Example
 *
 * Demonstrates: job creation, processing, retries, events, and statistics.
 *
 * Run with: npx ts-node examples/basic.ts
 */

import { Queue } from '../src/queue';

// Define the job data type
interface EmailJob {
  to: string;
  subject: string;
  body: string;
}

// Create a FIFO queue with concurrency of 2
const emailQueue = new Queue<EmailJob, { sent: boolean }>({
  name: 'email-queue',
  concurrency: 2,
  strategy: 'fifo',
  defaultJobOptions: {
    maxRetries: 2,
    timeout: 5000,
  },
});

// ─── Event Listeners ────────────────────────────────────────────────────────

emailQueue.on('added', (event) => {
  console.log(`[ADDED] Job ${event.jobId} added to queue`);
});

emailQueue.on('active', (event) => {
  console.log(`[ACTIVE] Job ${event.jobId} started processing (attempt ${(event.data as any)?.attempt})`);
});

emailQueue.on('completed', (event) => {
  const data = event.data as { result: unknown; duration: number };
  console.log(`[COMPLETED] Job ${event.jobId} completed in ${data.duration}ms`);
});

emailQueue.on('failed', (event) => {
  console.log(`[FAILED] Job ${event.jobId}: ${event.error?.message}`);
});

emailQueue.on('retrying', (event) => {
  const data = event.data as { attempt: number; maxRetries: number; nextRetryIn: number };
  console.log(
    `[RETRYING] Job ${event.jobId} will retry in ${data.nextRetryIn}ms ` +
    `(attempt ${data.attempt}/${data.maxRetries})`
  );
});

emailQueue.on('drained', () => {
  console.log('[DRAINED] All jobs have been processed!\n');
  console.log('Final Stats:', emailQueue.getStats());
  emailQueue.destroy();
});

// ─── Register Processor ─────────────────────────────────────────────────────

let callCount = 0;

emailQueue.process(async (data, jobId, reportProgress) => {
  callCount++;

  console.log(`  Processing email to ${data.to}: "${data.subject}"`);

  // Simulate some work
  reportProgress(25);
  await new Promise((resolve) => setTimeout(resolve, 100));

  reportProgress(50);
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Simulate an occasional failure (first call fails)
  if (callCount === 2) {
    throw new Error('SMTP connection timeout');
  }

  reportProgress(75);
  await new Promise((resolve) => setTimeout(resolve, 100));

  reportProgress(100);

  return { sent: true };
});

// ─── Add Jobs ───────────────────────────────────────────────────────────────

console.log('=== Queue Forge: Basic Example ===\n');

emailQueue.add({
  to: 'alice@example.com',
  subject: 'Welcome!',
  body: 'Welcome to our platform.',
});

emailQueue.add({
  to: 'bob@example.com',
  subject: 'Your order shipped',
  body: 'Your order #1234 has shipped.',
});

emailQueue.add(
  {
    to: 'charlie@example.com',
    subject: 'Password reset',
    body: 'Click here to reset your password.',
  },
  { delay: 500 } // Delayed by 500ms
);

console.log('Stats after adding:', emailQueue.getStats());
