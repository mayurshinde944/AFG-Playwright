const RateLimiter = require('../../src/core/RateLimiter');

describe('RateLimiter', () => {
  it('should run tasks within concurrency limit', async () => {
    const limiter = new RateLimiter(2);
    let active = 0;
    let maxActive = 0;

    const task = async () => {
      active++;
      if (active > maxActive) maxActive = active;
      await new Promise(resolve => setTimeout(resolve, 10));
      active--;
    };

    const promises = [
      limiter.run(task),
      limiter.run(task),
      limiter.run(task),
      limiter.run(task)
    ];

    await Promise.all(promises);
    expect(maxActive).toBe(2);
    expect(active).toBe(0);
  });
});
