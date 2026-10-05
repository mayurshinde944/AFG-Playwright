'use strict';

const fs = require('fs');
const path = require('path');
const runBaseline = require('../../src/cli/baseline');

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue({
            ok: () => true,
            status: () => 200
          }),
          waitForSelector: jest.fn().mockResolvedValue(true),
          evaluate: jest.fn().mockResolvedValue({
            header: { exists: true, detectedSelector: '.site-header', tagName: 'HEADER', childCount: 3 },
            footer: { exists: true, detectedSelector: '.site-footer', tagName: 'FOOTER', childCount: 4 }
          }),
          close: jest.fn().mockResolvedValue(true)
        }),
        close: jest.fn().mockResolvedValue(true)
      }),
      close: jest.fn().mockResolvedValue(true)
    })
  }
}));

// We must override the config path before running so we don't overwrite production config
const ConfigurationManager = require('../../src/core/ConfigurationManager');

describe('Baseline CLI Integration', () => {
  const testDir = path.join(__dirname, 'test_baselines_cli');
  const testPath = path.join(testDir, 'test-ui-baseline.json');

  let originalResolve;

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    
    originalResolve = ConfigurationManager.resolve;
    ConfigurationManager.resolve = jest.fn((fileOverrides, cliOverrides) => {
      const config = originalResolve(fileOverrides, cliOverrides);
      config.ui = config.ui || {};
      config.ui.baselinePath = testPath;
      return config;
    });
  });

  afterAll(() => {
    ConfigurationManager.resolve = originalResolve;
    if (fs.existsSync(testDir)) {
      if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
      fs.rmdirSync(testDir);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
  });

  it('should successfully run and create a baseline file', async () => {
    const args = ['--url', 'https://master.example.com'];
    
    await runBaseline(args);
    
    expect(fs.existsSync(testPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(testPath, 'utf8'));
    
    expect(data.masterUrl).toBe('https://master.example.com');
    expect(data.globalComponents.header.detectedSelector).toBe('.site-header');
  });

  it('should throw error if --url is omitted', async () => {
    await expect(runBaseline([])).rejects.toThrow('Missing --url argument');
  });
});
