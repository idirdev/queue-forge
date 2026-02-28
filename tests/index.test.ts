import { describe, it, expect } from 'vitest';
import { Job } from '../src/job';
import { QueueForge } from '../src/index';
import { calculateBackoff, getBackoffSchedule, totalBackoffTime, delay } from '../src/utils/backoff';

describe('Job', () => {
  it('should create a job with data and default options', () => {
    const job = new Job({ email: 'test@example.com' });
    expect(job.id).toBeDefined();
    expect(job.data).toEqual({ email: 'test@example.com' });
    expect(job.status).toBe('waiting');
    expect(job.attempts).toBe(0);
    expect(job.progress).toBe(0);
    expect(job.priority).toBe(0);
    expect(job.maxRetries).toBe(3);
  });

  it('should create a job with custom options', () => {
    const job = new Job('task', { priority: 10, maxRetries: 5 });
    expect(job.priority).toBe(10);
    expect(job.maxRetries).toBe(5);
  });

  it('should create a delayed job', () => {
    const job = new Job('delayed-task', { delay: 5000 });
    expect(job.status).toBe('delayed');
    expect(job.isAvailable).toBe(false);
    expect(job.availableAt.getTime()).toBeGreaterThan(Date.now() - 100);
  });

  it('should mark active and increment attempts', () => {
    const job = new Job('task');
    job.markActive();
    expect(job.status).toBe('active');
    expect(job.attempts).toBe(1);
    expect(job.processedAt).not.toBeNull();
    expect(job.progress).toBe(0);
  });

  it('should mark completed with a result', () => {
    const job = new Job('task');
    job.markActive();
    job.markCompleted({ success: true });
    expect(job.status).toBe('completed');
    expect(job.result).toEqual({ success: true });
    expect(job.completedAt).not.toBeNull();
    expect(job.progress).toBe(100);
  });

  it('should mark failed with an error', () => {
    const job = new Job('task');
    job.markActive();
    job.markFailed(new Error('Something went wrong'));
    expect(job.status).toBe('failed');
    expect(job.failReason).toBe('Something went wrong');
    expect(job.failedAt).not.toBeNull();
  });

  it('should track retry eligibility', () => {
    const job = new Job('task', { maxRetries: 2 });
    expect(job.canRetry).toBe(true);

    job.markActive(); // attempt 1
    job.markFailed(new Error('fail'));
    expect(job.canRetry).toBe(true);

    job.markActive(); // attempt 2
    job.markFailed(new Error('fail again'));
    expect(job.canRetry).toBe(false);
  });

  it('should update progress within 0-100 range', () => {
    const job = new Job('task');
    job.updateProgress(50);
    expect(job.progress).toBe(50);

    job.updateProgress(150);
    expect(job.progress).toBe(100);

    job.updateProgress(-10);
    expect(job.progress).toBe(0);
  });

  it('should mark as stalled', () => {
    const job = new Job('task');
    job.markActive();
    job.markStalled();
    expect(job.status).toBe('stalled');
  });

  it('should mark as waiting', () => {
    const job = new Job('task', { delay: 5000 });
    expect(job.status).toBe('delayed');
    job.markWaiting();
    expect(job.status).toBe('waiting');
  });

  it('should mark retrying with a new available date', () => {
    const job = new Job('task');
    job.markActive();
    job.markFailed(new Error('fail'));
    const nextAt = new Date(Date.now() + 5000);
    job.markRetrying(nextAt);
    expect(job.status).toBe('delayed');
    expect(job.availableAt).toEqual(nextAt);
  });

  it('should serialize to JSON', () => {
    const job = new Job({ key: 'value' }, { priority: 5 });
    const json = job.toJSON();
    expect(json.id).toBe(job.id);
    expect(json.data).toEqual({ key: 'value' });
    expect(json.status).toBe('waiting');
    expect(json.priority).toBe(5);
    expect(json.attempts).toBe(0);
    expect(json.maxRetries).toBe(3);
  });

  it('should have a unique ID per job', () => {
    const j1 = new Job('a');
    const j2 = new Job('b');
    expect(j1.id).not.toBe(j2.id);
  });

  it('should calculate processing duration', () => {
    const job = new Job('task');
    expect(job.processingDuration).toBe(0);

    job.markActive();
    // Duration should be >= 0 since we just marked active
    expect(job.processingDuration).toBeGreaterThanOrEqual(0);
  });

  it('should check availability based on time', () => {
    const job = new Job('now');
    expect(job.isAvailable).toBe(true);
  });

  it('should support group/tag option', () => {
    const job = new Job('task', { group: 'email-queue' } as any);
    expect(job.group).toBe('email-queue');
  });
});

describe('calculateBackoff', () => {
  it('should calculate fixed backoff', () => {
    const d = calculateBackoff(1, { type: 'fixed', delay: 1000, maxDelay: 60000 });
    // Fixed delay is 1000 +/- 25% jitter
    expect(d).toBeGreaterThanOrEqual(750);
    expect(d).toBeLessThanOrEqual(1250);
  });

  it('should calculate linear backoff', () => {
    const d1 = calculateBackoff(1, { type: 'linear', delay: 1000, maxDelay: 60000 });
    const d2 = calculateBackoff(2, { type: 'linear', delay: 1000, maxDelay: 60000 });
    // d2 should roughly be double d1 (with jitter)
    expect(d1).toBeLessThan(1500);
    expect(d2).toBeLessThan(3000);
  });

  it('should calculate exponential backoff', () => {
    const d1 = calculateBackoff(1, { type: 'exponential', delay: 1000, maxDelay: 60000 });
    const d5 = calculateBackoff(5, { type: 'exponential', delay: 1000, maxDelay: 60000 });
    // Attempt 5 = 1000 * 2^4 = 16000 +/- jitter
    expect(d1).toBeLessThan(1500);
    expect(d5).toBeGreaterThan(10000);
    expect(d5).toBeLessThanOrEqual(60000);
  });

  it('should clamp to maxDelay', () => {
    const d = calculateBackoff(20, { type: 'exponential', delay: 1000, maxDelay: 5000 });
    expect(d).toBeLessThanOrEqual(5000);
  });

  it('should not return negative values', () => {
    const d = calculateBackoff(1, { type: 'fixed', delay: 0, maxDelay: 60000 });
    expect(d).toBeGreaterThanOrEqual(0);
  });
});

describe('getBackoffSchedule', () => {
  it('should return a schedule with the right number of entries', () => {
    const schedule = getBackoffSchedule(5, { type: 'fixed', delay: 1000, maxDelay: 60000 });
    expect(schedule).toHaveLength(5);
    schedule.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(60000);
    });
  });

  it('should return empty schedule for 0 retries', () => {
    const schedule = getBackoffSchedule(0);
    expect(schedule).toHaveLength(0);
  });
});

describe('totalBackoffTime', () => {
  it('should calculate total fixed backoff time', () => {
    const total = totalBackoffTime(3, { type: 'fixed', delay: 1000, maxDelay: 60000 });
    expect(total).toBe(3000);
  });

  it('should calculate total linear backoff time', () => {
    const total = totalBackoffTime(3, { type: 'linear', delay: 1000, maxDelay: 60000 });
    // 1000 + 2000 + 3000 = 6000
    expect(total).toBe(6000);
  });

  it('should calculate total exponential backoff time', () => {
    const total = totalBackoffTime(3, { type: 'exponential', delay: 1000, maxDelay: 60000 });
    // 1000 + 2000 + 4000 = 7000
    expect(total).toBe(7000);
  });

  it('should respect maxDelay in total calculation', () => {
    const total = totalBackoffTime(5, { type: 'exponential', delay: 1000, maxDelay: 3000 });
    // 1000 + 2000 + 3000 + 3000 + 3000 = 12000
    expect(total).toBe(12000);
  });
});

describe('delay', () => {
  it('should resolve after the specified time', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe('QueueForge factory', () => {
  it('should create a FIFO queue', () => {
    const queue = QueueForge.createFIFO('test-fifo', 2);
    expect(queue).toBeDefined();
    const stats = queue.getStats();
    expect(stats.name).toBe('test-fifo');
    expect(stats.paused).toBe(false);
    queue.destroy();
  });

  it('should create a priority queue', () => {
    const queue = QueueForge.createPriority('test-priority', 3);
    expect(queue).toBeDefined();
    const stats = queue.getStats();
    expect(stats.name).toBe('test-priority');
    queue.destroy();
  });

  it('should create a queue with custom options', () => {
    const queue = QueueForge.create({
      name: 'custom-queue',
      concurrency: 5,
      strategy: 'priority',
      defaultRetries: 10,
      defaultTimeout: 30000,
    });
    expect(queue).toBeDefined();
    const stats = queue.getStats();
    expect(stats.name).toBe('custom-queue');
    queue.destroy();
  });

  it('should add jobs and track stats', () => {
    const queue = QueueForge.createFIFO('job-test');
    queue.add({ task: 'email' });
    queue.add({ task: 'sms' });
    const stats = queue.getStats();
    expect(stats.waiting).toBe(2);
    expect(stats.completed).toBe(0);
    queue.destroy();
  });

  it('should add bulk jobs', () => {
    const queue = QueueForge.createFIFO('bulk-test');
    const jobs = queue.addBulk([
      { data: { n: 1 } },
      { data: { n: 2 } },
      { data: { n: 3 } },
    ]);
    expect(jobs).toHaveLength(3);
    expect(queue.getStats().waiting).toBe(3);
    queue.destroy();
  });

  it('should pause and resume', () => {
    const queue = QueueForge.createFIFO('pause-test');
    queue.process(async () => {});
    queue.pause();
    expect(queue.getStats().paused).toBe(true);
    queue.resume();
    expect(queue.getStats().paused).toBe(false);
    queue.destroy();
  });

  it('should clean completed and failed jobs', () => {
    const queue = QueueForge.createFIFO('clean-test');
    const cleaned = queue.clean('all');
    expect(cleaned).toBe(0);
    queue.destroy();
  });
});
