import { Job } from '../job';

/**
 * FIFO (First In, First Out) processing strategy.
 *
 * Jobs are processed in the order they were added. Simple and predictable.
 * Delayed jobs are skipped until their available time arrives.
 */
export class FIFOStrategy<T = unknown> {
  private jobs: Job<T>[] = [];

  /**
   * Add a job to the queue.
   * New jobs are appended to the end.
   */
  add(job: Job<T>): void {
    this.jobs.push(job);
  }

  /**
   * Get the next available job for processing.
   * Returns the oldest job that is waiting and available (not delayed).
   * Does not remove the job from the internal list.
   */
  getNext(): Job<T> | undefined {
    for (const job of this.jobs) {
      if (job.isAvailable) {
        return job;
      }
    }
    return undefined;
  }

  /**
   * Remove a job from the queue by ID.
   */
  remove(jobId: string): boolean {
    const index = this.jobs.findIndex((j) => j.id === jobId);
    if (index !== -1) {
      this.jobs.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all jobs, optionally filtered by status.
   */
  getAll(status?: string): Job<T>[] {
    if (status) {
      return this.jobs.filter((j) => j.status === status);
    }
    return [...this.jobs];
  }

  /**
   * Get a job by ID.
   */
  getById(jobId: string): Job<T> | undefined {
    return this.jobs.find((j) => j.id === jobId);
  }

  /**
   * Get the number of jobs in the queue.
   */
  size(): number {
    return this.jobs.length;
  }

  /**
   * Get the number of available (ready to process) jobs.
   */
  availableCount(): number {
    return this.jobs.filter((j) => j.isAvailable).length;
  }

  /**
   * Clear all jobs from the queue.
   */
  clear(): void {
    this.jobs = [];
  }

  /**
   * Peek at the next N jobs without removing them.
   */
  peek(count: number = 5): Job<T>[] {
    return this.jobs.slice(0, count);
  }

  /**
   * Re-insert a job (for retries).
   * Places it at the end of the queue.
   */
  reinsert(job: Job<T>): void {
    // Remove if already present
    this.remove(job.id);
    // Add to the end
    this.jobs.push(job);
  }
}
