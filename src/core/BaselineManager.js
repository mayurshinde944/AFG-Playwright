'use strict';

const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const PageChecker = require('../validators/ui/PageChecker');

class BaselineManager {
  /**
   * Load the baseline from disk.
   * @param {string} filepath 
   * @returns {object|null} The baseline object, or null if missing
   */
  static load(filepath) {
    if (!filepath) return null;
    
    try {
      if (!fs.existsSync(filepath)) {
        return null; // Missing baseline is handled gracefully
      }
      
      const data = fs.readFileSync(filepath, 'utf8');
      const parsed = JSON.parse(data);
      
      this.validate(parsed);
      return parsed;
    } catch (err) {
      // Throw error to be caught and logged by caller so we don't silently fail
      throw new Error(`Failed to load baseline from ${filepath}: ${err.message}`);
    }
  }

  /**
   * Validate the schema of the baseline object.
   * @param {object} baselineData 
   * @throws {Error} if invalid
   */
  static validate(baselineData) {
    if (!baselineData) {
      throw new Error('Baseline data is empty');
    }
    if (baselineData.schemaVersion !== '1.1') {
      throw new Error('Unsupported baseline schema version. Expected 1.1');
    }
    if (!baselineData.masterUrl) {
      throw new Error('Missing masterUrl in baseline');
    }
    if (!baselineData.globalComponents || typeof baselineData.globalComponents !== 'object') {
      throw new Error('Missing globalComponents in baseline');
    }
  }

  /**
   * Safely write the baseline to disk.
   * @param {object} baselineData 
   * @param {string} filepath 
   */
  static save(baselineData, filepath) {
    this.validate(baselineData);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Adding updatedAt if missing
    if (!baselineData.updatedAt) {
      baselineData.updatedAt = new Date().toISOString();
    }
    
    const tempFilepath = `${filepath}.tmp`;
    fs.writeFileSync(tempFilepath, JSON.stringify(baselineData, null, 2), 'utf8');
    fs.renameSync(tempFilepath, filepath);
  }

  /**
   * Generate a new baseline by visiting the master URL.
   * @param {string} masterUrl 
   * @param {object} config 
   * @returns {Promise<object>}
   */
  static async generate(masterUrl, config = {}) {
    let browser = null;
    let context = null;
    let page = null;
    
    try {
      // Respect configured browser if present, default to chromium
      const browserName = config.ui?.browser || 'chromium';
      let browserType = chromium;
      if (browserName === 'firefox') browserType = firefox;
      else if (browserName === 'webkit') browserType = webkit;
      
      const isHeaded = config.ui?.headed === true;
      browser = await browserType.launch({ headless: !isHeaded });
      context = await browser.newContext();
      page = await context.newPage();
      
      const timeoutMs = config.ui?.pageTimeoutMs || config.ui?.timeoutMs || 30000;
      const response = await page.goto(masterUrl, { timeout: timeoutMs, waitUntil: 'load' });
      
      if (!response || !response.ok()) {
        const statusCode = response ? response.status() : 'Unknown';
        throw new Error(`Navigation failed with status: ${statusCode}`);
      }
      
      await page.waitForSelector('body', { timeout: 5000 });
      
      const configComponents = config.ui?.components || {};
      
      // Evaluate the DOM specifically to find global components
      const detectedComponents = await page.evaluate((configComps) => {
        const results = {};
        
        const detectComponent = (name, defaultSelector) => {
          const selectorString = configComps[name] || defaultSelector;
          // default selectors are usually comma-separated lists of potential selectors
          const selectors = selectorString.split(',').map(s => s.trim()).filter(s => s);
          
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (el) {
                return { 
                  exists: true, 
                  detectedSelector: sel,
                  tagName: el.tagName,
                  childCount: el.children.length
                };
              }
            } catch (e) {
              // ignore invalid selector error
            }
          }
          return { exists: false, detectedSelector: null, tagName: null, childCount: 0 };
        };

        const headerResult = detectComponent('header', 'header, .site-header, [data-elementor-type="header"], .elementor-location-header');
        if (headerResult.exists) results.header = headerResult;

        const logoResult = detectComponent('logo', '.site-logo, .custom-logo, img[alt*="logo" i], .header-logo');
        if (logoResult.exists) results.logo = logoResult;

        const navResult = detectComponent('navigation', 'nav, .main-navigation, .site-navigation, .elementor-nav-menu');
        if (navResult.exists) results.navigation = navResult;

        const footerResult = detectComponent('footer', 'footer, .site-footer, [data-elementor-type="footer"], .elementor-location-footer');
        if (footerResult.exists) results.footer = footerResult;

        return results;
      }, configComponents);
      
      const baselineData = {
        schemaVersion: '1.1',
        masterUrl,
        updatedAt: new Date().toISOString(),
        globalComponents: detectedComponents
      };
      
      this.validate(baselineData);
      
      return baselineData;
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }
}

module.exports = BaselineManager;
