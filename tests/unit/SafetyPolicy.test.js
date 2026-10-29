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

  describe('Ad-Hoc URL Batch Safety Policy Evaluation', () => {
    const createMockWebsites = (count) => {
      const websites = [];
      for (let i = 1; i <= count; i++) {
        websites.push({ id: `adhoc-site-${i}`, url: `https://site${i}.example.com`, name: `Site ${i}` });
      }
      return websites;
    };

    it('should allow ad-hoc batches of up to 10 URLs with lightweight validators', () => {
      const plan = new ExecutionPlan({
        scope: 'adhoc',
        websites: createMockWebsites(10),
        validators: ['dns', 'ssl', 'http'],
        concurrency: { infrastructureConcurrency: 5, browserWorkers: 1 }
      });

      const safety = SafetyPolicy.evaluate(plan, defaultConfig);
      expect(safety.allowed).toBe(true);
      expect(safety.violations).toHaveLength(0);
    });

    it('should allow ad-hoc batches of up to 10 URLs with heavy validators under safe concurrency (1 worker)', () => {
      const plan = new ExecutionPlan({
        scope: 'adhoc',
        websites: createMockWebsites(10),
        validators: ['ui', 'responsive'],
        concurrency: { infrastructureConcurrency: 5, browserWorkers: 1 }
      });

      const safety = SafetyPolicy.evaluate(plan, defaultConfig);
      expect(safety.allowed).toBe(true);
      expect(safety.violations).toHaveLength(0);
    });

    it('should block ad-hoc batches if browser worker concurrency exceeds 5 for heavy testing', () => {
      const plan = new ExecutionPlan({
        scope: 'adhoc',
        websites: createMockWebsites(10),
        validators: ['ui'],
        concurrency: { infrastructureConcurrency: 5, browserWorkers: 6 }
      });

      const safety = SafetyPolicy.evaluate(plan, defaultConfig);
      expect(safety.allowed).toBe(false);
      expect(safety.violations).toContain('Browser worker concurrency exceeds safe limits for heavy testing without forceOverride.');
    });

    it('should block ad-hoc batches if infrastructure concurrency exceeds 20', () => {
      const plan = new ExecutionPlan({
        scope: 'adhoc',
        websites: createMockWebsites(10),
        validators: ['http'],
        concurrency: { infrastructureConcurrency: 25, browserWorkers: 1 }
      });

      const safety = SafetyPolicy.evaluate(plan, defaultConfig);
      expect(safety.allowed).toBe(false);
      expect(safety.violations).toContain('Infrastructure concurrency exceeds safe limits without forceOverride.');
    });
  });
});
