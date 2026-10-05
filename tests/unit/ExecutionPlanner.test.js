const ExecutionPlanner = require('../../src/core/ExecutionPlanner');
const ExecutionRequest = require('../../src/models/ExecutionRequest');
const Website = require('../../src/models/Website');
const defaultConfig = require('../../config/default');

describe('ExecutionPlanner', () => {
  const websites = [new Website({ id: '1', name: 'A', url: 'http://a.com' })];
  
  it('should resolve preset to validators', () => {
    const req = new ExecutionRequest({ scope: { type: 'all' }, preset: 'INFRASTRUCTURE' });
    const plan = ExecutionPlanner.plan(req, websites, defaultConfig);
    
    expect(plan.validators).toEqual(['dns', 'ssl', 'http']);
    expect(plan.mode).toBe('execute');
    expect(plan.forceOverride).toBe(false);
  });

  it('should allow explicit validator overrides', () => {
    const req = new ExecutionRequest({ 
      scope: { type: 'all' }, 
      preset: 'INFRASTRUCTURE',
      validators: ['dns'] 
    });
    const plan = ExecutionPlanner.plan(req, websites, defaultConfig);
    
    expect(plan.validators).toEqual(['dns']);
  });
});
