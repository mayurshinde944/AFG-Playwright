'use strict';

const CrossBrowserValidator = require('../../../../src/validators/crossbrowser/CrossBrowserValidator');
const { ValidationResult, STATUS } = require('../../../../src/models/ValidationResult');
const PageChecker = require('../../../../src/validators/ui/PageChecker');
const PageSampler = require('../../../../src/validators/ui/PageSampler');
const { chromium, firefox, webkit } = require('playwright');
const Website = require('../../../../src/models/Website');

jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() },
  firefox: { launch: jest.fn() },
  webkit: { launch: jest.fn() }
}));
jest.mock('../../../../src/validators/ui/PageChecker');
jest.mock('../../../../src/validators/ui/PageSampler');

describe('CrossBrowserValidator', () => {
  let validator;
  let mockWebsite;
  let mockContext;
  let mockBrowser;
  let mockBrowserContext;
  let mockPage;

  beforeEach(() => {
    validator = new CrossBrowserValidator();
    mockWebsite = new Website({ id: 'test-01', url: 'https://example.com' });
    mockContext = {
      config: {
        ui: { maxPages: 2, pageTimeoutMs: 1000 },
        browsers: ['chromium', 'firefox', 'webkit']
      }
    };

    mockPage = {
      goto: jest.fn().mockResolvedValue({ ok: () => true }),
      close: jest.fn().mockResolvedValue()
    };
    mockBrowserContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue()
    };
    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockBrowserContext),
      close: jest.fn().mockResolvedValue()
    };

    chromium.launch.mockResolvedValue(mockBrowser);
    firefox.launch.mockResolvedValue(mockBrowser);
    webkit.launch.mockResolvedValue(mockBrowser);

    PageSampler.extractLinks.mockResolvedValue(['https://example.com']);
    PageSampler.sample.mockReturnValue(['https://example.com']);

    // Default PageChecker behavior
    PageChecker.checkPage.mockImplementation(async () => ({
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      status: STATUS.PASS,
      duration: 100,
      issues: []
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should execute viewports and URLs iteratively and return ValidationResult', async () => {
    const result = await validator.validate(mockWebsite, mockContext);
    
    expect(result).toBeInstanceOf(ValidationResult);
    expect(result.validatorName).toBe('cross-browser');
    expect(result.status).toBe(STATUS.PASS);
    
    // 1 URL * 3 browsers = 3 page records
    expect(result.pages.length).toBe(3);
    
    const browsersTested = result.pages.map(p => p.browser);
    expect(browsersTested).toContain('chromium');
    expect(browsersTested).toContain('firefox');
    expect(browsersTested).toContain('webkit');
  });

  it('should handle discovery failure', async () => {
    mockPage.goto.mockResolvedValue({ ok: () => false });
    
    const result = await validator.validate(mockWebsite, mockContext);
    
    expect(result.status).toBe(STATUS.FAIL);
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].issues[0].type).toBe('discovery_failed');
  });

  it('should classify common vs browser-specific issues', async () => {
    // Setup PageChecker to return specific issues per browser
    PageChecker.checkPage.mockImplementation(async (page, url, options) => {
      const browser = options.browserName;
      
      const commonIssue = { type: 'broken_image', severity: 'WARNING', message: 'Broken img', context: { src: 'img.png' } };
      const ffIssue = { type: 'console_error', severity: 'WARNING', message: 'FF error', context: { msg: 'error' } };
      
      const issues = [commonIssue];
      if (browser === 'firefox') {
        issues.push(ffIssue);
      }
      
      return {
        url, finalUrl: url, status: STATUS.WARNING, duration: 100, issues
      };
    });

    const result = await validator.validate(mockWebsite, mockContext);
    
    expect(result.status).toBe(STATUS.WARNING);
    expect(result.pages.length).toBe(3);
    
    const chromiumPage = result.pages.find(p => p.browser === 'chromium');
    const firefoxPage = result.pages.find(p => p.browser === 'firefox');
    const webkitPage = result.pages.find(p => p.browser === 'webkit');
    
    // Chromium should have the common issue
    expect(chromiumPage.issues.length).toBe(1);
    expect(chromiumPage.issues[0].type).toBe('common_broken_image');
    expect(chromiumPage.issues[0].context.isCommon).toBe(true);
    
    // Firefox should have the common issue AND the browser-specific issue
    expect(firefoxPage.issues.length).toBe(2);
    const ffSpecific = firefoxPage.issues.find(i => i.type === 'browser_specific_console_error');
    expect(ffSpecific).toBeDefined();
    expect(ffSpecific.context.isCommon).toBe(false);
    expect(ffSpecific.context.affectedBrowsers).toEqual(['firefox']);
    
    // WebKit should have the common issue
    expect(webkitPage.issues.length).toBe(1);
    expect(webkitPage.issues[0].type).toBe('common_broken_image');
  });

  it('should gracefully handle browser launch failures', async () => {
    webkit.launch.mockImplementation(async () => {
      throw new Error('WebKit missing');
    });

    const result = await validator.validate(mockWebsite, mockContext);
    
    expect(result.status).toBe(STATUS.FAIL); // because WebKit failed
    expect(result.pages.length).toBe(3);
    
    const webkitPage = result.pages.find(p => p.browser === 'webkit');
    expect(webkitPage.status).toBe(STATUS.FAIL);
    expect(webkitPage.issues[0].type).toBe('browser_specific_browser_launch_error');
  });
});
