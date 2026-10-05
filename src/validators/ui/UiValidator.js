'use strict';

const { chromium, firefox, webkit } = require('playwright');
const { ValidationResult, STATUS } = require('../../models/ValidationResult');
const { performance } = require('perf_hooks');
const PageSampler = require('./PageSampler');
const PageChecker = require('./PageChecker');

class UiValidator {
  /**
   * Validate a website's UI using Playwright.
   *
   * @param {import('../../models/Website')} website 
   * @param {object} context 
   * @param {object} context.config
   * @returns {Promise<ValidationResult>}
   */
  async validate(website, context) {
    const config = context.config;
    const timeoutMs = config.ui?.pageTimeoutMs || config.ui?.timeoutMs || 30000;
    const maxPages = config.ui?.maxPages || 10;
    const screenshotMode = config.screenshots?.mode || 'failure-only';
    const screenshotDir = config.screenshots?.dir || './artifacts/screenshots';
    
    // Select the browser.
    const browserName = context.browser || 'chromium';
    let browserType = chromium;
    if (browserName === 'firefox') browserType = firefox;
    else if (browserName === 'webkit') browserType = webkit;

    let browser = null;
    let browserContext = null;
    let page = null;
    const startTime = performance.now();

    const pageResults = [];
    let overallStatus = STATUS.PASS;

    try {
      const isHeaded = config.ui?.headed === true;
      browser = await browserType.launch({ headless: !isHeaded });
      browserContext = await browser.newContext();
      page = await browserContext.newPage();

      const components = config.ui?.components || {};

      const options = {
        timeoutMs,
        screenshotMode,
        screenshotDir,
        websiteId: website.id,
        browserName,
        components,
        baseline: config.ui?.baseline || null
      };

      // Get retry limits
      const maxPageRetries = config.ui?.pageRetryAttempts !== undefined 
        ? config.ui.pageRetryAttempts 
        : (config.retry?.maxRetries !== undefined ? config.retry.maxRetries : 2);

      // Local retry wrapper for pages
      const checkPageWithRetries = async (urlToTest) => {
        let pageAttempt = 0;
        let result = null;

        while (pageAttempt <= maxPageRetries) {
          pageAttempt++;
          result = await PageChecker.checkPage(page, urlToTest, options);

          if (result.status === STATUS.PASS || result.status === STATUS.WARNING) {
            break;
          }

          // If failed, verify if failure is transient/retryable
          const isRetryable = result.issues && result.issues.some(i => i.type === 'navigation_error');
          if (!isRetryable) {
            break; // Deterministic failures are not retried
          }
        }

        if (pageAttempt > 1) {
          result.retryAttempts = pageAttempt - 1;
        }

        return result;
      };

      // 1. Always check Homepage first
      const homeResult = await checkPageWithRetries(website.url);
      pageResults.push(homeResult);

      if (homeResult.status === STATUS.FAIL) {
        overallStatus = STATUS.FAIL;
        // If homepage completely fails, we can't reliably discover links, so we stop here
        return this._buildResult(website, overallStatus, startTime, pageResults);
      } else if (homeResult.status === STATUS.WARNING) {
        overallStatus = STATUS.WARNING;
      }

      // 2. Discover links from Homepage
      const rawLinks = await PageSampler.extractLinks(page);

      // 3. Sample pages
      const urlsToTest = PageSampler.sample(website.url, rawLinks, maxPages);

      // 4. Test remaining URLs (skip the first one since it's the homepage we just tested)
      for (let i = 1; i < urlsToTest.length; i++) {
        const url = urlsToTest[i];
        const result = await checkPageWithRetries(url);
        pageResults.push(result);

        if (result.status === STATUS.FAIL) {
          overallStatus = STATUS.FAIL;
        } else if (result.status === STATUS.WARNING && overallStatus !== STATUS.FAIL) {
          overallStatus = STATUS.WARNING;
        }
      }

      return this._buildResult(website, overallStatus, startTime, pageResults);

    } catch (err) {
      // Catch overall browser errors (e.g. launch failed)
      overallStatus = STATUS.ERROR;
      const duration = Math.round(performance.now() - startTime);
      return new ValidationResult({
        websiteId: website.id,
        validatorName: 'ui',
        status: overallStatus,
        message: `UI validation failed: ${err.message}`,
        duration,
        evidence: { error: err.message }
      });
    } finally {
      if (page) await page.close().catch(() => {});
      if (browserContext) await browserContext.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  _buildResult(website, status, startTime, pageResults) {
    const duration = Math.round(performance.now() - startTime);
    const pagesTested = pageResults.length;
    const pagesPassed = pageResults.filter(r => r.status === STATUS.PASS).length;
    const pagesWarnings = pageResults.filter(r => r.status === STATUS.WARNING).length;
    const pagesFailed = pageResults.filter(r => r.status === STATUS.FAIL).length;

    let message = 'UI validated successfully';
    if (status === STATUS.FAIL) {
      message = `UI validation failed on ${pagesFailed} out of ${pagesTested} pages.`;
    } else if (status === STATUS.WARNING) {
      message = `UI validation generated warnings on ${pagesWarnings} out of ${pagesTested} pages.`;
    } else if (status === STATUS.ERROR) {
      message = 'UI validation encountered an unexpected error.';
    }

    return new ValidationResult({
      websiteId: website.id,
      validatorName: 'ui',
      status,
      message,
      details: {
        originalUrl: website.url,
        pagesTested,
        pagesPassed,
        pagesWarnings,
        pagesFailed,
        pageResults
      },
      metrics: {
        pagesTested,
        pagesPassed,
        pagesWarnings,
        pagesFailed
      },
      pages: pageResults,
      duration,
      handledRetries: true
    });
  }
}

module.exports = UiValidator;
