const ExecutionEngine = require('../../src/core/ExecutionEngine');
const { ValidationResult, STATUS } = require('../../src/models/ValidationResult');
const Website = require('../../src/models/Website');
const ExecutionPlan = require('../../src/models/ExecutionPlan');
const ValidatorRegistry = require('../../src/core/ValidatorRegistry');
const ResultAggregator = require('../../src/core/ResultAggregator');

describe('ExecutionEngine', () => {
  let config;
  let registry;
  let aggregator;
  let mockValidator;

  beforeEach(() => {
    config = {
      concurrency: { infrastructureConcurrency: 5, browserWorkers: 1 },
      retry: { maxRetries: 1 }
    };
    registry = new ValidatorRegistry();
    aggregator = new ResultAggregator();

    mockValidator = {
      validate: jest.fn()
    };
    registry.register('mock', mockValidator, { type: 'lightweight' });
  });

  it('should execute a plan successfully', async () => {
    const website = new Website({ id: '1', name: 'Test', url: 'http://test.com' });
    const plan = new ExecutionPlan({
      scope: 'specific',
      websites: [website],
      validators: ['mock'],
      concurrency: config.concurrency,
      mode: 'execute'
    });

    mockValidator.validate.mockResolvedValue(new ValidationResult({
      websiteId: '1', validatorName: 'mock', status: STATUS.PASS
    }));

    const engine = new ExecutionEngine(config, registry, aggregator);
    await engine.execute(plan);

    const summary = aggregator.getSummary();
    expect(summary.total).toBe(1);
    expect(summary[STATUS.PASS]).toBe(1);
    expect(mockValidator.validate).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure up to maxRetries', async () => {
    const website = new Website({ id: '1', name: 'Test', url: 'http://test.com' });
    const plan = new ExecutionPlan({
      scope: 'specific',
      websites: [website],
      validators: ['mock'],
      concurrency: config.concurrency,
      maxRetries: 2,
      mode: 'execute'
    });

    mockValidator.validate.mockResolvedValue(new ValidationResult({
      websiteId: '1', validatorName: 'mock', status: STATUS.FAIL, message: 'Failed'
    }));

    const engine = new ExecutionEngine(config, registry, aggregator);
    await engine.execute(plan);

    const summary = aggregator.getSummary();
    expect(summary.total).toBe(1);
    expect(summary[STATUS.FAIL]).toBe(1);
    // Initial attempt (1) + retries (2) = 3 calls
    expect(mockValidator.validate).toHaveBeenCalledTimes(3);

    const result = aggregator.getAll()[0];
    expect(result.message).toMatch(/Failed after 3 attempts/);
  });

  it('should handle validator exceptions', async () => {
    const website = new Website({ id: '1', name: 'Test', url: 'http://test.com' });
    const plan = new ExecutionPlan({
      scope: 'specific',
      websites: [website],
      validators: ['mock'],
      concurrency: config.concurrency,
      maxRetries: 0,
      mode: 'execute'
    });

    mockValidator.validate.mockRejectedValue(new Error('Crash!'));
    
    // Using a class name so the catch block regex works smoothly
    class MockValidator { validate() {} }
    registry.validators.get('mock').implementation = new MockValidator();
    registry.validators.get('mock').implementation.validate = jest.fn().mockRejectedValue(new Error('Crash!'));

    const engine = new ExecutionEngine(config, registry, aggregator);
    await engine.execute(plan);

    const results = aggregator.getAll();
    expect(results[0].status).toBe(STATUS.ERROR);
    expect(results[0].message).toMatch(/Crash!/);
  });

  it('should execute heavy validators using browser concurrency limiter', async () => {
    const website = new Website({ id: '1', name: 'Test', url: 'http://test.com' });
    const plan = new ExecutionPlan({
      scope: 'specific',
      websites: [website],
      validators: ['heavyMock'],
      concurrency: config.concurrency,
      mode: 'execute'
    });

    const heavyValidator = { validate: jest.fn().mockResolvedValue(new ValidationResult({
      websiteId: '1', validatorName: 'heavyMock', status: STATUS.PASS
    }))};
    registry.register('heavyMock', heavyValidator, { type: 'heavy' });

    const engine = new ExecutionEngine(config, registry, aggregator);
    await engine.execute(plan);

    const summary = aggregator.getSummary();
    expect(summary.total).toBe(1);
    expect(heavyValidator.validate).toHaveBeenCalledTimes(1);
  });
});
