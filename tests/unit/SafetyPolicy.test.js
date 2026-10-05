const SafetyPolicy = require('../../src/core/SafetyPolicy');
const ExecutionPlan = require('../../src/models/ExecutionPlan');
const defaultConfig = require('../../config/default');

describe('SafetyPolicy', () => {
  it('should allow ALL scope with lightweight validators', () => {
    const plan = new ExecutionPlan({
      scope: 'all',
      validators: ['dns', 'ssl'],
      concurrency: { infrastructureConcurrency: 5, browserWorkers: 1 }
    });
    
    const safety = SafetyPolicy.evaluate(plan, defaultConfig);
    expect(safety.allowed).toBe(true);
    expect(safety.violations.length).toBe(0);
  });

  it('should block ALL scope with heavy validators by default', () => {
    const plan = new ExecutionPlan({
      scope: 'all',
      validators: ['ui'],
      concurrency: { infrastructureConcurrency: 5, browserWorkers: 1 }
    });
    
    const safety = SafetyPolicy.evaluate(plan, defaultConfig);
    expect(safety.allowed).toBe(false);
    expect(safety.violations.length).toBeGreaterThan(0);
  });

  it('should allow ALL scope with heavy validators if forceOverride is true', () => {
    const plan = new ExecutionPlan({
      scope: 'all',
      validators: ['ui'],
      concurrency: { infrastructureConcurrency: 5, browserWorkers: 1 },
      forceOverride: true
    });
    
    const safety = SafetyPolicy.evaluate(plan, defaultConfig);
    expect(safety.allowed).toBe(true); // Overridden
  });

  it('should block excessive infrastructure concurrency', () => {
    const plan = new ExecutionPlan({
      scope: 'random',
      validators: ['dns'],
      concurrency: { infrastructureConcurrency: 50, browserWorkers: 1 }
    });
    
    const safety = SafetyPolicy.evaluate(plan, defaultConfig);
    expect(safety.allowed).toBe(false);
  });
});
