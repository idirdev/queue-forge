# ⚙️ Queue Forge

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

An in-memory job queue processor with priorities, retries, concurrency control, event-driven architecture, delayed jobs, recurring schedules, and progress tracking.

## Features

- **Priority Queue** — Binary max-heap for efficient priority-based processing
- **FIFO Queue** — Simple first-in-first-out processing
- **Retries with Backoff** — Exponential, linear, or fixed backoff strategies
- **Concurrency Control** — Process multiple jobs in parallel with configurable limits
- **Event System** — Listen for added, active, completed, failed, stalled, progress, drained events
- **Delayed Jobs** — Schedule jobs to run after a specified delay
- **Recurring Jobs** — Register jobs that run on an interval
- **Progress Tracking** — Report and monitor job progress (0-100%)
- **Type-Safe** — Full TypeScript generics for job data and results
- **Zero External Dependencies** — Only uses `uuid` for job IDs

## Installation

```bash
npm install queue-forge
```

## Quick Start

```typescript
import { Queue } from 'queue-forge';

const queue = new Queue<{ email: string }, { sent: boolean }>({
  name: 'email-queue',
  concurrency: 5,
  strategy: 'priority',
});

// Register the processor
queue.process(async (data, jobId, reportProgress) => {
  reportProgress(50);
  await sendEmail(data.email);
  reportProgress(100);
  return { sent: true };
});

// Add jobs
queue.add({ email: 'user@example.com' }, { priority: 10 });
queue.add({ email: 'vip@example.com' }, { priority: 100 });
```

## API Reference

### `Queue<T, R>`

| Method | Description |
|--------|-------------|
| `process(handler)` | Register the job processing function |
| `add(data, options?)` | Add a new job to the queue |
| `addBulk(items)` | Add multiple jobs at once |
| `pause()` | Pause processing |
| `resume()` | Resume processing |
| `getJob(jobId)` | Get job info by ID |
| `getJobs(status)` | Get all jobs by status |
| `getStats()` | Get queue statistics |
| `addRecurring(name, data, interval, options?)` | Register a recurring job |
| `removeRecurring(name)` | Remove a recurring job |
| `clean(status?)` | Clear completed/failed job records |
| `on(event, listener)` | Listen for queue events |
| `destroy()` | Stop processing and clean up |

### `JobOptions`

```typescript
{
  priority: number;      // Higher = processed first (default: 0)
  maxRetries: number;    // Retry attempts on failure (default: 3)
  delay: number;         // Delay in ms before processing (default: 0)
  timeout: number;       // Max execution time in ms (default: 0 = none)
  removeOnComplete: boolean;  // Auto-remove after success
  removeOnFail: boolean;      // Auto-remove after final failure
  backoff: {
    type: 'fixed' | 'exponential' | 'linear';
    delay: number;       // Base delay in ms
    maxDelay: number;    // Maximum delay cap
  };
  group?: string;        // Optional job group/tag
}
```

### Events

| Event | Description |
|-------|-------------|
| `added` | Job added to queue |
| `active` | Job started processing |
| `completed` | Job completed successfully |
| `failed` | Job processing failed |
| `retrying` | Job scheduled for retry |
| `progress` | Job progress updated |
| `delayed` | Job is delayed |
| `paused` | Queue paused |
| `resumed` | Queue resumed |
| `drained` | All jobs processed |
| `error` | Queue error |

## Priority Queue

Jobs with higher priority values are processed first. Equal priorities are broken by insertion order (FIFO).

```typescript
queue.add(data, { priority: 1 });    // Low
queue.add(data, { priority: 10 });   // Normal
queue.add(data, { priority: 100 });  // High (processed first)
```

## Retry Strategies

```typescript
// Exponential backoff: 1s, 2s, 4s, 8s, ...
queue.add(data, {
  maxRetries: 5,
  backoff: { type: 'exponential', delay: 1000, maxDelay: 60000 },
});

// Fixed delay: 5s, 5s, 5s, ...
queue.add(data, {
  maxRetries: 3,
  backoff: { type: 'fixed', delay: 5000, maxDelay: 5000 },
});

// Linear: 1s, 2s, 3s, 4s, ...
queue.add(data, {
  maxRetries: 4,
  backoff: { type: 'linear', delay: 1000, maxDelay: 30000 },
});
```

## Delayed Jobs

```typescript
// Process after 30 seconds
queue.add(data, { delay: 30_000 });
```

## Recurring Jobs

```typescript
// Run every 5 minutes
queue.addRecurring('cleanup', { task: 'cleanup' }, 5 * 60 * 1000);

// With a data factory
queue.addRecurring('health-check', () => ({
  timestamp: Date.now(),
}), 60_000);
```

## Examples

```bash
npx ts-node examples/basic.ts
npx ts-node examples/priority.ts
```

## License

MIT
