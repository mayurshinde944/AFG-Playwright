'use strict';

const { chromium, firefox, webkit } = require('playwright');
const { ValidationResult, STATUS } = require('../../models/ValidationResult');
const { performance } = require('perf_hooks');
const PageSampler = require('../ui/PageSampler');
const PageChecker = require('../ui/PageChecker');

class CrossBrowserValidator {
  /**
   * Validate a website's structural integrity across configured browser engines.
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
    
    // Fallback if not provided, but cross-browser should use all configured browsers
    const browsersConfig = config.browsers || ['chromium', 'firefox', 'webkit'];

    const startTime = performance.now();
    let overallStatus = STATUS.PASS;
    const allPageResults = [];

    let discoveryBrowser = null;
    let urlsToTest = [website.url];

    try {
      // 1. URL Discovery using Chromium
      discoveryBrowser = await chromium.launch({ headless: true });
      const discoveryContext = await discoveryBrowser.newContext();
      const discoveryPage = await discoveryContext.newPage();
      
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
            browser: 'chromium',
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
          browser: 'chromium',
          issues: [{ type: 'discovery_failed', severity: 'FAIL', message: err.message }]
        }]);
      } finally {
        await discoveryPage.close().catch(() => {});
        await discoveryContext.close().catch(() => {});
        await discoveryBrowser.close().catch(() => {});
        discoveryBrowser = null;
      }

      const maxPageRetries = config.ui?.pageRetryAttempts !== undefined 
        ? config.ui.pageRetryAttempts 
        : (config.retry?.maxRetries !== undefined ? config.retry.maxRetries : 2);

      const isHeaded = config.ui?.headed === true;

      // 2. Iterate URLs
      for (const url of urlsToTest) {
        const urlResults = [];
        
        // 3. Iterate Browsers for this URL (ensures sequential execution for browserWorkers=1)
        for (const browserName of browsersConfig) {
          let browserType = chromium;
          if (browserName === 'firefox') browserType = firefox;
          else if (browserName === 'webkit') browserType = webkit;

          let browser = null;
          let pageAttempt = 0;
          let result = null;

          const options = {
            timeoutMs,
            screenshotMode,
            screenshotDir,
            websiteId: website.id,
            browserName
          };

          try {
            browser = await browserType.launch({ headless: !isHeaded });

            while (pageAttempt <= maxPageRetries) {
              pageAttempt++;
              const vpContext = await browser.newContext();
              const page = await vpContext.newPage();
              
              result = await PageChecker.checkPage(page, url, options);
              
              await page.close().catch(() => {});
              await vpContext.close().catch(() => {});

              if (result.status === STATUS.PASS || result.status === STATUS.WARNING) {
                break;
              }

              const isRetryable = result.issues && result.issues.some(i => i.type === 'navigation_error');
              if (!isRetryable) {
                break;
              }
            }

            if (pageAttempt > 1) {
              result.retryAttempts = pageAttempt - 1;
            }

            result.browser = browserName;
            urlResults.push(result);

          } catch (err) {
            urlResults.push({
              url,
              finalUrl: url,
              status: STATUS.FAIL,
              duration: 0,
              browser: browserName,
              issues: [{ type: 'browser_launch_error', severity: 'FAIL', message: `Failed to launch ${browserName}: ${err.message}` }]
            });
          } finally {
            if (browser) await browser.close().catch(() => {});
          }
        }

        // 4. Classify and group issues for this URL
        this._classifyIssues(urlResults, browsersConfig);
        allPageResults.push(...urlResults);
        
        for (const res of urlResults) {
          if (res.status === STATUS.FAIL) {
            overallStatus = STATUS.FAIL;
          } else if (res.status === STATUS.WARNING && overallStatus !== STATUS.FAIL) {
            overallStatus = STATUS.WARNING;
          }
        }
      }

      return this._buildResult(website, overallStatus, startTime, allPageResults);

    } catch (err) {
      if (discoveryBrowser) await discoveryBrowser.close().catch(() => {});
      overallStatus = STATUS.ERROR;
      const duration = Math.round(performance.now() - startTime);
      return new ValidationResult({
        websiteId: website.id,
        validatorName: 'cross-browser',
        status: overallStatus,
        message: `Cross-browser validation failed: ${err.message}`,
        duration,
        evidence: { error: err.message }
      });
    }
  }

  _classifyIssues(urlResults, allBrowsers) {
    // Collect all issues across all browsers for this URL
    const issueMap = new Map();

    for (const result of urlResults) {
      if (!result.issues) continue;
      for (const issue of result.issues) {
        // Deterministic identity: type + relevant structured context
        // For PageChecker, context might have 'component', 'selector', 'src', etc.
        let identityString = `${issue.type}::`;
        if (issue.context) {
          const keys = Object.keys(issue.context).sort();
          identityString += keys.map(k => `${k}:${issue.context[k]}`).join('|');
        } else {
          identityString += issue.message; // fallback
        }
        
        if (!issueMap.has(identityString)) {
          issueMap.set(identityString, { originalIssue: issue, browsers: new Set() });
        }
        issueMap.get(identityString).browsers.add(result.browser);
      }
    }

    // Now re-write the issues array for each result based on classification
    for (const result of urlResults) {
      if (!result.issues) continue;
      const classifiedIssues = [];
      
      for (const issue of result.issues) {
        let identityString = `${issue.type}::`;
        if (issue.context) {
          const keys = Object.keys(issue.context).sort();
          identityString += keys.map(k => `${k}:${issue.context[k]}`).join('|');
        } else {
          identityString += issue.message;
        }

        const data = issueMap.get(identityString);
        const browserArray = Array.from(data.browsers).sort();
        
        const isCommon = browserArray.length === allBrowsers.length;
        const newType = isCommon ? `common_${issue.type}` : `browser_specific_${issue.type}`;
        
        // Construct detailed message indicating affected browsers
        let affectedStr = isCommon ? 'All configured browsers' : browserArray.join(', ');
        const newMessage = `${issue.message} (Affected: ${affectedStr})`;
        
        classifiedIssues.push({
          ...issue,
          type: newType,
          message: newMessage,
          context: {
            ...issue.context,
            affectedBrowsers: browserArray,
            isCommon
          }
        });
      }
      
      result.issues = classifiedIssues;
    }
  }

  _buildResult(website, status, startTime, pageResults) {
    const duration = Math.round(performance.now() - startTime);
    const pagesTested = pageResults.length;
    const pagesPassed = pageResults.filter(r => r.status === STATUS.PASS).length;
    const pagesWarnings = pageResults.filter(r => r.status === STATUS.WARNING).length;
    const pagesFailed = pageResults.filter(r => r.status === STATUS.FAIL).length;

    let message = 'Cross-browser validated successfully';
    if (status === STATUS.FAIL) {
      message = `Cross-browser validation failed on ${pagesFailed} out of ${pagesTested} page/browser combinations.`;
    } else if (status === STATUS.WARNING) {
      message = `Cross-browser validation generated warnings on ${pagesWarnings} out of ${pagesTested} page/browser combinations.`;
    } else if (status === STATUS.ERROR) {
      message = 'Cross-browser validation encountered an unexpected error.';
    }

    return new ValidationResult({
      websiteId: website.id,
      validatorName: 'cross-browser',
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

module.exports = CrossBrowserValidator;
