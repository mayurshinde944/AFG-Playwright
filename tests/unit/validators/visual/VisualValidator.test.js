'use strict';

const fs = require('fs');
const path = require('path');
const VisualValidator = require('../../../../src/validators/visual/VisualValidator');
const Website = require('../../../../src/models/Website');
const { ValidationResult, STATUS } = require('../../../../src/models/ValidationResult');

const { chromium } = require('playwright');
jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() }
}));

const ImageComparer = require('../../../../src/validators/visual/ImageComparer');
jest.mock('../../../../src/validators/visual/ImageComparer');

const PageSampler = require('../../../../src/validators/ui/PageSampler');
jest.mock('../../../../src/validators/ui/PageSampler');

const PageNavigator = require('../../../../src/validators/common/PageNavigator');
jest.mock('../../../../src/validators/common/PageNavigator');

describe('VisualValidator', () => {
  let validator;
  let mockWebsite;
  let mockContext;
  let mockBrowser;
  let mockBrowserContext;
  let mockPage;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new VisualValidator();

    mockWebsite = new Website({
      id: 'site-123',
      url: 'https://example.com'
    });

    mockContext = {
      config: {
        retry: { maxRetries: 0 },
        ui: { maxPages: 2 },
        viewports: { desktop: { width: 1366, height: 768 } },
        visual: {
          mismatchThreshold: 0.05,
          baselinesDir: './artifacts/visual/baselines',
          diffsDir: './artifacts/visual/diffs',
          actualsDir: './artifacts/visual/actuals',
          defaultMasks: ['.hide-me']
        }
      }
    };

    mockPage = {
      goto: jest.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      url: jest.fn().mockReturnValue('https://example.com'),
      evaluate: jest.fn().mockResolvedValue(['https://example.com', 'https://example.com/about']),
      screenshot: jest.fn().mockResolvedValue(),
      locator: jest.fn().mockReturnValue('mock-locator'),
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

    PageSampler.sample.mockReturnValue(['https://example.com', 'https://example.com/about']);
    PageNavigator.navigate.mockResolvedValue({ response: {}, finalUrl: 'https://example.com' });
  });

  it('should discover URLs and iterate over them sequentially', async () => {
    ImageComparer.compare.mockResolvedValue({
      match: true,
      mismatchPercentage: 0,
      diffPixels: 0
    });

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.PASS);
    expect(result.pages.length).toBe(2);
    expect(mockPage.screenshot).toHaveBeenCalledTimes(2);
    expect(ImageComparer.compare).toHaveBeenCalledTimes(2);
    
    // Check masking was passed to screenshot
    expect(mockPage.screenshot).toHaveBeenCalledWith(expect.objectContaining({
      mask: ['mock-locator']
    }));
  });

  it('should return WARNING and save actual if baseline is missing', async () => {
    ImageComparer.compare.mockResolvedValue({
      match: false,
      mismatchPercentage: 100,
      diffPixels: -1,
      error: 'Baseline image not found: /path/to/baseline.png'
    });

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.WARNING);
    expect(result.pages[0].status).toBe(STATUS.WARNING);
    expect(result.pages[0].issues[0].type).toBe('missing_baseline');
  });

  it('should return FAIL if mismatch exceeds threshold', async () => {
    ImageComparer.compare.mockResolvedValue({
      match: false,
      mismatchPercentage: 5.5,
      diffPixels: 500
    });

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.pages[0].status).toBe(STATUS.FAIL);
    expect(result.pages[0].issues[0].type).toBe('visual_regression');
    expect(result.pages[0].metrics.diffPath).toBeDefined();
  });
});
