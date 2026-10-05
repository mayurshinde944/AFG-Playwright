'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { STATUS } = require('../../models/ValidationResult');
const PageNavigator = require('../common/PageNavigator');

class PageChecker {
  /**
   * Validate a single page.
   * 
   * @param {import('playwright').Page} page
   * @param {string} url
   * @param {object} options
   * @returns {Promise<object>} Page result object
   */
  static async checkPage(page, url, options = {}) {
    const { 
      timeoutMs = 30000, 
      screenshotMode = 'failure-only', 
      screenshotDir = './artifacts/screenshots', 
      websiteId = 'unknown', 
      browserName = 'chromium' 
    } = options;

    const issues = [];
    const seenErrors = new Set();
    
    let targetHostname = '';
    try {
      targetHostname = new URL(url).hostname;
    } catch (e) {
      // fallback
    }

    const addIssue = (type, severity, message, context = {}) => {
      // Deduplicate by message to avoid log bloat
      if (seenErrors.has(message)) return;
      seenErrors.add(message);
      issues.push({ type, severity, message, context });
    };

    const onConsole = msg => {
      if (msg.type() === 'error') {
        addIssue('console_error', STATUS.WARNING, msg.text());
      }
    };
    
    const onPageError = err => {
      addIssue('page_error', STATUS.WARNING, err.message);
    };
    
    const onRequestFailed = req => {
      const reqUrl = req.url();
      const failureText = req.failure()?.errorText || '';
      
      // Ignore deliberately aborted requests
      if (failureText === 'net::ERR_ABORTED') return;
      
      try {
        const reqHostname = new URL(reqUrl).hostname;
        // Only flag same-domain resource failures
        if (reqHostname === targetHostname) {
          addIssue('failed_resource', STATUS.WARNING, `${req.method()} ${reqUrl} - ${failureText}`, { url: reqUrl, method: req.method(), error: failureText });
        }
      } catch (e) {
        // invalid URL, ignore
      }
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('requestfailed', onRequestFailed);

    const startTime = performance.now();
    let duration = 0;
    let finalUrl = url;
    let pageStatus = STATUS.PASS;

    try {
      const navResult = await PageNavigator.navigate(page, url, timeoutMs);
      finalUrl = navResult.finalUrl;
      
      // Perform DOM-based lightweight health checks
      const domHealth = await page.evaluate(async ({ configComponents, baseline }) => {
        const issues = [];
        
        // 2. Broken Images
        const images = Array.from(document.images);
        for (const img of images) {
          // Ignore if no src, data URLs, or explicitly sized 0
          if (!img.src || img.src.startsWith('data:') || img.getAttribute('width') === '0') {
            continue;
          }
          // Detect genuinely broken images (requested, completed, but 0 natural width)
          if (img.complete && img.naturalWidth === 0) {
            issues.push({
              type: 'broken_image',
              severity: 'WARNING',
              message: `Broken image detected: ${img.src}`,
              context: { src: img.src }
            });
          }
        }
        
        // 3. Content Health
        const bodyText = document.body.innerText || '';
        const trimmedText = bodyText.trim();
        
        // Check for fatal errors
        if (trimmedText.includes('Fatal error:') || trimmedText.includes('Parse error:')) {
          issues.push({
            type: 'fatal_error',
            severity: 'FAIL',
            message: 'Page contains visible fatal server errors'
          });
        }
        
        // Check for effectively blank page
        const imgCount = document.images.length;
        const iframeCount = document.querySelectorAll('iframe').length;
        if (trimmedText.length === 0 && imgCount === 0 && iframeCount === 0) {
          issues.push({
            type: 'blank_page',
            severity: 'FAIL',
            message: 'Page is effectively blank (no text, images, or iframes)'
          });
        }
        
        // 4. Component Checks (Phase 5C)
        const cloneElements = {};

        const checkComponent = (name, defaultSelector) => {
          const selector = configComponents[name] || defaultSelector;
          const el = document.querySelector(selector);
          if (!el) {
            issues.push({
              type: 'missing_component',
              severity: 'WARNING', // Structural defects are WARNINGs to avoid stopping execution
              message: `Missing UI component: ${name}`,
              context: { component: name, selector }
            });
          }
          cloneElements[name] = !!el;
        };

        checkComponent('header', 'header, .site-header, [data-elementor-type="header"], .elementor-location-header');
        checkComponent('logo', '.site-logo, .custom-logo, img[alt*="logo" i], .header-logo');
        checkComponent('navigation', 'nav, .main-navigation, .site-navigation, .elementor-nav-menu');
        checkComponent('mainContent', 'main, #main, .site-main, [data-elementor-type="wp-page"], .elementor-location-single, article, .elementor-widget-theme-post-content, .elementor:not(.elementor-location-header):not(.elementor-location-footer)');
        checkComponent('footer', 'footer, .site-footer, [data-elementor-type="footer"], .elementor-location-footer');

        // 5. Phase 5E: Master vs Clone Structural Comparison
        if (baseline && baseline.globalComponents) {
          const masterComponents = baseline.globalComponents;
          
          for (const [name, masterComp] of Object.entries(masterComponents)) {
            // We only care if the Master component exists but is completely missing on the clone
            if (masterComp.exists && !cloneElements[name]) {
              issues.push({
                type: 'master_component_missing',
                severity: 'WARNING',
                message: `Master UI component missing on clone: ${name}`,
                context: {
                  component: name,
                  expected: true,
                  actual: false
                }
              });
            }
          }
        }

        return issues;
      }, { configComponents: options.components || {}, baseline: options.baseline });
      
      // Add DOM issues to main issues array
      for (const domIssue of domHealth) {
        addIssue(domIssue.type, domIssue.severity, domIssue.message, domIssue.context);
      }

      // Determine page status
      const hasFail = issues.some(i => i.severity === STATUS.FAIL);
      const hasWarning = issues.some(i => i.severity === STATUS.WARNING);
      
      if (hasFail) {
        pageStatus = STATUS.FAIL;
      } else if (hasWarning) {
        pageStatus = STATUS.WARNING;
      }

      duration = Math.round(performance.now() - startTime);

    } catch (err) {
      duration = Math.round(performance.now() - startTime);
      pageStatus = STATUS.FAIL;
      
      addIssue('navigation_error', STATUS.FAIL, err.message);
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
    }
    
    const result = {
      url,
      finalUrl,
      status: pageStatus,
      duration,
      issues
    };

    // Keep legacy arrays for compatibility if needed, or remove them. 
    // We'll keep them empty to not break legacy test interfaces, but issues is the new standard.
    result.consoleErrors = issues.filter(i => i.type === 'console_error').map(i => i.message);
    result.pageErrors = issues.filter(i => i.type === 'page_error').map(i => i.message);
    result.failedRequests = issues.filter(i => i.type === 'failed_resource').map(i => i.message);

    // Screenshot handling for FAIL
    if (pageStatus === STATUS.FAIL) {
      if (screenshotMode === 'failure-only' || screenshotMode === 'always') {
        try {
          if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
          }
          const safeUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${websiteId}-${browserName}-${safeUrl}-${timestamp}.png`;
          const filepath = path.join(screenshotDir, filename);
          
          await page.screenshot({ path: filepath, fullPage: false });
          result.screenshot = filepath;
          result.error = issues.find(i => i.severity === STATUS.FAIL)?.message || 'Page Check Failed';
        } catch (screenshotErr) {
          result.screenshotError = `Failed to capture screenshot: ${screenshotErr.message}`;
        }
      }
    }

    return result;
  }
}

module.exports = PageChecker;
