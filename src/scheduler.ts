import { Job } from './job';
import { JobOptions } from './types/index';
import { calculateBackoff } from './utils/backoff';

/**
 * Job scheduler that manages delayed jobs, retry scheduling, and
 * simple cron-like recurring job patterns.
 *
 * The scheduler periodically checks for delayed jobs that have become
 * available and promotes them to waiting status.
 */
export class Scheduler<T = unknown> {
  private delayedJobs: Map<string, Job<T>> = new Map();
  private recurringJobs: Map<string, RecurringConfig<T>> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private onJobReady: ((job: Job<T>) => void) | null = null;

  /**
   * Set the callback invoked when a delayed job becomes ready.
   */
  setReadyCallback(callback: (job: Job<T>) => void): void {
    this.onJobReady = callback;
  }

  /**
   * Start the scheduler's periodic check loop.
   *
   * @param intervalMs - How often to check for ready jobs (default: 1000ms)
   */
  start(intervalMs: number = 1000): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkDelayed();
      this.checkRecurring();
    }, intervalMs);

    if (this.checkInterval && typeof this.checkInterval === 'object' && 'unref' in this.checkInterval) {
      this.checkInterval.unref();
    }
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Schedule a job to be processed after a delay.
   */
  scheduleDelayed(job: Job<T>): void {
    this.delayedJobs.set(job.id, job);
  }

  /**
   * Schedule a retry for a failed job using the configured backoff strategy.
   *
   * @param job - The failed job to retry
   * @returns The delay in milliseconds before the retry
   */
  scheduleRetry(job: Job<T>): number {
    const backoffDelay = calculateBackoff(job.attempts, job.options.backoff);
    const nextAvailableAt = new Date(Date.now() + backoffDelay);

    job.markRetrying(nextAvailableAt);
    this.delayedJobs.set(job.id, job);

    return backoffDelay;
  }

  /**
   * Register a recurring job that will be created on a simple interval.
   *
   * @param name - Unique name for the recurring job
   * @param data - Job data factory or static data
   * @param intervalMs - Interval between job creations
   * @param options - Job options for each created job
   */
  addRecurring(
    name: string,
    data: T | (() => T),
    intervalMs: number,
    options: Partial<JobOptions> = {}
  ): void {
    this.recurringJobs.set(name, {
      name,
      data,
      intervalMs,
      options,
      lastRun: 0,
    });
  }

  /**
   * Remove a recurring job schedule.
   */
  removeRecurring(name: string): boolean {
    return this.recurringJobs.delete(name);
  }

  /**
   * List all registered recurring jobs.
   */
  listRecurring(): Array<{ name: string; intervalMs: number; lastRun: number }> {
    const result: Array<{ name: string; intervalMs: number; lastRun: number }> = [];
    for (const [, config] of this.recurringJobs) {
      result.push({
        name: config.name,
        intervalMs: config.intervalMs,
        lastRun: config.lastRun,
      });
    }
    return result;
  }

  /**
   * Check delayed jobs and promote any that have become available.
   */
  private checkDelayed(): void {
    const now = Date.now();
    const readyJobIds: string[] = [];

    for (const [id, job] of this.delayedJobs) {
      if (now >= job.availableAt.getTime()) {
        job.markWaiting();
        readyJobIds.push(id);

        if (this.onJobReady) {
          this.onJobReady(job);
        }
      }
    }

    // Remove promoted jobs from the delayed map
    for (const id of readyJobIds) {
      this.delayedJobs.delete(id);
    }
  }

  /**
   * Check recurring jobs and create new instances when due.
   */
  private checkRecurring(): void {
    const now = Date.now();

    for (const [, config] of this.recurringJobs) {
      if (now - config.lastRun >= config.intervalMs) {
        config.lastRun = now;

        const data = typeof config.data === 'function'
          ? (config.data as () => T)()
          : config.data;

        const job = new Job<T>(data, {
          ...config.options,
          group: config.name,
        });

        if (this.onJobReady) {
          this.onJobReady(job);
        }
      }
    }
  }

  /**
   * Get the count of currently delayed jobs.
   */
  delayedCount(): number {
    return this.delayedJobs.size;
  }

  /**
   * Cancel a delayed job.
   */
  cancelDelayed(jobId: string): boolean {
    return this.delayedJobs.delete(jobId);
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.delayedJobs.clear();
    this.recurringJobs.clear();
  }

  /**
   * Destroy the scheduler.
   */
  destroy(): void {
    this.stop();
    this.clear();
    this.onJobReady = null;
  }
}

/**
 * Internal configuration for a recurring job.
 */
interface RecurringConfig<T> {
  name: string;
  data: T | (() => T);
  intervalMs: number;
  options: Partial<JobOptions>;
  lastRun: number;
}
