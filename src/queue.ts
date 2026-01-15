import { Job } from './job';
import { Worker } from './worker';
import { Scheduler } from './scheduler';
import { QueueEventEmitter } from './events';
import { FIFOStrategy } from './strategies/fifo';
import { PriorityStrategy } from './strategies/priority';
import {
  QueueOptions,
  QueueStats,
  JobOptions,
  JobHandler,
  JobInfo,
  QueueEventType,
  QueueEvent,
} from './types/index';

/**
 * Default queue options.
 */
const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  name: 'default',
  concurrency: 1,
  defaultJobOptions: {},
  strategy: 'fifo',
  stallInterval: 30_000,
  stallTimeout: 60_000,
};

/**
 * Queue class - the main API for the job queue system.
 *
 * Manages job lifecycle: add -> process -> complete/fail/retry.
 * Supports priorities, retries, delayed jobs, concurrency control,
 * event emission, and statistics tracking.
 */
export class Queue<T = unknown, R = unknown> {
  private options: QueueOptions;
  private strategy: FIFOStrategy<T> | PriorityStrategy<T>;
  private worker: Worker<T, R>;
  private scheduler: Scheduler<T>;
  private events: QueueEventEmitter;

  private completedJobs: Map<string, Job<T>> = new Map();
  private failedJobs: Map<string, Job<T>> = new Map();
  private paused: boolean = false;
  private totalProcessed: number = 0;

  constructor(options: Partial<QueueOptions> = {}) {
    this.options = { ...DEFAULT_QUEUE_OPTIONS, ...options };
    this.events = new QueueEventEmitter();

    // Initialize the processing strategy
    this.strategy = this.options.strategy === 'priority'
      ? new PriorityStrategy<T>()
      : new FIFOStrategy<T>();

    // Initialize the worker
    this.worker = new Worker<T, R>(this.events, {
      concurrency: this.options.concurrency,
    });

    // Wire up the worker's job source and callbacks
    this.worker.setJobSource(() => this.getNextJob());
    this.worker.setCallbacks(
      (job) => this.handleJobCompleted(job),
      (job, error) => this.handleJobFailed(job, error)
    );

    // Initialize the scheduler
    this.scheduler = new Scheduler<T>();
    this.scheduler.setReadyCallback((job) => {
      this.strategy.reinsert(job);
    });
    this.scheduler.start();
  }

  /**
   * Register the processing function for jobs in this queue.
   * The worker will begin processing as soon as a handler is registered.
   *
   * @param handler - Async function that processes a job's data
   */
  process(handler: JobHandler<T, R>): void {
    this.worker.setHandler(handler);
    if (!this.paused) {
      this.worker.start();
    }
  }

  /**
   * Add a new job to the queue.
   *
   * @param data - The job data payload
   * @param options - Optional job configuration
   * @returns The created Job instance
   */
  add(data: T, options: Partial<JobOptions> = {}): Job<T> {
    const mergedOptions = { ...this.options.defaultJobOptions, ...options };
    const job = new Job<T>(data, mergedOptions);

    if (job.status === 'delayed') {
      this.scheduler.scheduleDelayed(job);
      this.events.emit('delayed', job.id, { delay: job.options.delay });
    } else {
      this.strategy.add(job);
    }

    this.events.emit('added', job.id, { priority: job.priority });
    return job;
  }

  /**
   * Add multiple jobs to the queue at once.
   */
  addBulk(
    items: Array<{ data: T; options?: Partial<JobOptions> }>
  ): Job<T>[] {
    return items.map((item) => this.add(item.data, item.options || {}));
  }

  /**
   * Pause the queue. No new jobs will be processed until resumed.
   */
  pause(): void {
    this.paused = true;
    this.worker.stop();
    this.events.emit('paused');
  }

  /**
   * Resume the queue after pausing.
   */
  resume(): void {
    this.paused = false;
    this.worker.start();
    this.events.emit('resumed');
  }

  /**
   * Get a job by ID from any state (waiting, completed, failed).
   */
  getJob(jobId: string): JobInfo<T> | undefined {
    // Check active queue
    const queuedJob = this.strategy.getById(jobId);
    if (queuedJob) return queuedJob.toJSON();

    // Check completed
    const completed = this.completedJobs.get(jobId);
    if (completed) return completed.toJSON();

    // Check failed
    const failed = this.failedJobs.get(jobId);
    if (failed) return failed.toJSON();

    return undefined;
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    const workerStats = this.worker.getStats();
    return {
      name: this.options.name,
      waiting: this.strategy.getAll('waiting').length + this.strategy.getAll('delayed').length,
      active: workerStats.active,
      completed: this.completedJobs.size,
      failed: this.failedJobs.size,
      delayed: this.scheduler.delayedCount(),
      paused: this.paused,
      processed: this.totalProcessed,
      averageProcessingTime: workerStats.averageProcessingTime,
    };
  }

  /**
   * Listen for queue events.
   */
  on(event: QueueEventType | '*', listener: (event: QueueEvent) => void): this {
    this.events.on(event, listener);
    return this;
  }

  /**
   * Listen for a single occurrence of a queue event.
   */
  once(event: QueueEventType | '*', listener: (event: QueueEvent) => void): this {
    this.events.once(event, listener);
    return this;
  }

  /**
   * Remove an event listener.
   */
  off(event: QueueEventType | '*', listener: (event: QueueEvent) => void): this {
    this.events.off(event, listener);
    return this;
  }

  /**
   * Register a recurring job.
   */
  addRecurring(
    name: string,
    data: T | (() => T),
    intervalMs: number,
    options: Partial<JobOptions> = {}
  ): void {
    this.scheduler.addRecurring(name, data, intervalMs, options);
  }

  /**
   * Remove a recurring job.
   */
  removeRecurring(name: string): boolean {
    return this.scheduler.removeRecurring(name);
  }

  /**
   * Get all jobs of a certain status.
   */
  getJobs(status: 'waiting' | 'completed' | 'failed'): JobInfo<T>[] {
    switch (status) {
      case 'waiting':
        return this.strategy.getAll('waiting').map((j) => j.toJSON());
      case 'completed':
        return Array.from(this.completedJobs.values()).map((j) => j.toJSON());
      case 'failed':
        return Array.from(this.failedJobs.values()).map((j) => j.toJSON());
      default:
        return [];
    }
  }

  /**
   * Clear completed and/or failed job records.
   */
  clean(status: 'completed' | 'failed' | 'all' = 'all'): number {
    let cleaned = 0;
    if (status === 'completed' || status === 'all') {
      cleaned += this.completedJobs.size;
      this.completedJobs.clear();
    }
    if (status === 'failed' || status === 'all') {
      cleaned += this.failedJobs.size;
      this.failedJobs.clear();
    }
    return cleaned;
  }

  /**
   * Destroy the queue: stop processing, clear all state.
   */
  destroy(): void {
    this.worker.destroy();
    this.scheduler.destroy();
    this.events.destroy();
    this.strategy.clear();
    this.completedJobs.clear();
    this.failedJobs.clear();
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  /**
   * Get the next available job from the strategy.
   * Called by the worker when it needs a new job.
   */
  private getNextJob(): Job<T> | undefined {
    if (this.paused) return undefined;

    const job = this.strategy.getNext();
    if (job) {
      this.strategy.remove(job.id);
    }
    return job;
  }

  /**
   * Handle a successfully completed job.
   */
  private handleJobCompleted(job: Job<T>): void {
    this.totalProcessed++;

    if (!job.options.removeOnComplete) {
      this.completedJobs.set(job.id, job);
    }

    // Check if queue is drained (no more waiting jobs)
    if (
      this.strategy.size() === 0 &&
      this.worker.activeCount === 0 &&
      this.scheduler.delayedCount() === 0
    ) {
      this.events.emit('drained');
    }
  }

  /**
   * Handle a failed job: retry or mark as permanently failed.
   */
  private handleJobFailed(job: Job<T>, error: Error): void {
    if (job.canRetry) {
      const delay = this.scheduler.scheduleRetry(job);
      this.events.emit('retrying', job.id, {
        attempt: job.attempts,
        maxRetries: job.maxRetries,
        nextRetryIn: delay,
      });
    } else {
      // All retries exhausted
      this.totalProcessed++;

      if (!job.options.removeOnFail) {
        this.failedJobs.set(job.id, job);
      }
    }
  }
}
