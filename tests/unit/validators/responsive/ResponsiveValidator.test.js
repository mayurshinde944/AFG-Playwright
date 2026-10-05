const ResponsiveValidator = require('../../../../src/validators/responsive/ResponsiveValidator');
const { STATUS } = require('../../../../src/models/ValidationResult');
const PageSampler = require('../../../../src/validators/ui/PageSampler');
const ResponsiveChecker = require('../../../../src/validators/responsive/ResponsiveChecker');

jest.mock('../../../../src/validators/ui/PageSampler');
jest.mock('../../../../src/validators/responsive/ResponsiveChecker');

// Mock playwright
jest.mock('playwright', () => {
  const mockPage = {
    goto: jest.fn().mockResolvedValue({ ok: () => true }),
    close: jest.fn().mockResolvedValue(),
  };
  const mockContext = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockResolvedValue(),
  };
  const mockBrowser = {
    newContext: jest.fn().mockResolvedValue(mockContext),
    close: jest.fn().mockResolvedValue(),
  };
  return {
    chromium: { launch: jest.fn().mockResolvedValue(mockBrowser) },
    firefox: { launch: jest.fn().mockResolvedValue(mockBrowser) },
    webkit: { launch: jest.fn().mockResolvedValue(mockBrowser) },
  };
});

describe('ResponsiveValidator Unit Tests', () => {
  let validator;
  let mockWebsite;
  let mockContext;

  beforeEach(() => {
    validator = new ResponsiveValidator();
    mockWebsite = { id: 'ws1', url: 'https://example.com' };
    mockContext = {
      browser: 'chromium',
      config: {
        ui: { maxPages: 2, pageRetryAttempts: 1 },
        viewports: {
          mobile: { width: 390, height: 844 },
          desktop: { width: 1366, height: 768 }
        }
      }
    };

    PageSampler.extractLinks.mockResolvedValue(['https://example.com/about']);
    PageSampler.sample.mockReturnValue(['https://example.com', 'https://example.com/about']);
    
    ResponsiveChecker.checkPage.mockResolvedValue({
      status: STATUS.PASS,
      duration: 100,
      issues: []
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should execute viewports and URLs iteratively and return ValidationResult', async () => {
    const result = await validator.validate(mockWebsite, mockContext);
    
    // 2 viewports * 2 urls = 4 checkPage calls
    expect(ResponsiveChecker.checkPage).toHaveBeenCalledTimes(4);
    
    // Check if the viewport contexts were respected
    const checkPageCalls = ResponsiveChecker.checkPage.mock.calls;
    
    // 1st call should be mobile, example.com
    expect(checkPageCalls[0][1]).toBe('https://example.com');
    expect(checkPageCalls[0][2]).toEqual({ name: 'mobile', width: 390, height: 844 });
    
    // 3rd call should be desktop, example.com
    expect(checkPageCalls[2][1]).toBe('https://example.com');
    expect(checkPageCalls[2][2]).toEqual({ name: 'desktop', width: 1366, height: 768 });

    expect(result.status).toBe(STATUS.PASS);
    expect(result.metrics.pagesTested).toBe(4);
    expect(result.metrics.pagesPassed).toBe(4);
  });

  test('should handle page-level retries if navigation fails', async () => {
    // Fail first time, pass second time for mobile 'https://example.com/about'
    let callCount = 0;
    ResponsiveChecker.checkPage.mockImplementation(async (page, url, vp) => {
      if (vp.name === 'mobile' && url === 'https://example.com/about') {
        callCount++;
        if (callCount === 1) {
          return { url, status: STATUS.FAIL, issues: [{ type: 'navigation_error' }] };
        }
      }
      return { url, status: STATUS.PASS, issues: [] };
    });

    const result = await validator.validate(mockWebsite, mockContext);
    
    // 4 expected calls + 1 retry = 5 calls total
    expect(ResponsiveChecker.checkPage).toHaveBeenCalledTimes(5);
    expect(result.status).toBe(STATUS.PASS); // The retry succeeded
    expect(result.pages.find(p => p.url === 'https://example.com/about' && p.retryAttempts === 1)).toBeTruthy();
  });

  test('should fail overall if discovery homepage load fails', async () => {
    const playwright = require('playwright');
    // Force discovery page to fail
    const mockBrowser = await playwright.chromium.launch();
    const pwContext = await mockBrowser.newContext();
    const mockPage = await pwContext.newPage();
    mockPage.goto.mockResolvedValueOnce({ ok: () => false, status: () => 500 });
    
    const result = await validator.validate(mockWebsite, mockContext);
    
    expect(result.status).toBe(STATUS.FAIL);
    expect(result.issues).toBeUndefined(); 
    expect(result.pages[0].issues[0].type).toBe('discovery_failed');
    expect(ResponsiveChecker.checkPage).toHaveBeenCalledTimes(0);
  });
});
