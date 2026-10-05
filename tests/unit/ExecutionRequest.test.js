const ExecutionRequest = require('../../src/models/ExecutionRequest');

describe('ExecutionRequest Model', () => {
  it('should validate successfully for valid request', () => {
    const req = new ExecutionRequest({
      scope: { type: 'random', count: 5 },
      preset: 'DAILY_QA'
    });
    expect(req.validate()).toHaveLength(0);
  });

  it('should fail validation if specific scope has no websites', () => {
    const req = new ExecutionRequest({
      scope: { type: 'specific', websites: [] }
    });
    expect(req.validate().length).toBeGreaterThan(0);
  });
});
