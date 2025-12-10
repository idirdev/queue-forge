import { EventEmitter } from 'events';
import { QueueEventType, QueueEvent } from './types/index';

/**
 * Typed event emitter for queue events.
 *
 * Provides a strongly-typed wrapper around Node.js EventEmitter
 * for queue lifecycle events: added, active, completed, failed,
 * stalled, progress, retrying, delayed, paused, resumed, drained, error.
 */

type EventListener = (event: QueueEvent) => void;

export class QueueEventEmitter {
  private emitter: EventEmitter;
  private eventHistory: QueueEvent[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 1000) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
    this.maxHistory = maxHistory;
  }

  /**
   * Emit a queue event.
   */
  emit(type: QueueEventType, jobId?: string, data?: unknown, error?: Error): void {
    const event: QueueEvent = {
      type,
      jobId,
      data,
      error,
      timestamp: new Date(),
    };

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistory);
    }

    // Emit to all listeners for this event type
    this.emitter.emit(type, event);

    // Also emit a wildcard '*' event for global listeners
    this.emitter.emit('*', event);
  }

  /**
   * Register a listener for a specific event type.
   */
  on(type: QueueEventType | '*', listener: EventListener): this {
    this.emitter.on(type, listener);
    return this;
  }

  /**
   * Register a one-time listener for a specific event type.
   */
  once(type: QueueEventType | '*', listener: EventListener): this {
    this.emitter.once(type, listener);
    return this;
  }

  /**
   * Remove a listener for a specific event type.
   */
  off(type: QueueEventType | '*', listener: EventListener): this {
    this.emitter.off(type, listener);
    return this;
  }

  /**
   * Remove all listeners for a specific event type, or all event types if none specified.
   */
  removeAllListeners(type?: QueueEventType | '*'): this {
    if (type) {
      this.emitter.removeAllListeners(type);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  /**
   * Get the number of listeners for a specific event type.
   */
  listenerCount(type: QueueEventType | '*'): number {
    return this.emitter.listenerCount(type);
  }

  /**
   * Wait for the next occurrence of a specific event.
   * Returns a promise that resolves with the event.
   */
  waitFor(type: QueueEventType, timeoutMs: number = 30_000): Promise<QueueEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitter.off(type, handler);
        reject(new Error(`Timeout waiting for event: ${type}`));
      }, timeoutMs);

      const handler = (event: QueueEvent) => {
        clearTimeout(timer);
        resolve(event);
      };

      this.emitter.once(type, handler);
    });
  }

  /**
   * Get recent event history, optionally filtered by type.
   */
  getHistory(type?: QueueEventType, limit: number = 50): QueueEvent[] {
    let events = this.eventHistory;
    if (type) {
      events = events.filter((e) => e.type === type);
    }
    return events.slice(-limit);
  }

  /**
   * Get event counts by type.
   */
  getCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of this.eventHistory) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Destroy the emitter and clean up.
   */
  destroy(): void {
    this.emitter.removeAllListeners();
    this.eventHistory = [];
  }
}
