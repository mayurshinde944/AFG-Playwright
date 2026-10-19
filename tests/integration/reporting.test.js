'use strict';

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const runQa = require('../../src/cli/qa');

// Guard against any accidental external network or browser interactions
jest.mock('dns', () => ({
  promises: {
    resolveCname: jest.fn().mockRejectedValue(new Error('Unexpected network call: dns.resolveCname')),
    resolve4: jest.fn().mockRejectedValue(new Error('Unexpected network call: dns.resolve4'))
  }
}));

jest.mock('https', () => ({
  request: jest.fn(() => {
    throw new Error('Unexpected network call: https.request');
  })
}));

jest.mock('http', () => ({
  request: jest.fn(() => {
    throw new Error('Unexpected network call: http.request');
  })
}));

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockRejectedValue(new Error('Unexpected browser launch: playwright.chromium'))
  },
  firefox: {
    launch: jest.fn().mockRejectedValue(new Error('Unexpected browser launch: playwright.firefox'))
  },
  webkit: {
    launch: jest.fn().mockRejectedValue(new Error('Unexpected browser launch: playwright.webkit'))
  }
}));

// Mock ExecutionEngine to return deterministic ValidationResult objects without invoking live validators
jest.mock('../../src/core/ExecutionEngine', () => {
  const { ValidationResult, STATUS } = require('../../src/models/ValidationResult');

  return jest.fn().mockImplementation((config, registry, aggregator) => ({
    execute: jest.fn(async (plan) => {
      for (const website of plan.websites) {
        for (const validatorName of plan.validators) {
          aggregator.add(new ValidationResult({
            websiteId: website.id,
            validatorName,
            status: STATUS.PASS,
            message: `Mock validation passed for ${validatorName}`,
            duration: 10,
            details: {
              originalUrl: website.url,
              finalUrl: website.url,
              cnames: ['staging-smartonline.com.au'],
              ipAddresses: ['1.2.3.4'],
              statusCode: 200,
              certificateNormalized: {
                validTo: '2027-01-01',
                subject: 'CN=staging-smartonline.com.au',
                issuer: 'O=Test CA',
                daysRemaining: 365
              }
            },
            metrics: {
              pagesTested: 1,
              pagesPassed: 1,
              pagesWarnings: 0,
              pagesFailed: 0
            },
            pages: []
          }));
        }
      }
    })
  }));
});

describe('Reporting CLI Integration', () => {
  const artifactsDir = path.join(__dirname, '../../artifacts/reports');
  let originalExitCode;

  const runQaCli = async (cmdOrArgs) => {
    const args = Array.isArray(cmdOrArgs)
      ? cmdOrArgs
      : cmdOrArgs.replace(/^node\s+src\/cli\/qa\.js\s*/, '').trim().split(/\s+/);
    return await runQa(args);
  };

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    console.log.mockRestore();
  });

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;

    if (fs.existsSync(artifactsDir)) {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(artifactsDir, { recursive: true });
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('should generate EXACTLY 1 Operational Excel report for lightweight validators', async () => {
    await runQaCli(['--specific', 'dns-001', '--validator', 'dns', '--report', 'excel']);
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(1);
    expect(files[0]).toContain('QA_Operational_Report');
    expect(files[0]).toContain('SPECIFIC');
  });

  it('should generate EXACTLY 1 Detailed Excel report for heavy validators', async () => {
    await runQaCli(['--specific', 'dns-001', '--validator', 'ui', '--report', 'excel']);
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(1);
    expect(files[0]).toContain('QA_Detailed_Report');
    expect(files[0]).toContain('SPECIFIC');
  });

  it('should generate EXACTLY 2 reports for mixed validators', () => {
    const ReportGenerator = require('../../src/reporting/ReportGenerator');
    const request = { scope: { type: 'random' } };
    const results = [
      { validatorName: 'dns', websiteId: 'dns-001', status: 'PASS' },
      { validatorName: 'ui', websiteId: 'dns-001', status: 'PASS' }
    ];
    
    return ReportGenerator.generate(results, { reporting: { enabled: true, formats: ['excel'], outputDir: artifactsDir } }, request).then(() => {
      const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
      expect(files.length).toBe(2);
      expect(files.find(f => f.includes('QA_Operational_Report'))).toBeDefined();
      expect(files.find(f => f.includes('QA_Detailed_Report'))).toBeDefined();
      expect(files[0]).toContain('RANDOM');
      expect(files[1]).toContain('RANDOM');
    });
  });

  it('should not generate extra reports because of previous executions', async () => {
    // Create a dummy previous report
    fs.writeFileSync(path.join(artifactsDir, 'QA_Operational_Report_Old_SPECIFIC.xlsx'), 'dummy');

    await runQaCli(['--specific', 'dns-001', '--validator', 'dns', '--report', 'excel']);
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(2); // The old one + exactly one new one
  });

  it('should accumulate multiple --validator arguments and execute all of them', async () => {
    // Run with 3 lightweight validators
    await runQaCli(['--specific', 'dns-001', '--validator', 'dns', '--validator', 'ssl', '--validator', 'http', '--report', 'excel']);
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(1);
    
    const filepath = path.join(artifactsDir, files[0]);
    const wb = xlsx.readFile(filepath);
    const opSheet = xlsx.utils.sheet_to_json(wb.Sheets['Operational Report']);
    
    expect(opSheet.length).toBe(1);
    const row = opSheet[0];
    
    // Ensure all 3 have run by checking their columns are populated
    expect(row['DNS Status']).toBeDefined();
    expect(row['DNS Status']).not.toBe('');
    
    expect(row['SSL Status']).toBeDefined();
    expect(row['SSL Status']).not.toBe('');
    
    expect(row['HTTP Status']).toBeDefined();
    expect(row['HTTP Status']).not.toBe('');
  });

  it('should produce ALL filename for all scope', async () => {
    await runQaCli(['--all', '--validator', 'dns', '--report', 'excel']);
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(1);
    expect(files[0]).toContain('ALL');
  });
});
