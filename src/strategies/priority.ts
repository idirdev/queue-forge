import { Job } from '../job';

/**
 * Priority queue strategy using a binary max-heap.
 *
 * Jobs with higher priority values are processed first.
 * When priorities are equal, the older job (earlier createdAt) is processed first.
 *
 * Operations:
 *   - add:     O(log n)
 *   - getNext: O(1) peek, O(log n) extract
 *   - remove:  O(n) search + O(log n) heapify
 */
export class PriorityStrategy<T = unknown> {
  private heap: Job<T>[] = [];

  /**
   * Compare two jobs for heap ordering.
   * Returns true if job A should be processed before job B.
   */
  private hasHigherPriority(a: Job<T>, b: Job<T>): boolean {
    if (a.priority !== b.priority) {
      return a.priority > b.priority; // Higher priority number = process first
    }
    // Equal priority: older jobs first (FIFO tie-breaker)
    return a.createdAt.getTime() < b.createdAt.getTime();
  }

  /**
   * Swap two elements in the heap.
   */
  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  /**
   * Bubble up an element from index i to restore heap property.
   */
  private siftUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.hasHigherPriority(this.heap[i], this.heap[parent])) {
        this.swap(i, parent);
        i = parent;
      } else {
        break;
      }
    }
  }

  /**
   * Push down an element from index i to restore heap property.
   */
  private siftDown(i: number): void {
    const size = this.heap.length;
    while (true) {
      let highest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;

      if (left < size && this.hasHigherPriority(this.heap[left], this.heap[highest])) {
        highest = left;
      }
      if (right < size && this.hasHigherPriority(this.heap[right], this.heap[highest])) {
        highest = right;
      }

      if (highest !== i) {
        this.swap(i, highest);
        i = highest;
      } else {
        break;
      }
    }
  }

  /**
   * Add a job to the priority queue.
   */
  add(job: Job<T>): void {
    this.heap.push(job);
    this.siftUp(this.heap.length - 1);
  }

  /**
   * Get the next available job (highest priority, available for processing).
   * This checks from the top of the heap and skips unavailable jobs.
   *
   * Note: For simplicity, this scans the heap. A production implementation
   * might use a separate delayed job queue.
   */
  getNext(): Job<T> | undefined {
    // First check the top of the heap
    if (this.heap.length > 0 && this.heap[0].isAvailable) {
      return this.heap[0];
    }

    // If the top job is not available (delayed), scan for the highest priority
    // available job
    let bestIndex = -1;
    let bestJob: Job<T> | undefined;

    for (let i = 0; i < this.heap.length; i++) {
      const job = this.heap[i];
      if (job.isAvailable) {
        if (!bestJob || this.hasHigherPriority(job, bestJob)) {
          bestJob = job;
          bestIndex = i;
        }
      }
    }

    return bestJob;
  }

  /**
   * Remove and return the highest priority available job.
   */
  extract(): Job<T> | undefined {
    const next = this.getNext();
    if (next) {
      this.remove(next.id);
    }
    return next;
  }

  /**
   * Remove a job from the heap by ID.
   */
  remove(jobId: string): boolean {
    const index = this.heap.findIndex((j) => j.id === jobId);
    if (index === -1) return false;

    // Move the last element to the removed position and re-heapify
    const lastIndex = this.heap.length - 1;
    if (index === lastIndex) {
      this.heap.pop();
    } else {
      this.heap[index] = this.heap.pop()!;
      this.siftDown(index);
      this.siftUp(index);
    }

    return true;
  }

  /**
   * Get a job by ID.
   */
  getById(jobId: string): Job<T> | undefined {
    return this.heap.find((j) => j.id === jobId);
  }

  /**
   * Get all jobs, optionally filtered by status.
   */
  getAll(status?: string): Job<T>[] {
    if (status) {
      return this.heap.filter((j) => j.status === status);
    }
    return [...this.heap];
  }

  /**
   * Get the number of jobs in the queue.
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Get the number of available jobs.
   */
  availableCount(): number {
    return this.heap.filter((j) => j.isAvailable).length;
  }

  /**
   * Clear all jobs.
   */
  clear(): void {
    this.heap = [];
  }

  /**
   * Re-insert a job (for retries). Removes if present then adds.
   */
  reinsert(job: Job<T>): void {
    this.remove(job.id);
    this.add(job);
  }

  /**
   * Peek at the top of the heap without removing.
   */
  peek(count: number = 5): Job<T>[] {
    // Return a sorted slice of the heap for preview
    return [...this.heap]
      .sort((a, b) => (this.hasHigherPriority(a, b) ? -1 : 1))
      .slice(0, count);
  }
}
