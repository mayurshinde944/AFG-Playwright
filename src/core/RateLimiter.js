'use strict';

/**
 * Concurrency control foundation.
 * Uses a semaphore pattern to limit concurrent tasks.
 */
class RateLimiter {
  constructor(maxConcurrent) {
    if (typeof maxConcurrent !== 'number' || maxConcurrent < 1) {
      throw new Error('maxConcurrent must be a positive integer');
    }
    this.maxConcurrent = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  /**
   * Acquire a slot. Returns a promise that resolves when a slot is available.
   * 
   * @returns {Promise<void>}
   */
  async acquire() {
    if (this.current < this.maxConcurrent) {
      this.current++;
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a slot. Allows the next queued task to proceed.
   */
  release() {
    if (this.current > 0) {
      this.current--;
    }

    if (this.queue.length > 0) {
      this.current++;
      const resolve = this.queue.shift();
      resolve();
    }
  }

  /**
   * Helper to wrap a promise-returning function with concurrency control.
   * 
   * @param {Function} task - Function returning a promise
   * @returns {Promise<any>}
   */
  async run(task) {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

module.exports = RateLimiter;
