'use strict';

const fs = require('fs');
const PageChecker = require('../../../../src/validators/ui/PageChecker');
const { STATUS } = require('../../../../src/models/ValidationResult');

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
}));

describe('PageChecker', () => {
  let mockPage;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPage = {
      goto: jest.fn(),
      waitForSelector: jest.fn(),
      evaluate: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      url: jest.fn().mockReturnValue('https://example.com/final'),
      screenshot: jest.fn()
    };
    
    // Default happy path for evaluate
    mockPage.evaluate.mockResolvedValue([]);
  });

  it('should return PASS on successful navigation and clean content', async () => {
    mockPage.goto.mockResolvedValue({
      ok: () => true,
      status: () => 200
    });

    const result = await PageChecker.checkPage(mockPage, 'https://example.com', { timeoutMs: 1000 });

    expect(result.status).toBe(STATUS.PASS);
    expect(result.url).toBe('https://example.com');
    expect(result.issues.length).toBe(0);
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', { timeout: 1000, waitUntil: 'domcontentloaded' });
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('body', expect.any(Object));
    expect(mockPage.off).toHaveBeenCalledTimes(3);
  });

  it('should capture missing components as WARNING', async () => {
    mockPage.goto.mockResolvedValue({ ok: () => true, status: () => 200 });
    
    mockPage.evaluate.mockResolvedValue([
      { type: 'missing_component', severity: STATUS.WARNING, message: 'Missing UI component: logo' }
    ]);

    const result = await PageChecker.checkPage(mockPage, 'https://example.com');

    expect(result.status).toBe(STATUS.WARNING);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'missing_component', severity: STATUS.WARNING, message: 'Missing UI component: logo' })
    );
  });

  it('should return FAIL for blank pages', async () => {
    mockPage.goto.mockResolvedValue({ ok: () => true, status: () => 200 });
    
    mockPage.evaluate.mockResolvedValue([
      { type: 'blank_page', severity: STATUS.FAIL, message: 'Page is effectively blank' }
    ]);

    const result = await PageChecker.checkPage(mockPage, 'https://example.com');

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'blank_page', severity: STATUS.FAIL })
    );
  });
  
  it('should return FAIL for fatal server errors', async () => {
    mockPage.goto.mockResolvedValue({ ok: () => true, status: () => 200 });
    
    mockPage.evaluate.mockResolvedValue([
      { type: 'fatal_error', severity: STATUS.FAIL, message: 'Page contains visible fatal server errors' }
    ]);

    const result = await PageChecker.checkPage(mockPage, 'https://example.com');

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'fatal_error', severity: STATUS.FAIL })
    );
  });

  it('should capture same-domain request failures as WARNING', async () => {
    mockPage.goto.mockResolvedValue({ ok: () => true, status: () => 200 });
    
    mockPage.on.mockImplementation((event, handler) => {
      if (event === 'requestfailed') {
        // Same domain failure
        handler({ 
          method: () => 'GET', 
          url: () => 'https://example.com/style.css', 
          failure: () => ({ errorText: 'net::ERR_FAILED' }) 
        });
        
        // Third party failure (should be ignored)
        handler({ 
          method: () => 'GET', 
          url: () => 'https://analytics.com/tracker.js', 
          failure: () => ({ errorText: 'net::ERR_FAILED' }) 
        });
        
        // Aborted request (should be ignored)
        handler({ 
          method: () => 'GET', 
          url: () => 'https://example.com/img.png', 
          failure: () => ({ errorText: 'net::ERR_ABORTED' }) 
        });
      }
    });

    const result = await PageChecker.checkPage(mockPage, 'https://example.com');

    expect(result.status).toBe(STATUS.WARNING);
    const failedResourceIssues = result.issues.filter(i => i.type === 'failed_resource');
    expect(failedResourceIssues.length).toBe(1);
    expect(failedResourceIssues[0].message).toContain('https://example.com/style.css');
  });

  it('should deduplicate and capture JS errors as WARNING', async () => {
    mockPage.goto.mockResolvedValue({ ok: () => true, status: () => 200 });
    
    mockPage.on.mockImplementation((event, handler) => {
      if (event === 'console') {
        handler({ type: () => 'error', text: () => 'A console error' });
        handler({ type: () => 'error', text: () => 'A console error' }); // Duplicate
      }
      if (event === 'pageerror') {
        handler(new Error('A page error'));
        handler(new Error('A page error')); // Duplicate
      }
    });

    const result = await PageChecker.checkPage(mockPage, 'https://example.com');

    expect(result.status).toBe(STATUS.WARNING);
    expect(result.issues.length).toBe(2); // One console, one page error
    expect(result.issues).toContainEqual(expect.objectContaining({ type: 'console_error', message: 'A console error' }));
    expect(result.issues).toContainEqual(expect.objectContaining({ type: 'page_error', message: 'A page error' }));
  });

  it('should return FAIL and capture screenshot if navigation fails with bad status', async () => {
    mockPage.goto.mockResolvedValue({ ok: () => false, status: () => 500 });
    fs.existsSync.mockReturnValue(true);

    const result = await PageChecker.checkPage(mockPage, 'https://example.com', { 
      screenshotMode: 'failure-only', 
      screenshotDir: './artifacts', 
      websiteId: 'test-site', 
      browserName: 'chromium' 
    });

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'navigation_error', severity: STATUS.FAIL, message: 'Navigation failed with status: 500' })
    );
    expect(mockPage.screenshot).toHaveBeenCalled();
    expect(result.screenshot).toContain('artifacts');
    expect(result.screenshot).toContain('test-site-chromium');
  });

  it('should return FAIL on timeout', async () => {
    mockPage.goto.mockRejectedValue(new Error('Timeout 1000ms exceeded'));
    fs.existsSync.mockReturnValue(false);

    const result = await PageChecker.checkPage(mockPage, 'https://example.com');

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: STATUS.FAIL, message: 'Timeout 1000ms exceeded' })
    );
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(mockPage.screenshot).toHaveBeenCalled();
  });

  it('should not capture screenshot on WARNING', async () => {
    mockPage.goto.mockResolvedValue({ ok: () => true, status: () => 200 });
    
    mockPage.evaluate.mockResolvedValue([
      { type: 'broken_image', severity: STATUS.WARNING, message: 'Broken image detected: https://example.com/bad.png' }
    ]);

    await PageChecker.checkPage(mockPage, 'https://example.com', { screenshotMode: 'failure-only' });
    
    expect(mockPage.screenshot).not.toHaveBeenCalled();
  });

  describe('Component Selectors', () => {
    it('should include raw elementor containers as mainContent fallback (Phase 5C fix)', async () => {
      mockPage.goto.mockResolvedValue({ ok: () => true, status: () => 200 });
      await PageChecker.checkPage(mockPage, 'https://example.com');
      
      const evaluateFn = mockPage.evaluate.mock.calls[1][0];
      const evaluateFnStr = evaluateFn.toString();
      
      expect(evaluateFnStr).toContain('checkComponent(\'mainContent\'');
      expect(evaluateFnStr).toContain('.elementor:not(.elementor-location-header):not(.elementor-location-footer)');
    });
  });
});
