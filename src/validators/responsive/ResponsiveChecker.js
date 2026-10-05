'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { STATUS } = require('../../models/ValidationResult');
const PageNavigator = require('../common/PageNavigator');

class ResponsiveChecker {
  /**
   * Validate responsive layout on a single page in a specific viewport context.
   *
   * @param {import('playwright').Page} page
   * @param {string} url
   * @param {object} viewport
   * @param {object} options
   * @returns {Promise<object>} Page result object
   */
  static async checkPage(page, url, viewport, options = {}) {
    const {
      timeoutMs = 30000,
      screenshotMode = 'failure-only',
      screenshotDir = './artifacts/screenshots',
      websiteId = 'unknown',
      browserName = 'chromium'
    } = options;

    const issues = [];
    const seenErrors = new Set();

    const addIssue = (type, severity, message, context = {}) => {
      const key = `${type}:${message}`;
      if (seenErrors.has(key)) return;
      seenErrors.add(key);
      issues.push({ type, severity, message, context: { ...context, viewport: viewport.name } });
    };

    const startTime = performance.now();
    let duration = 0;
    let finalUrl = url;
    let pageStatus = STATUS.PASS;

    try {
      const navResult = await PageNavigator.navigate(page, url, timeoutMs);
      finalUrl = navResult.finalUrl;

      // Evaluate responsive layout heuristics
      const layoutIssues = await page.evaluate(async (vp) => {
        const domIssues = [];
        const clientWidth = document.documentElement.clientWidth;

        // 1. Horizontal Overflow
        const scrollWidth = document.documentElement.scrollWidth;
        if (scrollWidth > clientWidth) {
          domIssues.push({
            type: 'horizontal_overflow',
            severity: 'FAIL',
            message: `Page horizontally overflows viewport (scrollWidth: ${scrollWidth}, clientWidth: ${clientWidth})`,
            context: { scrollWidth, clientWidth }
          });
        }

        // 2. Element Level Horizontal Overflow and Overlap
        const allElements = Array.from(document.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6, img, button, a, section, article, header, footer, nav, aside, ul, ol, li'));
        
        const isVisible = (el, style) => {
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return true;
        };

        const visibleElements = [];
        for (const el of allElements) {
          const style = window.getComputedStyle(el);
          if (isVisible(el, style)) {
            visibleElements.push({
              el,
              style,
              rect: el.getBoundingClientRect()
            });
          }
        }

        for (const item of visibleElements) {
          if (item.rect.right > clientWidth && item.rect.left < clientWidth) {
            if (item.rect.right - clientWidth > 5) {
              if (item.style.overflowX !== 'hidden' && item.style.overflow !== 'hidden' && item.style.overflowX !== 'clip') {
                domIssues.push({
                  type: 'element_overflow',
                  severity: 'WARNING',
                  message: `Element overflows viewport horizontally (${item.el.tagName})`,
                  context: { tag: item.el.tagName, className: item.el.className, right: item.rect.right }
                });
              }
            }
          }
        }

        // 3. Overlap Detection
        for (let i = 0; i < visibleElements.length; i++) {
          const a = visibleElements[i];
          const posA = a.style.position;
          if (posA === 'absolute' || posA === 'fixed' || posA === 'sticky') continue;

          for (let j = i + 1; j < visibleElements.length; j++) {
            const b = visibleElements[j];
            const posB = b.style.position;
            if (posB === 'absolute' || posB === 'fixed' || posB === 'sticky') continue;

            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;

            const rA = a.rect;
            const rB = b.rect;

            const intersectLeft = Math.max(rA.left, rB.left);
            const intersectRight = Math.min(rA.right, rB.right);
            const intersectTop = Math.max(rA.top, rB.top);
            const intersectBottom = Math.min(rA.bottom, rB.bottom);

            if (intersectLeft < intersectRight && intersectTop < intersectBottom) {
              const intersectWidth = intersectRight - intersectLeft;
              const intersectHeight = intersectBottom - intersectTop;
              const intersectArea = intersectWidth * intersectHeight;

              if (intersectArea < 25 || intersectWidth <= 5 || intersectHeight <= 5) continue;

              const areaA = rA.width * rA.height;
              const areaB = rB.width * rB.height;
              if (Math.abs(areaA - areaB) < 10 && intersectArea / Math.min(areaA, areaB) > 0.95) continue;

              if (parseFloat(a.style.marginTop) < 0 || parseFloat(a.style.marginBottom) < 0 || parseFloat(a.style.marginLeft) < 0 || parseFloat(a.style.marginRight) < 0 ||
                  parseFloat(b.style.marginTop) < 0 || parseFloat(b.style.marginBottom) < 0 || parseFloat(b.style.marginLeft) < 0 || parseFloat(b.style.marginRight) < 0) {
                continue;
              }

              domIssues.push({
                type: 'element_overlap',
                severity: 'WARNING',
                message: `Element overlap detected between ${a.el.tagName} and ${b.el.tagName}`,
                context: {
                  tagA: a.el.tagName, classA: a.el.className,
                  tagB: b.el.tagName, classB: b.el.className,
                  intersectArea
                }
              });
            }
          }
        }

        return domIssues;
      }, viewport);

      for (const layoutIssue of layoutIssues) {
        addIssue(layoutIssue.type, layoutIssue.severity, layoutIssue.message, layoutIssue.context);
      }

      const hasFail = issues.some(i => i.severity === STATUS.FAIL);
      const hasWarning = issues.some(i => i.severity === STATUS.WARNING);
      
      if (hasFail) {
        pageStatus = STATUS.FAIL;
      } else if (hasWarning) {
        pageStatus = STATUS.WARNING;
      }

    } catch (err) {
      pageStatus = STATUS.FAIL;
      addIssue('navigation_error', STATUS.FAIL, err.message);
    }

    duration = Math.round(performance.now() - startTime);

    const result = {
      url,
      finalUrl,
      status: pageStatus,
      duration,
      issues,
      viewport
    };

    if (pageStatus === STATUS.FAIL) {
      if (screenshotMode === 'failure-only' || screenshotMode === 'always') {
        try {
          if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
          }
          const safeUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${websiteId}-${browserName}-${viewport.name}-${safeUrl}-${timestamp}.png`;
          const filepath = path.join(screenshotDir, filename);
          
          await page.screenshot({ path: filepath, fullPage: false });
          result.screenshot = filepath;
          result.error = issues.find(i => i.severity === STATUS.FAIL)?.message || 'Responsive Check Failed';
        } catch (screenshotErr) {
          result.screenshotError = `Failed to capture screenshot: ${screenshotErr.message}`;
        }
      }
    }

    return result;
  }
}

module.exports = ResponsiveChecker;
