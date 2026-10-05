'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { ValidationResult, STATUS } = require('../../models/ValidationResult');
const PageSampler = require('../ui/PageSampler');
const PageNavigator = require('../common/PageNavigator');
const ImageComparer = require('./ImageComparer');

class VisualValidator {
  /**
   * Validate a website using Visual pixel comparison
   * @param {import('../../models/Website')} website 
   * @param {object} context 
   * @returns {Promise<ValidationResult>}
   */
  async validate(website, context) {
    const config = context.config;
    const isHeaded = process.env.UI_HEADED === 'true';
    const startTime = performance.now();
    let overallStatus = STATUS.PASS;
    let browser;

    const maxPageRetries = config.retry?.maxRetries || 2;
    const maxPages = config.ui?.maxPages || 10;
    const visualConfig = config.visual || { 
      mismatchThreshold: 0.05, 
      baselinesDir: './artifacts/visual/baselines',
      diffsDir: './artifacts/visual/diffs',
      actualsDir: './artifacts/visual/actuals',
      defaultMasks: []
    };

    // Viewport resolution - we default to desktop for pure visual regression unless extended later
    const viewport = config.viewports?.desktop || { width: 1366, height: 768 };
    const viewportName = 'desktop';

    // 1. URL Discovery
    let urlsToTest = [website.url];
    try {
      browser = await chromium.launch({ headless: true });
      const discoveryContext = await browser.newContext({ viewport });
      const discoveryPage = await discoveryContext.newPage();
      
      const response = await discoveryPage.goto(website.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      if (!response || !response.ok()) {
        throw new Error(`Homepage failed to load with status ${response ? response.status() : 'Unknown'}`);
      }

      const rawLinks = await discoveryPage.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
      });
      urlsToTest = PageSampler.sample(website.url, rawLinks, maxPages);

      await discoveryContext.close();
      await browser.close();
      browser = null;
    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      return new ValidationResult({
        websiteId: website.id,
        validatorName: 'visual',
        status: STATUS.ERROR,
        durationMs: Math.round(performance.now() - startTime),
        issues: [{ type: 'visual_discovery_error', severity: 'ERROR', message: `Failed to discover URLs: ${err.message}` }]
      });
    }

    const allPageResults = [];

    // 2. Sequential Validation Iteration
    try {
      browser = await chromium.launch({ headless: !isHeaded });
      const browserContext = await browser.newContext({ viewport });

      for (const url of urlsToTest) {
        let pageAttempt = 0;
        let success = false;
        let result = null;

        while (pageAttempt <= maxPageRetries && !success) {
          pageAttempt++;
          const page = await browserContext.newPage();
          
          try {
            const { finalUrl } = await PageNavigator.navigate(page, url, config.ui?.pageTimeoutMs || 30000);
            
            // Build artifact paths
            const slug = crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
            const baselinePath = path.resolve(process.cwd(), visualConfig.baselinesDir, website.id, `${viewportName}_${slug}.png`);
            const actualPath = path.resolve(process.cwd(), visualConfig.actualsDir, website.id, `${viewportName}_${slug}.png`);
            const diffPath = path.resolve(process.cwd(), visualConfig.diffsDir, website.id, `${viewportName}_${slug}.png`);

            // Apply Dynamic Content Masking
            const maskLocators = [];
            if (Array.isArray(visualConfig.defaultMasks)) {
              for (const selector of visualConfig.defaultMasks) {
                maskLocators.push(page.locator(selector));
              }
            }

            // Capture Actual Screenshot
            const actualsDir = path.dirname(actualPath);
            if (!fs.existsSync(actualsDir)) fs.mkdirSync(actualsDir, { recursive: true });
            
            await page.screenshot({ 
              path: actualPath, 
              fullPage: true,
              mask: maskLocators.length > 0 ? maskLocators : undefined
            });

            // Perform Comparison
            const compareResult = await ImageComparer.compare(
              baselinePath,
              actualPath,
              diffPath,
              visualConfig.mismatchThreshold
            );

            let pageStatus = STATUS.PASS;
            const issues = [];
            let metrics = {
              mismatchPercentage: compareResult.mismatchPercentage,
              diffPixels: compareResult.diffPixels,
              baselinePath,
              actualPath
            };

            if (compareResult.error && compareResult.error.includes('Baseline image not found')) {
              pageStatus = STATUS.WARNING;
              if (overallStatus !== STATUS.FAIL) overallStatus = STATUS.WARNING;
              issues.push({ type: 'missing_baseline', severity: 'WARNING', message: 'No baseline exists for this URL. Actual saved for manual promotion.' });
            } else if (compareResult.error) {
              pageStatus = STATUS.FAIL;
              overallStatus = STATUS.FAIL;
              issues.push({ type: 'visual_comparison_error', severity: 'FAIL', message: compareResult.error });
            } else if (!compareResult.match) {
              pageStatus = STATUS.FAIL;
              overallStatus = STATUS.FAIL;
              issues.push({ 
                type: 'visual_regression', 
                severity: 'FAIL', 
                message: `Visual mismatch of ${compareResult.mismatchPercentage}% exceeds threshold of ${visualConfig.mismatchThreshold}%` 
              });
              metrics.diffPath = diffPath;
            }

            result = {
              url,
              finalUrl,
              status: pageStatus,
              durationMs: Math.round(performance.now() - startTime), // Rough duration
              retryAttempts: pageAttempt - 1,
              viewport: {
                name: viewportName,
                width: viewport.width,
                height: viewport.height
              },
              metrics,
              issues
            };
            success = true;

          } catch (err) {
            // Failed navigation or screenshot error
            if (pageAttempt > maxPageRetries) {
              result = {
                url,
                finalUrl: url,
                status: STATUS.FAIL,
                durationMs: Math.round(performance.now() - startTime),
                retryAttempts: pageAttempt - 1,
                viewport: { name: viewportName, width: viewport.width, height: viewport.height },
                issues: [{ type: 'visual_execution_error', severity: 'FAIL', message: `Execution failed after ${maxPageRetries} retries: ${err.message}` }]
              };
              overallStatus = STATUS.FAIL;
            }
          } finally {
            await page.close().catch(() => {});
          }
        } // while

        if (result) allPageResults.push(result);
      } // for URLs
    } catch (err) {
      overallStatus = STATUS.ERROR;
      const duration = Math.round(performance.now() - startTime);
      return new ValidationResult({
        websiteId: website.id,
        validatorName: 'visual',
        status: STATUS.ERROR,
        durationMs: duration,
        issues: [{ type: 'visual_critical_error', severity: 'ERROR', message: `Critical error: ${err.message}` }]
      });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    return new ValidationResult({
      websiteId: website.id,
      validatorName: 'visual',
      status: overallStatus,
      durationMs: Math.round(performance.now() - startTime),
      pages: allPageResults
    });
  }
}

module.exports = VisualValidator;
