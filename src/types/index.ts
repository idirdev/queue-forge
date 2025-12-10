/**
 * Status of a job in the queue.
 */
export type JobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'stalled';

/**
 * Options for creating a new job.
 */
export interface JobOptions {
  /** Job priority (higher = processed first). Default: 0. */
  priority: number;
  /** Maximum number of retry attempts on failure. Default: 3. */
  maxRetries: number;
  /** Delay in milliseconds before the job becomes eligible for processing. */
  delay: number;
  /** Timeout in milliseconds for job execution. 0 = no timeout. */
  timeout: number;
  /** Whether to remove the job from the queue after completion. Default: false. */
  removeOnComplete: boolean;
  /** Whether to remove the job from the queue after final failure. Default: false. */
  removeOnFail: boolean;
  /** Backoff strategy for retries. */
  backoff: BackoffOptions;
  /** Optional cron expression for recurring jobs. */
  cron?: string;
  /** Optional group/tag for the job. */
  group?: string;
}

/**
 * Backoff configuration for job retries.
 */
export interface BackoffOptions {
  /** Backoff strategy type. */
  type: 'fixed' | 'exponential' | 'linear';
  /** Base delay in milliseconds. */
  delay: number;
  /** Maximum delay in milliseconds (for exponential/linear). */
  maxDelay: number;
}

/**
 * Options for the queue.
 */
export interface QueueOptions {
  /** Name of the queue. */
  name: string;
  /** Maximum number of jobs to process concurrently. Default: 1. */
  concurrency: number;
  /** Default job options applied to all jobs unless overridden. */
  defaultJobOptions: Partial<JobOptions>;
  /** Processing strategy: 'fifo' or 'priority'. Default: 'fifo'. */
  strategy: 'fifo' | 'priority';
  /** Interval (ms) for checking stalled jobs. Default: 30000. */
  stallInterval: number;
  /** Time (ms) after which an active job is considered stalled. Default: 60000. */
  stallTimeout: number;
}

/**
 * Options for the worker.
 */
export interface WorkerOptions {
  /** Maximum number of concurrent job executions. */
  concurrency: number;
  /** Lock duration in milliseconds for processing a job. */
  lockDuration: number;
  /** Polling interval in milliseconds when the queue is empty. */
  pollInterval: number;
}

/**
 * The handler function type that processes a job.
 */
export type JobHandler<T = unknown, R = unknown> = (
  data: T,
  jobId: string,
  reportProgress: (progress: number) => void
) => Promise<R>;

/**
 * Queue event types.
 */
export type QueueEventType =
  | 'added'
  | 'active'
  | 'completed'
  | 'failed'
  | 'stalled'
  | 'progress'
  | 'retrying'
  | 'delayed'
  | 'paused'
  | 'resumed'
  | 'drained'
  | 'error';

/**
 * Queue event data.
 */
export interface QueueEvent {
  type: QueueEventType;
  jobId?: string;
  data?: unknown;
  error?: Error;
  timestamp: Date;
}

/**
 * Queue statistics.
 */
export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  processed: number;
  averageProcessingTime: number;
}

/**
 * Serialized representation of a job for inspection.
 */
export interface JobInfo<T = unknown> {
  id: string;
  data: T;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxRetries: number;
  progress: number;
  createdAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failReason: string | null;
  result: unknown;
  group?: string;
}
