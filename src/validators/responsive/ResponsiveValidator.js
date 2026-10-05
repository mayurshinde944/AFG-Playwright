'use strict';

const { chromium, firefox, webkit } = require('playwright');
const { ValidationResult, STATUS } = require('../../models/ValidationResult');
const { performance } = require('perf_hooks');
const PageSampler = require('../ui/PageSampler');
const ResponsiveChecker = require('./ResponsiveChecker');

class ResponsiveValidator {
  /**
   * Validate a website's responsive layout across configured viewports.
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
    
    const browserName = context.browser || 'chromium';
    let browserType = chromium;
    if (browserName === 'firefox') browserType = firefox;
    else if (browserName === 'webkit') browserType = webkit;

    const viewportsConfig = config.viewports || {
      mobile: { width: 390, height: 844 },
      tablet: { width: 768, height: 1024 },
      desktop: { width: 1366, height: 768 }
    };

    let browser = null;
    const startTime = performance.now();
    const allPageResults = [];
    let overallStatus = STATUS.PASS;

    try {
      const isHeaded = config.ui?.headed === true;
      browser = await browserType.launch({ headless: !isHeaded });

      // 1. URL Discovery
      // Use desktop viewport for discovery as it usually has the most visible links
      const discoveryContext = await browser.newContext({ viewport: viewportsConfig.desktop });
      const discoveryPage = await discoveryContext.newPage();
      
      let urlsToTest = [website.url];
      try {
        const response = await discoveryPage.goto(website.url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
        if (response && response.ok()) {
          const rawLinks = await PageSampler.extractLinks(discoveryPage);
          urlsToTest = PageSampler.sample(website.url, rawLinks, maxPages);
        } else {
          overallStatus = STATUS.FAIL;
          return this._buildResult(website, overallStatus, startTime, [{
            url: website.url,
            finalUrl: website.url,
            status: STATUS.FAIL,
            duration: 0,
            issues: [{ type: 'discovery_failed', severity: 'FAIL', message: 'Homepage failed to load for discovery' }]
          }]);
        }
      } catch (err) {
        overallStatus = STATUS.FAIL;
        return this._buildResult(website, overallStatus, startTime, [{
          url: website.url,
          finalUrl: website.url,
          status: STATUS.FAIL,
          duration: 0,
          issues: [{ type: 'discovery_failed', severity: 'FAIL', message: err.message }]
        }]);
      } finally {
        await discoveryPage.close().catch(() => {});
        await discoveryContext.close().catch(() => {});
      }

      const maxPageRetries = config.ui?.pageRetryAttempts !== undefined 
        ? config.ui.pageRetryAttempts 
        : (config.retry?.maxRetries !== undefined ? config.retry.maxRetries : 2);

      const options = {
        timeoutMs,
        screenshotMode,
        screenshotDir,
        websiteId: website.id,
        browserName
      };

      // 2. Iterate Viewports
      for (const [vpName, vpDimensions] of Object.entries(viewportsConfig)) {
        const viewport = { name: vpName, ...vpDimensions };
        
        // 3. Iterate URLs for this viewport
        for (const url of urlsToTest) {
          let pageAttempt = 0;
          let result = null;

          while (pageAttempt <= maxPageRetries) {
            pageAttempt++;
            // Create a fresh context/page for each test to ensure isolation, especially on retries
            const vpContext = await browser.newContext({ viewport: vpDimensions });
            const page = await vpContext.newPage();
            
            result = await ResponsiveChecker.checkPage(page, url, viewport, options);
            
            await page.close().catch(() => {});
            await vpContext.close().catch(() => {});

            if (result.status === STATUS.PASS || result.status === STATUS.WARNING) {
              break;
            }

            const isRetryable = result.issues && result.issues.some(i => i.type === 'navigation_error');
            if (!isRetryable) {
              break; // Deterministic failures are not retried
            }
          }

          if (pageAttempt > 1) {
            result.retryAttempts = pageAttempt - 1;
          }

          allPageResults.push(result);

          if (result.status === STATUS.FAIL) {
            overallStatus = STATUS.FAIL;
          } else if (result.status === STATUS.WARNING && overallStatus !== STATUS.FAIL) {
            overallStatus = STATUS.WARNING;
          }
        }
      }

      return this._buildResult(website, overallStatus, startTime, allPageResults);

    } catch (err) {
      // Catch overall browser errors (e.g. launch failed)
      overallStatus = STATUS.ERROR;
      const duration = Math.round(performance.now() - startTime);
      return new ValidationResult({
        websiteId: website.id,
        validatorName: 'responsive',
        status: overallStatus,
        message: `Responsive validation failed: ${err.message}`,
        duration,
        evidence: { error: err.message }
      });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  _buildResult(website, status, startTime, pageResults) {
    const duration = Math.round(performance.now() - startTime);
    const pagesTested = pageResults.length;
    const pagesPassed = pageResults.filter(r => r.status === STATUS.PASS).length;
    const pagesWarnings = pageResults.filter(r => r.status === STATUS.WARNING).length;
    const pagesFailed = pageResults.filter(r => r.status === STATUS.FAIL).length;

    let message = 'Responsive validated successfully';
    if (status === STATUS.FAIL) {
      message = `Responsive validation failed on ${pagesFailed} out of ${pagesTested} page/viewports.`;
    } else if (status === STATUS.WARNING) {
      message = `Responsive validation generated warnings on ${pagesWarnings} out of ${pagesTested} page/viewports.`;
    } else if (status === STATUS.ERROR) {
      message = 'Responsive validation encountered an unexpected error.';
    }

    return new ValidationResult({
      websiteId: website.id,
      validatorName: 'responsive',
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

module.exports = ResponsiveValidator;
