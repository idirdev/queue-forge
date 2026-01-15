/**
 * Queue Forge - In-memory job queue processor
 * with priorities, retries, concurrency control, and event-driven architecture.
 *
 * @example
 * ```ts
 * import { Queue } from 'queue-forge';
 *
 * const queue = new Queue<{ email: string }>({
 *   name: 'email-queue',
 *   concurrency: 5,
 *   strategy: 'priority',
 * });
 *
 * queue.process(async (data, jobId, reportProgress) => {
 *   await sendEmail(data.email);
 *   reportProgress(100);
 *   return { sent: true };
 * });
 *
 * queue.add({ email: 'user@example.com' }, { priority: 10 });
 * ```
 */

import { Queue } from './queue';

/**
 * QueueForge is the main entry point providing factory methods
 * for creating queue instances with common configurations.
 */
export class QueueForge {
  /**
   * Create a simple FIFO queue.
   */
  static createFIFO<T = unknown, R = unknown>(
    name: string,
    concurrency: number = 1
  ): Queue<T, R> {
    return new Queue<T, R>({
      name,
      concurrency,
      strategy: 'fifo',
    });
  }

  /**
   * Create a priority-based queue.
   */
  static createPriority<T = unknown, R = unknown>(
    name: string,
    concurrency: number = 1
  ): Queue<T, R> {
    return new Queue<T, R>({
      name,
      concurrency,
      strategy: 'priority',
    });
  }

  /**
   * Create a queue with full custom options.
   */
  static create<T = unknown, R = unknown>(
    options: {
      name: string;
      concurrency?: number;
      strategy?: 'fifo' | 'priority';
      defaultRetries?: number;
      defaultTimeout?: number;
    }
  ): Queue<T, R> {
    return new Queue<T, R>({
      name: options.name,
      concurrency: options.concurrency || 1,
      strategy: options.strategy || 'fifo',
      defaultJobOptions: {
        maxRetries: options.defaultRetries ?? 3,
        timeout: options.defaultTimeout ?? 0,
      },
    });
  }
}

// Re-export everything for direct imports
export { Queue } from './queue';
export { Job } from './job';
export { Worker } from './worker';
export { Scheduler } from './scheduler';
export { QueueEventEmitter } from './events';
export { FIFOStrategy } from './strategies/fifo';
export { PriorityStrategy } from './strategies/priority';
export { calculateBackoff, getBackoffSchedule, totalBackoffTime, delay } from './utils/backoff';
export type {
  JobStatus,
  JobOptions,
  BackoffOptions,
  QueueOptions,
  WorkerOptions,
  JobHandler,
  QueueEventType,
  QueueEvent,
  QueueStats,
  JobInfo,
} from './types/index';
