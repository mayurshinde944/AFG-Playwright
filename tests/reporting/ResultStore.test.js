'use strict';

const fs = require('fs');
const path = require('path');
const ResultStore = require('../../src/reporting/ResultStore');
const { STATUS } = require('../../src/models/ValidationResult');

describe('ResultStore', () => {
  const testConfig = {
    reporting: {
      historyDir: './artifacts/history_test/runs'
    }
  };

  afterAll(() => {
    // Cleanup test artifacts
    const historyDir = path.resolve(testConfig.reporting.historyDir);
    if (fs.existsSync(historyDir)) {
      fs.rmSync(historyDir, { recursive: true, force: true });
    }
  });

  test('generateRunId returns a unique string with expected format', () => {
    const id1 = ResultStore.generateRunId();
    const id2 = ResultStore.generateRunId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
  });

  test('saveRun persists execution data correctly', async () => {
    const runId = ResultStore.generateRunId();
    const startedAt = new Date().toISOString();
    const datePrefix = startedAt.split('T')[0];
    
    await ResultStore.saveRun({
      runId,
      request: {},
      plan: {
        scope: 'specific',
        validators: ['dns', 'ui'],
        websites: [{ id: 'site1', url: 'https://example.com', name: 'Site 1' }]
      },
      results: [
        {
          websiteId: 'site1',
          validatorName: 'ssl',
          status: STATUS.PASS,
          duration: 120,
          message: 'SSL OK',
          details: {
            certificateNormalized: { valid: true },
            certificateRaw: { sensitive: 'data' }
          },
          metrics: { someMetric: 1 }
        },
        {
          websiteId: 'site1',
          validatorName: 'ui',
          status: STATUS.FAIL,
          duration: 5000,
          message: 'UI Failed',
          evidence: { error: 'Element not found', screenshot: 'path.png' },
          pages: [{ url: 'http://test', status: 'FAIL' }]
        }
      ],
      summary: { total: 2, PASS: 1, FAIL: 1, ERROR: 0 },
      startedAt,
      completedAt: new Date().toISOString(),
      duration: 5120,
      config: testConfig
    });

    const expectedFile = path.join(path.resolve(testConfig.reporting.historyDir), `${datePrefix}_${runId}.json`);
    expect(fs.existsSync(expectedFile)).toBe(true);

    const data = JSON.parse(fs.readFileSync(expectedFile, 'utf-8'));
    
    // Check execution
    expect(data.execution.runId).toBe(runId);
    expect(data.execution.status).toBe('FAILED');
    expect(data.execution.duration).toBe(5120);
    
    // Check websites
    expect(data.websites.length).toBe(1);
    expect(data.websites[0].websiteId).toBe('site1');
    
    // Check results
    expect(data.results.length).toBe(2);
    
    const passResult = data.results.find(r => r.status === 'PASS');
    expect(passResult.validatorName).toBe('ssl');
    expect(passResult.details.certificateNormalized).toEqual({ valid: true });
    expect(passResult.details.certificateRaw).toBeUndefined();
    expect(passResult.metrics).toEqual({ someMetric: 1 });
    expect(passResult.evidence).toBeUndefined();
    
    const failResult = data.results.find(r => r.status === 'FAIL');
    expect(failResult.validatorName).toBe('ui');
    expect(failResult.error).toBe('Element not found');
    expect(failResult.evidence).toBeUndefined();
    expect(failResult.pages.length).toBe(1);
    expect(failResult.pages[0].url).toBe('http://test');
  });

  test('persistence failure does not throw or break the test run', async () => {
    const brokenConfig = {
      reporting: {
        historyDir: '/invalid/directory/path/that/will/fail'
      }
    };
    
    // Should not throw
    await expect(ResultStore.saveRun({
      runId: '123',
      request: {},
      plan: { websites: [], validators: [] },
      results: [],
      summary: {},
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0,
      config: brokenConfig
    })).resolves.not.toThrow();
  });

  test('getRunsByDate retrieves valid executions for a specific date', async () => {
    const startedAt = new Date().toISOString();
    const datePrefix = startedAt.split('T')[0];
    
    // Assumes previous test saved a run
    const runs = await ResultStore.getRunsByDate(datePrefix, testConfig);
    expect(runs).toBeInstanceOf(Array);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].execution).toBeDefined();
  });

  test('getRunsByDate returns empty array for nonexistent date', async () => {
    const runs = await ResultStore.getRunsByDate('1999-01-01', testConfig);
    expect(runs).toEqual([]);
  });

  test('getTodayRuns acts as wrapper for getRunsByDate', async () => {
    const todayRuns = await ResultStore.getTodayRuns(testConfig);
    const todayStr = new Date().toISOString().split('T')[0];
    const dateRuns = await ResultStore.getRunsByDate(todayStr, testConfig);
    expect(todayRuns).toEqual(dateRuns);
  });

  describe('getWebsiteHistory', () => {
    test('returns empty array if no identifier provided', async () => {
      const history = await ResultStore.getWebsiteHistory('', testConfig);
      expect(history).toEqual([]);
    });

    test('returns empty array if identifier not found', async () => {
      const history = await ResultStore.getWebsiteHistory('nonexistent-site', testConfig);
      expect(history).toEqual([]);
    });

    test('finds run by exact websiteId', async () => {
      const history = await ResultStore.getWebsiteHistory('site1', testConfig);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].websiteId).toBe('site1');
      expect(history[0].overallStatus).toBe('FAIL'); // based on the saveRun test
    });

    test('finds run by URL ignoring trailing slash', async () => {
      const history = await ResultStore.getWebsiteHistory('https://example.com/', testConfig);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].websiteId).toBe('site1');
    });

    test('safely skips malformed JSON file', async () => {
      const historyDir = path.resolve(testConfig.reporting.historyDir);
      fs.writeFileSync(path.join(historyDir, '2099-01-01_malformed.json'), '{ invalid json');
      
      const history = await ResultStore.getWebsiteHistory('site1', testConfig);
      expect(history.length).toBeGreaterThan(0); // Still finds the valid one
    });
  });
});
