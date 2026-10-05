const ExecutionPlan = require('../../src/models/ExecutionPlan');

describe('ExecutionPlan Model', () => {
  it('should generate summary without throwing', () => {
    const plan = new ExecutionPlan({
      scope: 'random',
      validators: ['dns', 'ssl'],
      concurrency: { infrastructureConcurrency: 5, browserWorkers: 1 }
    });
    const summary = plan.toSummary();
    expect(summary).toMatch(/Execution Plan Preview/);
    expect(summary).toMatch(/Scope:\s+random/);
  });
});
