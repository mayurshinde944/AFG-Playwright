const runQa = require('../../src/cli/qa');
const dns = require('dns').promises;
const https = require('https');
const http = require('http');
const tls = require('tls');
const ResultAggregator = require('../../src/core/ResultAggregator');

jest.mock('dns', () => ({
  promises: {
    resolveCname: jest.fn(),
    resolve4: jest.fn()
  }
}));

jest.mock('https');
jest.mock('http');
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
          waitForSelector: jest.fn().mockResolvedValue(true),
          on: jest.fn(),
          off: jest.fn(),
          $$eval: jest.fn().mockResolvedValue([]),
          evaluate: jest.fn().mockResolvedValue([]),
          url: jest.fn().mockReturnValue('https://accomplish.staging-smartonline.com.au'),
          close: jest.fn().mockResolvedValue(true)
        }),
        close: jest.fn().mockResolvedValue(true)
      }),
      close: jest.fn().mockResolvedValue(true)
    })
  }
}));

// Suppress console.log during test execution
jest.spyOn(console, 'log').mockImplementation(() => {});

describe('QA CLI Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute end-to-end DNS validation on a specific website', async () => {
    // We mock DNS to return a PASS condition for a specific site (e.g. test-003 custom domain)
    // In our sample.csv, dns-001 is: dns-001,https://amalis.smartonline.com.au
    
    dns.resolveCname.mockResolvedValue(['amalis.smartonline.com.au']);
    dns.resolve4.mockResolvedValue(['1.2.3.4']);

    // Call the QA command just like the shell would
    const summary = await runQa(['--specific', 'dns-001', '--validator', 'dns']);
    
    expect(summary.total).toBe(1);
    expect(summary.PASS).toBe(1);
    expect(dns.resolveCname).toHaveBeenCalledTimes(1);
  });

  it('should execute end-to-end SSL validation on a specific website', async () => {
    // We mock HTTPS to return a PASS condition with a valid cert
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const mockCert = { 
      valid_from: new Date().toISOString(),
      valid_to: futureDate.toISOString(),
      subject: { CN: 'accomplish.staging-smartonline.com.au' },
      issuer: { O: 'Mock CA' }
    };
    
    // Simulate the circular reference that causes JSON.stringify to crash
    mockCert.issuerCertificate = mockCert;

    
    // Setup HTTPS request mock
    const activeReq = {
      on: jest.fn(),
      end: jest.fn(() => {
        // Invoke the response callback
        if (https.request.mock.calls.length > 0) {
          const cb = https.request.mock.calls[https.request.mock.calls.length - 1][2];
          cb({ 
            statusCode: 200, 
            headers: {}, 
            socket: { getPeerCertificate: () => mockCert, authorizationError: null },
            on: jest.fn()
          });
        }
      }),
      destroy: jest.fn(),
      abort: jest.fn()
    };
    https.request.mockReturnValue(activeReq);
    jest.spyOn(tls, 'checkServerIdentity').mockReturnValue(undefined);

    const addSpy = jest.spyOn(ResultAggregator.prototype, 'add');

    // Call the QA command for ssl
    const summary = await runQa(['--specific', 'dns-001', '--validator', 'ssl']);
    
    expect(summary.total).toBe(1);
    expect(summary.PASS).toBe(1);
    expect(https.request).toHaveBeenCalledTimes(1);

    // Verify the result reached the aggregator correctly
    expect(addSpy).toHaveBeenCalled();
    const finalResult = addSpy.mock.calls[0][0];
    
    // Verify validator name is 'ssl' and result is PASS
    expect(finalResult.validatorName).toBe('ssl');
    expect(finalResult.status).toBe('PASS');

    // Verify console.log successfully serialized normalized details (without crashing)
    // and that certificateRaw was removed.
    const consoleLogCalls = console.log.mock.calls.map(call => call[0]);
    const detailsLog = consoleLogCalls.find(log => typeof log === 'string' && log.includes('Details:'));
    expect(detailsLog).toBeDefined();
    expect(detailsLog).toContain('certificateNormalized');
    expect(detailsLog).toContain('Mock CA');
    expect(detailsLog).not.toContain('certificateRaw');
  });


  it('should preserve ExecutionEngine retry behavior for SSL failures', async () => {
    // Setup HTTPS request mock to throw a connection error
    const activeReq = {
      on: jest.fn((event, cb) => {
        if (event === 'error') cb(new Error('ECONNRESET'));
      }),
      end: jest.fn(),
      destroy: jest.fn(),
      abort: jest.fn()
    };
    https.request.mockReturnValue(activeReq);

    const summary = await runQa(['--specific', 'dns-001', '--validator', 'ssl']);
    
    expect(summary.total).toBe(1);
    expect(summary.FAIL).toBe(1);
    
    // ExecutionEngine default maxRetries is 2, so 1 initial + 2 retries = 3 requests
    expect(https.request).toHaveBeenCalledTimes(3);
  });

  it('should execute end-to-end HTTP validation on a specific website', async () => {
    // Setup HTTPS request mock for a successful 200 response
    const activeReq = {
      on: jest.fn(),
      end: jest.fn(() => {
        // Invoke the response callback
        if (https.request.mock.calls.length > 0) {
          const cb = https.request.mock.calls[https.request.mock.calls.length - 1][2];
          if (cb) {
            cb({
              statusCode: 200,
              headers: {},
              on: jest.fn(),
              destroy: jest.fn()
            });
          }
        }
      }),
      destroy: jest.fn(),
      abort: jest.fn()
    };
    https.request.mockReturnValue(activeReq);

    const addSpy = jest.spyOn(ResultAggregator.prototype, 'add');

    // Call the QA command for http
    const summary = await runQa(['--specific', 'dns-001', '--validator', 'http']);
    
    expect(summary.total).toBe(1);
    expect(summary.PASS).toBe(1);
    expect(https.request).toHaveBeenCalledTimes(1);

    // Verify the result reached the aggregator correctly
    expect(addSpy).toHaveBeenCalled();
    const finalResult = addSpy.mock.calls[0][0];
    
    // Verify validator name is 'http' and result is PASS
    expect(finalResult.validatorName).toBe('http');
    expect(finalResult.status).toBe('PASS');
    expect(finalResult.details.statusCode).toBe(200);
    expect(finalResult.details.originalUrl).toBeDefined();
    expect(finalResult.details.finalUrl).toBeDefined();
    expect(typeof finalResult.duration).toBe('number');
  });

  it('should preserve ExecutionEngine retry behavior for HTTP failures', async () => {
    // Setup HTTPS request mock to throw a connection error
    const activeReq = {
      on: jest.fn((event, cb) => {
        if (event === 'error') cb(new Error('ECONNRESET'));
      }),
      end: jest.fn(),
      destroy: jest.fn(),
      abort: jest.fn()
    };
    https.request.mockReturnValue(activeReq);

    const summary = await runQa(['--specific', 'dns-001', '--validator', 'http']);
    
    expect(summary.total).toBe(1);
    expect(summary.FAIL).toBe(1);
    
    // ExecutionEngine default maxRetries is 2, so 1 initial + 2 retries = 3 requests
    expect(https.request).toHaveBeenCalledTimes(3);
  });

  it('should execute end-to-end UI validation on a specific website', async () => {
    const addSpy = jest.spyOn(ResultAggregator.prototype, 'add');

    // Call the QA command for ui
    const summary = await runQa(['--specific', 'dns-001', '--validator', 'ui']);
    
    expect(summary.total).toBe(1);
    expect(summary.PASS).toBe(1);

    // Verify the result reached the aggregator correctly
    expect(addSpy).toHaveBeenCalled();
    const finalResult = addSpy.mock.calls.find(call => call[0].validatorName === 'ui')[0];
    
    // Verify validator name is 'ui' and result is PASS
    expect(finalResult.validatorName).toBe('ui');
    expect(finalResult.status).toBe('PASS');
    expect(finalResult.details.originalUrl).toBeDefined();
    expect(finalResult.details.pagesTested).toBe(1);
    expect(finalResult.details.pageResults[0].finalUrl).toBeDefined();
    expect(typeof finalResult.duration).toBe('number');
  });

  it('should preserve ExecutionEngine retry behavior for UI failures', async () => {
    const playwright = require('playwright');
    
    // Override the mock to throw an error 3 times
    const failingPage = {
      goto: jest.fn().mockRejectedValue(new Error('Navigation Timeout')),
      waitForSelector: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      $$eval: jest.fn().mockResolvedValue([]),
      evaluate: jest.fn().mockResolvedValue([]),
      url: jest.fn().mockReturnValue('https://accomplish.staging-smartonline.com.au'),
      close: jest.fn().mockResolvedValue(true),
      screenshot: jest.fn().mockResolvedValue(true) // Should be called on failure
    };

    const failingContext = {
      newPage: jest.fn().mockResolvedValue(failingPage),
      close: jest.fn().mockResolvedValue(true)
    };

    const failingBrowser = {
      newContext: jest.fn().mockResolvedValue(failingContext),
      close: jest.fn().mockResolvedValue(true)
    };

    playwright.chromium.launch.mockResolvedValue(failingBrowser);

    const summary = await runQa(['--specific', 'dns-001', '--validator', 'ui']);
    
    expect(summary.total).toBe(1);
    expect(summary.FAIL).toBe(1);
    
    // With page-level retries, the browser is launched ONCE
    expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
    
    // The page checks the homepage 3 times due to page-level retries (1 initial + 2 retries)
    expect(failingPage.goto).toHaveBeenCalledTimes(3);

    // Verify cleanup was called on the mock once
    expect(failingBrowser.close).toHaveBeenCalledTimes(1);

    // Restore the mock for subsequent tests
    const defaultBrowser = {
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
          waitForSelector: jest.fn().mockResolvedValue(true),
          on: jest.fn(),
          off: jest.fn(),
          $$eval: jest.fn().mockResolvedValue([]),
          evaluate: jest.fn().mockResolvedValue([]),
          url: jest.fn().mockReturnValue('https://accomplish.staging-smartonline.com.au'),
          close: jest.fn().mockResolvedValue(true)
        }),
        close: jest.fn().mockResolvedValue(true)
      }),
      close: jest.fn().mockResolvedValue(true)
    };
    playwright.chromium.launch.mockResolvedValue(defaultBrowser);
  });

  it('should gracefully handle missing or corrupt baseline and continue QA', async () => {
    const ConfigurationManager = require('../../src/core/ConfigurationManager');
    const BaselineManager = require('../../src/core/BaselineManager');
    
    // Mock the config to point to a baseline
    const originalResolve = ConfigurationManager.resolve.bind(ConfigurationManager);
    jest.spyOn(ConfigurationManager, 'resolve').mockImplementation((base, overrides) => {
      const resolved = originalResolve(base, overrides);
      if (!resolved.ui) resolved.ui = {};
      resolved.ui.baselinePath = './non-existent-baseline.json';
      return resolved;
    });

    // Mock BaselineManager to return null (missing)
    jest.spyOn(BaselineManager, 'load').mockReturnValue(null);

    // Should successfully execute UI tests and PASS despite missing baseline
    const summary = await runQa(['--specific', 'dns-001', '--validator', 'ui']);
    
    console.error('SUMMARY IS:', summary);
    expect(summary.total).toBe(1);
    expect(summary.PASS).toBe(1);
    
    // Restore mocks
    ConfigurationManager.resolve.mockRestore();
    BaselineManager.load.mockRestore();
  });
});
