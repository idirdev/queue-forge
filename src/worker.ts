import { Job } from './job';
import { JobHandler, WorkerOptions } from './types/index';
import { QueueEventEmitter } from './events';
import { createTimeout } from './utils/backoff';

/**
 * Default worker options.
 */
const DEFAULT_WORKER_OPTIONS: WorkerOptions = {
  concurrency: 1,
  lockDuration: 60_000,
  pollInterval: 1000,
};

/**
 * Worker that processes jobs from the queue with configurable concurrency.
 *
 * The worker polls the queue for available jobs and executes them using
 * the registered handler function. It tracks active jobs and respects
 * the concurrency limit.
 */
export class Worker<T = unknown, R = unknown> {
  private options: WorkerOptions;
  private handler: JobHandler<T, R> | null = null;
  private activeJobs: Map<string, Job<T>> = new Map();
  private events: QueueEventEmitter;
  private running: boolean = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private getNextJob: (() => Job<T> | undefined) | null = null;
  private onJobCompleted: ((job: Job<T>) => void) | null = null;
  private onJobFailed: ((job: Job<T>, error: Error) => void) | null = null;

  /** Total number of jobs processed by this worker. */
  private processedCount: number = 0;
  /** Total processing time in ms across all completed jobs. */
  private totalProcessingTime: number = 0;

  constructor(
    events: QueueEventEmitter,
    options: Partial<WorkerOptions> = {}
  ) {
    this.options = { ...DEFAULT_WORKER_OPTIONS, ...options };
    this.events = events;
  }

  /**
   * Register the job processing handler.
   */
  setHandler(handler: JobHandler<T, R>): void {
    this.handler = handler;
  }

  /**
   * Register the callback to get the next available job.
   */
  setJobSource(getNextJob: () => Job<T> | undefined): void {
    this.getNextJob = getNextJob;
  }

  /**
   * Register callbacks for job completion and failure.
   */
  setCallbacks(
    onCompleted: (job: Job<T>) => void,
    onFailed: (job: Job<T>, error: Error) => void
  ): void {
    this.onJobCompleted = onCompleted;
    this.onJobFailed = onFailed;
  }

  /**
   * Start the worker's processing loop.
   */
  start(): void {
    if (this.running) return;
    if (!this.handler) throw new Error('No job handler registered');
    if (!this.getNextJob) throw new Error('No job source registered');

    this.running = true;

    this.pollTimer = setInterval(() => {
      this.poll();
    }, this.options.pollInterval);

    if (this.pollTimer && typeof this.pollTimer === 'object' && 'unref' in this.pollTimer) {
      this.pollTimer.unref();
    }

    // Immediately poll once
    this.poll();
  }

  /**
   * Stop the worker. Active jobs will finish but no new jobs will be picked up.
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Check if the worker has capacity and pick up new jobs.
   */
  private poll(): void {
    if (!this.running || !this.getNextJob || !this.handler) return;

    while (this.activeJobs.size < this.options.concurrency) {
      const job = this.getNextJob();
      if (!job) break; // No more available jobs

      this.processJob(job);
    }
  }

  /**
   * Process a single job.
   */
  private async processJob(job: Job<T>): Promise<void> {
    if (!this.handler) return;

    // Mark job as active
    job.markActive();
    this.activeJobs.set(job.id, job);
    this.events.emit('active', job.id, { attempt: job.attempts });

    const startTime = Date.now();

    try {
      // Create the progress reporter
      const reportProgress = (progress: number) => {
        job.updateProgress(progress);
        this.events.emit('progress', job.id, { progress });
      };

      // Execute the handler, optionally with a timeout
      let result: R;
      if (job.options.timeout > 0) {
        result = await Promise.race([
          this.handler(job.data, job.id, reportProgress),
          createTimeout(job.options.timeout, job.id),
        ]) as R;
      } else {
        result = await this.handler(job.data, job.id, reportProgress);
      }

      // Job succeeded
      const duration = Date.now() - startTime;
      job.markCompleted(result);
      this.processedCount++;
      this.totalProcessingTime += duration;

      this.events.emit('completed', job.id, { result, duration });

      if (this.onJobCompleted) {
        this.onJobCompleted(job);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      job.markFailed(err);

      this.events.emit('failed', job.id, { error: err.message, attempt: job.attempts, duration }, err);

      if (this.onJobFailed) {
        this.onJobFailed(job, err);
      }
    } finally {
      this.activeJobs.delete(job.id);

      // Trigger another poll to pick up the next job
      if (this.running) {
        this.poll();
      }
    }
  }

  /**
   * Get the number of currently active (in-progress) jobs.
   */
  get activeCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Get worker statistics.
   */
  getStats(): {
    active: number;
    concurrency: number;
    processed: number;
    averageProcessingTime: number;
    running: boolean;
  } {
    return {
      active: this.activeJobs.size,
      concurrency: this.options.concurrency,
      processed: this.processedCount,
      averageProcessingTime:
        this.processedCount > 0
          ? Math.round(this.totalProcessingTime / this.processedCount)
          : 0,
      running: this.running,
    };
  }

  /**
   * Destroy the worker.
   */
  destroy(): void {
    this.stop();
    this.activeJobs.clear();
    this.handler = null;
    this.getNextJob = null;
    this.onJobCompleted = null;
    this.onJobFailed = null;
  }
}
