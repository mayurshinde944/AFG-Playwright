'use strict';

const runQa = require('../../src/cli/qa');
const ResultStore = require('../../src/reporting/ResultStore');
const ReportGenerator = require('../../src/reporting/ReportGenerator');
const ResultAggregator = require('../../src/core/ResultAggregator');
const CsvExcelInventoryLoader = require('../../src/inventory/CsvExcelInventoryLoader');
const ScopeResolver = require('../../src/core/ScopeResolver');

jest.mock('../../src/reporting/ResultStore');
jest.mock('../../src/reporting/ReportGenerator');
jest.mock('../../src/inventory/CsvExcelInventoryLoader');
jest.mock('../../src/core/ExecutionEngine');
jest.mock('../../src/core/ExecutionQueue', () => ({
  enqueue: (fn) => fn()
}));
jest.mock('../../src/core/SafetyPolicy', () => ({
  evaluate: jest.fn(() => ({ allowed: true, violations: [] }))
}));

describe('QA CLI Exit Code Logic', () => {
  let originalExitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    jest.clearAllMocks();
    
    CsvExcelInventoryLoader.prototype.loadWebsites = jest.fn().mockResolvedValue([]);
    ScopeResolver.resolve = jest.fn().mockReturnValue([]);
    ResultStore.saveRun.mockResolvedValue();
    ReportGenerator.generate.mockResolvedValue();
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  const setupMockSummary = (summary) => {
    jest.spyOn(ResultAggregator.prototype, 'getSummary').mockReturnValue(summary);
    jest.spyOn(ResultAggregator.prototype, 'getAll').mockReturnValue([]);
  };

  it('CASE 1: PASS only -> exit code 0 (undefined)', async () => {
    setupMockSummary({ total: 1, PASS: 1, WARNING: 0, FAIL: 0, ERROR: 0 });
    await runQa(['--random']);
    expect(process.exitCode).toBeUndefined();
  });

  it('CASE 2: PASS + WARNING -> exit code 2', async () => {
    setupMockSummary({ total: 2, PASS: 1, WARNING: 1, FAIL: 0, ERROR: 0 });
    await runQa(['--random']);
    expect(process.exitCode).toBe(2);
  });

  it('CASE 3: PASS + FAIL -> exit code 1', async () => {
    setupMockSummary({ total: 2, PASS: 1, WARNING: 0, FAIL: 1, ERROR: 0 });
    await runQa(['--random']);
    expect(process.exitCode).toBe(1);
  });

  it('CASE 4: PASS + WARNING + FAIL -> exit code 1', async () => {
    setupMockSummary({ total: 3, PASS: 1, WARNING: 1, FAIL: 1, ERROR: 0 });
    await runQa(['--random']);
    expect(process.exitCode).toBe(1);
  });

  it('CASE 5: ERROR -> exit code 1', async () => {
    setupMockSummary({ total: 1, PASS: 0, WARNING: 0, FAIL: 0, ERROR: 1 });
    await runQa(['--random']);
    expect(process.exitCode).toBe(1);
  });
});
