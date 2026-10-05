/**
 * AFG Automation — Default Configuration
 *
 * All values here match the documented defaults in AGENTS.md.
 * Configuration hierarchy: Defaults → Config File → CLI → Jenkins → Final Config.
 */

'use strict';

module.exports = {
  rotation: {
    count: 10,
  },

  concurrency: {
    infrastructureConcurrency: 5,
    browserWorkers: 1,
  },

  retry: {
    maxRetries: 2,
  },

  crawler: {
    maxPages: 20,
    sameDomainOnly: true,
    skipAuthenticated: true,
  },

  screenshots: {
    mode: 'failure-only', // 'off' | 'failure-only' | 'always'
    dir: './artifacts/screenshots',
  },

  history: {
    retentionDays: 30,
  },

  viewports: {
    mobile: { width: 390, height: 844 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1366, height: 768 },
  },

  browsers: ['chromium', 'firefox', 'webkit'],

  dns: {
    timeoutMs: 5000,
    smartonlineBaseDomain: 'smartonline.com.au',
  },

  ssl: {
    timeoutMs: 10000,
    maxRedirects: 5,
  },

  http: {
    timeoutMs: 10000,
    maxRedirects: 5,
  },

  ui: {
    timeoutMs: 30000, // Legacy/overall fallback if needed
    pageTimeoutMs: 30000,
    maxPages: 10,
    baselinePath: './config/baselines/master-ui-baseline.json',
  },

  visual: {
    mismatchThreshold: 0.05, // 0.05% threshold
    baselinesDir: './artifacts/visual/baselines',
    diffsDir: './artifacts/visual/diffs',
    actualsDir: './artifacts/visual/actuals',
    defaultMasks: [] // CSS selectors to explicitly mask (e.g. '.ad-banner')
  },

  // Presets define common validator combinations.
  // DAILY_QA intentionally excludes Visual (see ADR-035).
  presets: {
    DAILY_QA: {
      validators: ['dns', 'ssl', 'http', 'ui', 'responsive', 'cross-browser'],
    },
    INFRASTRUCTURE: {
      validators: ['dns', 'ssl', 'http'],
    },
  },

  // Validator classification for safety policy enforcement.
  validators: {
    lightweight: ['dns', 'ssl', 'http'],
    heavy: ['ui', 'responsive', 'cross-browser', 'visual'],
  },

  inventory: {
    path: './inventory/sample.csv',
  },

  reporting: {
    enabled: false, // disabled by default, enabled via CLI --report
    formats: ['excel'],
    outputDir: './artifacts/reports',
  },

  logging: {
    level: 'info',
    file: null,
  },
};
