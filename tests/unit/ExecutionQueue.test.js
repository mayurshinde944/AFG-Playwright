'use strict';

// We require the class directly for isolation in some tests
// But we'll also test the singleton
const globalQueue = require('../../src/core/ExecutionQueue');
const ExecutionQueueClass = globalQueue.constructor;

describe('ExecutionQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new ExecutionQueueClass();
  });

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  test('1. One execution runs normally', async () => {
    const result = await queue.enqueue(async () => 'success');
    expect(result).toBe('success');
  });

  test('2, 3, 4. Queue enforces concurrency=1, FIFO order, and no overlap', async () => {
    const log = [];
    
    const task1 = async () => {
      log.push('start 1');
      await delay(50);
      log.push('end 1');
      return 1;
    };
    
    const task2 = async () => {
      log.push('start 2');
      await delay(10);
      log.push('end 2');
      return 2;
    };

    // Fire concurrently
    const p1 = queue.enqueue(task1);
    const p2 = queue.enqueue(task2);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1).toBe(1);
    expect(res2).toBe(2);

    // If there was overlap, start 2 would be before end 1
    expect(log).toEqual([
      'start 1',
      'end 1',
      'start 2',
      'end 2'
    ]);
  });

  test('5, 6. A failed execution does not prevent the next execution', async () => {
    const task1 = async () => {
      throw new Error('Task 1 failed');
    };
    
    const task2 = async () => {
      return 'Task 2 success';
    };

    const p1 = queue.enqueue(task1);
    const p2 = queue.enqueue(task2);

    await expect(p1).rejects.toThrow('Task 1 failed');
    const res2 = await p2;
    expect(res2).toBe('Task 2 success');
  });

  test('7. The singleton exports correctly', () => {
    expect(globalQueue).toBeInstanceOf(ExecutionQueueClass);
  });
});
