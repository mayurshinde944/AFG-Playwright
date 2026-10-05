/**
 * ExecutionRequest Model
 *
 * Represents what the user or Jenkins requested.
 * Must NOT contain the final resolved website list or calculated execution plan.
 *
 * See: ARCHITECTURE.md §6
 */

'use strict';

const VALID_SCOPE_TYPES = ['random', 'specific', 'all', 'adhoc'];
const VALID_MODES = ['execute', 'preview'];

class ExecutionRequest {
  /**
   * @param {object} params
   * @param {object} params.scope - { type: 'random'|'specific'|'all', count?, websites? }
   * @param {string} [params.preset] - e.g. 'DAILY_QA', 'INFRASTRUCTURE'
   * @param {string} [params.mode='execute'] - 'execute' or 'preview'
   * @param {string[]} [params.validators] - Explicit validator list (overrides preset)
   * @param {string[]} [params.browsers] - Explicit browser list
   * @param {object} [params.viewports] - Explicit viewport configuration
   * @param {object} [params.crawlSettings] - { maxPages, ... }
   * @param {number} [params.retries] - Override max retries
   * @param {string} [params.screenshots] - Override screenshot mode
   * @param {boolean} [params.forceOverride=false] - Override safety policy
   */
  constructor({
    scope,
    preset,
    mode = 'execute',
    validators,
    browsers,
    viewports,
    crawlSettings,
    retries,
    screenshots,
    forceOverride = false,
  }) {
    this.scope = scope;
    this.preset = preset || null;
    this.mode = mode;
    this.validators = validators || null;
    this.browsers = browsers || null;
    this.viewports = viewports || null;
    this.crawlSettings = crawlSettings || null;
    this.retries = retries !== undefined ? retries : undefined;
    this.screenshots = screenshots || null;
    this.forceOverride = forceOverride;
  }

  /**
   * Validate the request structure.
   *
   * @returns {string[]} Array of validation error messages
   */
  validate() {
    const errors = [];

    if (!this.scope) {
      errors.push('scope is required');
      return errors;
    }

    if (!this.scope.type) {
      errors.push('scope.type is required');
    } else if (!VALID_SCOPE_TYPES.includes(this.scope.type)) {
      errors.push(`scope.type must be one of: ${VALID_SCOPE_TYPES.join(', ')}`);
    }

    if (!VALID_MODES.includes(this.mode)) {
      errors.push(`mode must be one of: ${VALID_MODES.join(', ')}`);
    }

    if (this.scope.type === 'specific') {
      if (!this.scope.websites || !Array.isArray(this.scope.websites) || this.scope.websites.length === 0) {
        errors.push('scope.websites is required for specific scope');
      }
    }

    if (this.scope.type === 'adhoc') {
      if (!this.scope.url || typeof this.scope.url !== 'string') {
        errors.push('scope.url is required for adhoc scope');
      }
    }

    if (this.scope.type === 'random' && this.scope.count !== undefined) {
      if (typeof this.scope.count !== 'number' || this.scope.count < 1) {
        errors.push('scope.count must be a positive number');
      }
    }

    return errors;
  }

  /**
   * @returns {boolean} Whether this is a preview/dry-run request
   */
  isPreview() {
    return this.mode === 'preview';
  }
}

module.exports = ExecutionRequest;
