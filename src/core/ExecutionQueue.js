'use strict';

class ExecutionQueue {
  constructor() {
    this.queue = [];
    this.isRunning = false;
  }

  /**
   * Enqueue an execution task to be run sequentially.
   * 
   * @param {Function} taskFn - An async function that wraps the execution engine.
   * @returns {Promise<any>}
   */
  enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this._process();
    });
  }

  async _process() {
    if (this.isRunning) {
      return;
    }
    
    if (this.queue.length === 0) {
      return;
    }

    this.isRunning = true;
    const { taskFn, resolve, reject } = this.queue.shift();

    try {
      const result = await taskFn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.isRunning = false;
      // Process next task asynchronously to avoid deep call stacks
      setImmediate(() => this._process());
    }
  }
}

// Export a singleton instance
module.exports = new ExecutionQueue();
