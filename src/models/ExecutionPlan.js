/**
 * ExecutionPlan Model
 *
 * Represents what will actually execute — fully resolved from an ExecutionRequest.
 * Contains the resolved website list, validators, browsers, viewports, and all settings.
 *
 * See: ARCHITECTURE.md §7
 */

'use strict';

class ExecutionPlan {
  /**
   * @param {object} params
   * @param {string} params.scope - Resolved scope type ('random', 'specific', 'all')
   * @param {import('./Website')[]} params.websites - Resolved website list
   * @param {string[]} params.validators - Resolved validator names
   * @param {string[]} params.browsers - Resolved browser list
   * @param {object} params.viewports - Resolved viewport configuration
   * @param {object} params.concurrency - { infrastructureConcurrency, browserWorkers }
   * @param {number} params.maxRetries
   * @param {string} params.screenshotMode - 'off', 'failure-only', 'always'
   * @param {number} params.maxPages - Max pages per website for crawling
   * @param {string} params.mode - 'execute' or 'preview'
   * @param {boolean} [params.forceOverride=false]
   */
  constructor({
    scope,
    websites,
    validators,
    browsers,
    viewports,
    concurrency,
    maxRetries,
    screenshotMode,
    maxPages,
    mode,
    forceOverride = false,
  }) {
    this.scope = scope;
    this.websites = websites || [];
    this.validators = validators || [];
    this.browsers = browsers || [];
    this.viewports = viewports || {};
    this.concurrency = concurrency || {};
    this.maxRetries = maxRetries !== undefined ? maxRetries : 2;
    this.screenshotMode = screenshotMode || 'failure-only';
    this.maxPages = maxPages || 20;
    this.mode = mode || 'execute';
    this.forceOverride = forceOverride;
  }

  /**
   * Produce a human-readable summary for preview/dry-run display.
   *
   * @returns {string}
   */
  toSummary() {
    const lines = [
      '═══════════════════════════════════════════════',
      '  AFG Automation — Execution Plan Preview',
      '═══════════════════════════════════════════════',
      '',
      `  Scope:              ${this.scope}`,
      `  Websites:           ${this.websites.length}`,
      `  Validators:         ${this.validators.join(', ')}`,
      `  Browsers:           ${this.browsers.join(', ')}`,
      `  Viewports:          ${Object.keys(this.viewports).join(', ')}`,
      `  Max pages/site:     ${this.maxPages}`,
      `  Browser workers:    ${this.concurrency.browserWorkers}`,
      `  Infra concurrency:  ${this.concurrency.infrastructureConcurrency}`,
      `  Max retries:        ${this.maxRetries}`,
      `  Screenshots:        ${this.screenshotMode}`,
      `  Mode:               ${this.mode}`,
      `  Force override:     ${this.forceOverride}`,
      '',
      '  Websites selected:',
    ];

    for (const site of this.websites) {
      const status = site.isActive() ? 'active' : 'INACTIVE';
      const tested = site.lastTestedAt || 'never';
      lines.push(`    - ${site.id} | ${site.name} | ${site.url} [${status}] (last: ${tested})`);
    }

    lines.push('');
    lines.push('═══════════════════════════════════════════════');

    return lines.join('\n');
  }
}

module.exports = ExecutionPlan;
