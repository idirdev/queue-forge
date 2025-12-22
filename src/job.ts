import { v4 as uuidv4 } from 'uuid';
import { JobStatus, JobOptions, JobInfo } from './types/index';

/**
 * Default job options.
 */
const DEFAULT_JOB_OPTIONS: JobOptions = {
  priority: 0,
  maxRetries: 3,
  delay: 0,
  timeout: 0,
  removeOnComplete: false,
  removeOnFail: false,
  backoff: {
    type: 'exponential',
    delay: 1000,
    maxDelay: 60_000,
  },
};

/**
 * Represents a single job in the queue.
 *
 * A job has a unique ID, typed data payload, priority, retry configuration,
 * progress tracking, and timestamps for lifecycle events.
 */
export class Job<T = unknown> {
  /** Unique job identifier. */
  readonly id: string;
  /** The job data payload. */
  readonly data: T;
  /** Job priority (higher = processed sooner). */
  readonly priority: number;
  /** Configuration options for this job. */
  readonly options: JobOptions;

  /** Current status of the job. */
  private _status: JobStatus;
  /** Number of processing attempts so far. */
  private _attempts: number = 0;
  /** Current progress percentage (0-100). */
  private _progress: number = 0;
  /** Result from successful processing. */
  private _result: unknown = undefined;
  /** Error message from the last failure. */
  private _failReason: string | null = null;
  /** Stack trace from the last failure. */
  private _failStack: string | null = null;

  /** Timestamp: when the job was created. */
  readonly createdAt: Date;
  /** Timestamp: when the job was picked up for processing. */
  private _processedAt: Date | null = null;
  /** Timestamp: when the job completed successfully. */
  private _completedAt: Date | null = null;
  /** Timestamp: when the job failed for the last time. */
  private _failedAt: Date | null = null;
  /** Timestamp: when a delayed job becomes eligible for processing. */
  private _availableAt: Date;

  constructor(data: T, options: Partial<JobOptions> = {}) {
    this.id = uuidv4();
    this.data = data;
    this.options = { ...DEFAULT_JOB_OPTIONS, ...options };
    this.priority = this.options.priority;
    this.createdAt = new Date();

    // Calculate when the job becomes available
    if (this.options.delay > 0) {
      this._status = 'delayed';
      this._availableAt = new Date(Date.now() + this.options.delay);
    } else {
      this._status = 'waiting';
      this._availableAt = this.createdAt;
    }
  }

  // ─── Getters ────────────────────────────────────────────────────────────

  get status(): JobStatus { return this._status; }
  get attempts(): number { return this._attempts; }
  get progress(): number { return this._progress; }
  get result(): unknown { return this._result; }
  get failReason(): string | null { return this._failReason; }
  get failStack(): string | null { return this._failStack; }
  get processedAt(): Date | null { return this._processedAt; }
  get completedAt(): Date | null { return this._completedAt; }
  get failedAt(): Date | null { return this._failedAt; }
  get availableAt(): Date { return this._availableAt; }
  get maxRetries(): number { return this.options.maxRetries; }
  get group(): string | undefined { return this.options.group; }

  /**
   * Check if the job is available for processing right now.
   */
  get isAvailable(): boolean {
    if (this._status !== 'waiting' && this._status !== 'delayed') {
      return false;
    }
    return Date.now() >= this._availableAt.getTime();
  }

  /**
   * Check if the job can be retried.
   */
  get canRetry(): boolean {
    return this._attempts < this.options.maxRetries;
  }

  /**
   * Get the duration of the last processing attempt in milliseconds.
   */
  get processingDuration(): number {
    if (!this._processedAt) return 0;
    const endTime = this._completedAt || this._failedAt || new Date();
    return endTime.getTime() - this._processedAt.getTime();
  }

  // ─── State Transitions ─────────────────────────────────────────────────

  /**
   * Mark the job as active (being processed).
   */
  markActive(): void {
    this._status = 'active';
    this._attempts++;
    this._processedAt = new Date();
    this._progress = 0;
  }

  /**
   * Mark the job as completed with a result.
   */
  markCompleted(result?: unknown): void {
    this._status = 'completed';
    this._result = result;
    this._completedAt = new Date();
    this._progress = 100;
  }

  /**
   * Mark the job as failed with an error.
   */
  markFailed(error: Error): void {
    this._status = 'failed';
    this._failReason = error.message;
    this._failStack = error.stack || null;
    this._failedAt = new Date();
  }

  /**
   * Mark the job as waiting for retry after a failed attempt.
   */
  markRetrying(nextAvailableAt: Date): void {
    this._status = 'delayed';
    this._availableAt = nextAvailableAt;
    this._failedAt = null; // Clear failure since we're retrying
  }

  /**
   * Mark the job as stalled (active but not making progress).
   */
  markStalled(): void {
    this._status = 'stalled';
  }

  /**
   * Mark the job as waiting (ready to be picked up).
   */
  markWaiting(): void {
    this._status = 'waiting';
    this._availableAt = new Date();
  }

  /**
   * Update the job's progress (0-100).
   */
  updateProgress(progress: number): void {
    this._progress = Math.max(0, Math.min(100, progress));
  }

  // ─── Serialization ─────────────────────────────────────────────────────

  /**
   * Convert the job to a plain object for inspection.
   */
  toJSON(): JobInfo<T> {
    return {
      id: this.id,
      data: this.data,
      status: this._status,
      priority: this.priority,
      attempts: this._attempts,
      maxRetries: this.options.maxRetries,
      progress: this._progress,
      createdAt: this.createdAt,
      processedAt: this._processedAt,
      completedAt: this._completedAt,
      failedAt: this._failedAt,
      failReason: this._failReason,
      result: this._result,
      group: this.options.group,
    };
  }
}
