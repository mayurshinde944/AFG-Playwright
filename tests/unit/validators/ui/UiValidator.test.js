'use strict';

const playwright = require('playwright');
const UiValidator = require('../../../../src/validators/ui/UiValidator');
const Website = require('../../../../src/models/Website');
const { STATUS } = require('../../../../src/models/ValidationResult');
const PageSampler = require('../../../../src/validators/ui/PageSampler');
const PageChecker = require('../../../../src/validators/ui/PageChecker');

jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() },
  firefox: { launch: jest.fn() },
  webkit: { launch: jest.fn() },
}));

jest.mock('../../../../src/validators/ui/PageSampler', () => ({
  extractLinks: jest.fn(),
  sample: jest.fn()
}));

jest.mock('../../../../src/validators/ui/PageChecker', () => ({
  checkPage: jest.fn()
}));

describe('UiValidator', () => {
  let validator;
  let mockWebsite;
  let mockContext;
  
  let mockPage;
  let mockBrowserContext;
  let mockBrowser;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPage = {
      close: jest.fn().mockResolvedValue(true)
    };
    
    mockBrowserContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(true)
    };
    
    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockBrowserContext),
      close: jest.fn().mockResolvedValue(true)
    };

    playwright.chromium.launch.mockResolvedValue(mockBrowser);

    validator = new UiValidator();
    mockWebsite = new Website({
      id: 'test-ui',
      name: 'Test UI',
      url: 'https://example.com'
    });
    mockContext = {
      config: {
        ui: { maxPages: 3 },
        screenshots: { mode: 'failure-only', dir: './artifacts/screenshots' }
      }
    };
  });

  it('should return PASS if homepage and sampled pages pass', async () => {
    // Mock homepage success
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.PASS, url: 'https://example.com' });
    
    // Mock sampler
    PageSampler.extractLinks.mockResolvedValue([{href: 'https://example.com/about'}]);
    PageSampler.sample.mockReturnValue(['https://example.com', 'https://example.com/about']);
    
    // Mock second page success
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.PASS, url: 'https://example.com/about' });

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.PASS);
    expect(result.details.pagesTested).toBe(2);
    expect(result.details.pagesPassed).toBe(2);
    expect(result.details.pagesFailed).toBe(0);
    
    // Browser is launched once, reused, and closed
    expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
    expect(mockBrowserContext.newPage).toHaveBeenCalledTimes(1);
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it('should return WARNING if homepage WARNING and subpages PASS', async () => {
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.WARNING, url: 'https://example.com' });
    PageSampler.extractLinks.mockResolvedValue([{href: 'https://example.com/about'}]);
    PageSampler.sample.mockReturnValue(['https://example.com', 'https://example.com/about']);
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.PASS, url: 'https://example.com/about' });

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.WARNING);
    expect(result.details.pagesTested).toBe(2);
    expect(result.message).toContain('warnings on 1');
  });

  it('should return WARNING if homepage PASS and subpages WARNING', async () => {
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.PASS, url: 'https://example.com' });
    PageSampler.extractLinks.mockResolvedValue([{href: 'https://example.com/about'}]);
    PageSampler.sample.mockReturnValue(['https://example.com', 'https://example.com/about']);
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.WARNING, url: 'https://example.com/about' });

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.WARNING);
  });

  it('should return FAIL if any page FAILs, despite WARNINGs on other pages', async () => {
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.WARNING, url: 'https://example.com' });
    PageSampler.extractLinks.mockResolvedValue([]);
    PageSampler.sample.mockReturnValue(['https://example.com', 'https://example.com/fail', 'https://example.com/warn2']);
    
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.FAIL, url: 'https://example.com/fail' });
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.WARNING, url: 'https://example.com/warn2' });

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.details.pagesTested).toBe(3);
  });

  it('should return FAIL and stop discovery if homepage fails', async () => {
    PageChecker.checkPage.mockResolvedValueOnce({ status: STATUS.FAIL, url: 'https://example.com' });

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.details.pagesTested).toBe(1);
    expect(PageSampler.extractLinks).not.toHaveBeenCalled();
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it('should catch critical browser launch errors and return ERROR', async () => {
    playwright.chromium.launch.mockRejectedValue(new Error('Browser crashed'));

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.ERROR);
    expect(result.message).toContain('Browser crashed');
  });
});
