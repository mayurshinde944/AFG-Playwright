/**
 * ValidationResult Model
 *
 * Normalized result produced by any validator.
 * The Result Aggregator collects these; reporting adapters consume them.
 *
 * See: ARCHITECTURE.md §8, §14
 */

'use strict';

/** Allowed validation result statuses. */
const STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARNING: 'WARNING',
  SKIP: 'SKIP',
  ERROR: 'ERROR',
});

class ValidationResult {
  /**
   * @param {object} params
   * @param {string} params.websiteId
   * @param {string} params.validatorName
   * @param {string} params.status - One of STATUS values
   * @param {string} [params.message='']
   * @param {object} [params.details={}]
   * @param {number} [params.duration=0] - Duration in milliseconds
   * @param {string} [params.timestamp] - ISO 8601 string
   * @param {object} [params.evidence={}] - Screenshots, console errors, etc.
   * @param {boolean} [params.handledRetries=false] - Whether the validator handled retries internally
   * @param {object} [params.metrics={}] - High-level metrics for reporting
   * @param {Array} [params.pages=[]] - Granular page-level results
   */
  constructor({ websiteId, validatorName, status, message, details, duration, timestamp, evidence, handledRetries, metrics, pages }) {
    this.websiteId = websiteId;
    this.validatorName = validatorName;
    this.status = status;
    this.message = message || '';
    this.details = details || {};
    this.duration = duration || 0;
    this.timestamp = timestamp || new Date().toISOString();
    this.evidence = evidence || {};
    this.handledRetries = handledRetries || false;
    this.metrics = metrics || {};
    this.pages = pages || [];
  }

  /**
   * Validate that the result has required fields and a valid status.
   *
   * @returns {string[]} Array of validation error messages
   */
  validate() {
    const errors = [];
    if (!this.websiteId) errors.push('websiteId is required');
    if (!this.validatorName) errors.push('validatorName is required');
    if (!this.status) errors.push('status is required');
    if (this.status && !Object.values(STATUS).includes(this.status)) {
      errors.push(`status must be one of: ${Object.values(STATUS).join(', ')}`);
    }
    return errors;
  }

  /** @returns {boolean} */
  isPassed() {
    return this.status === STATUS.PASS;
  }

  /** @returns {boolean} */
  isFailed() {
    return this.status === STATUS.FAIL;
  }

  /** @returns {boolean} */
  isWarning() {
    return this.status === STATUS.WARNING;
  }
}

module.exports = { ValidationResult, STATUS };
