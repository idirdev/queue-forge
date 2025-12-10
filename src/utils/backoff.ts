import { BackoffOptions } from '../types/index';

/**
 * Default backoff options.
 */
const DEFAULT_BACKOFF: BackoffOptions = {
  type: 'exponential',
  delay: 1000,
  maxDelay: 60_000,
};

/**
 * Calculate the backoff delay for a given attempt number.
 *
 * @param attempt - The retry attempt number (1-based)
 * @param options - Backoff configuration
 * @returns Delay in milliseconds before the next retry
 */
export function calculateBackoff(
  attempt: number,
  options: Partial<BackoffOptions> = {}
): number {
  const opts = { ...DEFAULT_BACKOFF, ...options };
  let delay: number;

  switch (opts.type) {
    case 'fixed':
      delay = opts.delay;
      break;

    case 'linear':
      delay = opts.delay * attempt;
      break;

    case 'exponential':
      delay = opts.delay * Math.pow(2, attempt - 1);
      break;

    default:
      delay = opts.delay;
  }

  // Add jitter: +/- 25% randomization to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  delay = Math.round(delay + jitter);

  // Clamp to maxDelay
  return Math.min(Math.max(delay, 0), opts.maxDelay);
}

/**
 * Get the full backoff schedule for all retry attempts.
 *
 * @param maxRetries - Number of retry attempts
 * @param options - Backoff configuration
 * @returns Array of delays in milliseconds
 */
export function getBackoffSchedule(
  maxRetries: number,
  options: Partial<BackoffOptions> = {}
): number[] {
  const schedule: number[] = [];
  for (let i = 1; i <= maxRetries; i++) {
    schedule.push(calculateBackoff(i, { ...options, type: options.type || 'exponential' }));
  }
  return schedule;
}

/**
 * Calculate the total maximum wait time across all retries.
 * Does not include jitter (uses deterministic values).
 */
export function totalBackoffTime(
  maxRetries: number,
  options: Partial<BackoffOptions> = {}
): number {
  const opts = { ...DEFAULT_BACKOFF, ...options };
  let total = 0;

  for (let i = 1; i <= maxRetries; i++) {
    let delay: number;
    switch (opts.type) {
      case 'fixed':
        delay = opts.delay;
        break;
      case 'linear':
        delay = opts.delay * i;
        break;
      case 'exponential':
        delay = opts.delay * Math.pow(2, i - 1);
        break;
      default:
        delay = opts.delay;
    }
    total += Math.min(delay, opts.maxDelay);
  }

  return total;
}

/**
 * Promise-based delay utility.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after the specified duration.
 */
export function createTimeout(ms: number, jobId: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error(`Job ${jobId} timed out after ${ms}ms`));
    }, ms);
  });
}
