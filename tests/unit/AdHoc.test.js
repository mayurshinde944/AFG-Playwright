'use strict';

const ScopeResolver = require('../../src/core/ScopeResolver');
const ExecutionRequest = require('../../src/models/ExecutionRequest');
const Website = require('../../src/models/Website');
const ExecutionPlanner = require('../../src/core/ExecutionPlanner');
const SafetyPolicy = require('../../src/core/SafetyPolicy');
const ValidatorRegistry = require('../../src/core/ValidatorRegistry');

describe('Ad-Hoc Website Testing', () => {
  const allWebsites = [
    new Website({ id: 'site1', name: 'Site 1', url: 'https://site1.com', active: true })
  ];

  test('1. Existing inventory website still resolves normally', () => {
    const request = new ExecutionRequest({ scope: { type: 'specific', websites: ['site1'] } });
    const resolved = ScopeResolver.resolve(request, allWebsites);
    expect(resolved.length).toBe(1);
    expect(resolved[0].id).toBe('site1');
  });

  test('2. Invalid inventory ID still fails normally', () => {
    const request = new ExecutionRequest({ scope: { type: 'specific', websites: ['invalid-id'] } });
    expect(() => ScopeResolver.resolve(request, allWebsites)).toThrow('Website not found in inventory: invalid-id');
  });

  test('3. Valid ad-hoc URL resolves to a Website model', () => {
    const request = new ExecutionRequest({ scope: { type: 'adhoc', url: 'https://example.com' } });
    const resolved = ScopeResolver.resolve(request, allWebsites);
    expect(resolved.length).toBe(1);
    expect(resolved[0]).toBeInstanceOf(Website);
    expect(resolved[0].id).toBe('adhoc-example-com');
    expect(resolved[0].name).toBe('Ad-hoc: example.com');
    expect(resolved[0].url).toBe('https://example.com');
  });

  test('4. Invalid ad-hoc URL is rejected safely', () => {
    const request = new ExecutionRequest({ scope: { type: 'adhoc', url: 'not-a-valid-url' } });
    expect(() => ScopeResolver.resolve(request, allWebsites)).toThrow('Invalid ad-hoc URL provided: not-a-valid-url');
  });

  test('5. Ad-hoc request reaches ExecutionPlanner and Selected validators are respected', () => {
    const request = new ExecutionRequest({ scope: { type: 'adhoc', url: 'https://example.com' }, validators: ['dns', 'http'] });
    const resolved = ScopeResolver.resolve(request, allWebsites);
    
    const config = { browsers: ['chromium'], viewports: {}, retry: { maxRetries: 1 }, screenshots: { mode: 'off' }, crawler: { maxPages: 1 }, concurrency: { infrastructureConcurrency: 5, browserWorkers: 1 } };
    const registry = new ValidatorRegistry(); // mocks
    
    const plan = ExecutionPlanner.plan(request, resolved, config, registry);
    expect(plan.scope).toBe('adhoc');
    expect(plan.websites[0].url).toBe('https://example.com');
    expect(plan.validators).toEqual(['dns', 'http']);
  });

  test('6. Ad-hoc request reaches SafetyPolicy', () => {
    const request = new ExecutionRequest({ scope: { type: 'adhoc', url: 'https://example.com' }, validators: ['ui'] });
    const resolved = ScopeResolver.resolve(request, allWebsites);
    const config = { validators: { heavy: ['ui'] }, browsers: [], viewports: {}, retry: {}, screenshots: {}, crawler: {}, concurrency: {} };
    const plan = ExecutionPlanner.plan(request, resolved, config, new ValidatorRegistry());
    
    const safety = SafetyPolicy.evaluate(plan, config);
    // Adhoc is safe to run heavy validators on because it's only 1 website, like specific scope.
    // 'all' scope + heavy is what triggers safety policy failure.
    expect(safety.allowed).toBe(true);
  });
});
