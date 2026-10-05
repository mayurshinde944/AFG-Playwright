'use strict';

const dns = require('dns').promises;
const { ValidationResult, STATUS } = require('../../models/ValidationResult');

class DnsValidator {
  /**
   * Validate a website's DNS configuration.
   * 
   * @param {import('../../models/Website')} website 
   * @param {object} context 
   * @param {object} context.config - The resolved global configuration
   * @returns {Promise<ValidationResult>}
   */
  async validate(website, context) {
    const config = context.config;
    const timeoutMs = config.dns.timeoutMs || 5000;
    const baseDomain = config.dns.smartonlineBaseDomain;

    let resultDetails;

    // Remove protocol and trailing paths from URL to get the raw hostname
    let hostname;
    try {
      hostname = new URL(website.url).hostname;
    } catch (err) {
      return this._buildResult(website.id, STATUS.ERROR, `Invalid URL format: ${website.url}`, { error: err.message });
    }

    try {
      resultDetails = await this._resolveWithTimeout(hostname, timeoutMs);
    } catch (err) {
      return this._buildResult(website.id, STATUS.FAIL, `DNS resolution failed: ${err.message}`, {}, err);
    }

    return this._evaluateRelationship(website, hostname, resultDetails, baseDomain);
  }

  /**
   * Perform DNS resolution (CNAME then A records) with a strict timeout.
   * The validator stops waiting after the configured timeout; the underlying DNS operation may not be cancellable.
   */
  async _resolveWithTimeout(hostname, timeoutMs) {
    let timerId;
    const timeoutTask = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('DNS resolution timeout')), timeoutMs);
    });

    const resolveTask = (async () => {
      let cnames = [];
      let ipAddresses = [];

      try {
        cnames = await dns.resolveCname(hostname);
      } catch (err) {
        if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
          throw err;
        }
      }

      try {
        ipAddresses = await dns.resolve4(hostname);
      } catch (err) {
        if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
          throw err;
        }
      }

      if (cnames.length === 0 && ipAddresses.length === 0) {
        throw new Error('ENOTFOUND: No CNAME or A records found');
      }

      return { cnames, ipAddresses };
    })();

    try {
      const result = await Promise.race([resolveTask, timeoutTask]);
      return result;
    } finally {
      clearTimeout(timerId);
      resolveTask.catch(() => {});
    }
  }

  /**
   * Evaluate the relationship against SmartOnline patterns.
   */
  _evaluateRelationship(website, hostname, details, baseDomain) {
    let isSmartOnlineRelationship = false;

    if (details.cnames && details.cnames.length > 0) {
      // The relationship should be established from the resolved DNS target/records.
      isSmartOnlineRelationship = details.cnames.some(cname => this._matchesBaseDomain(cname, baseDomain));
    } else {
      // If no CNAMEs exist, we evaluate the hostname itself (direct A record).
      isSmartOnlineRelationship = this._matchesBaseDomain(hostname, baseDomain);
    }

    if (website.domainType === 'smartonline') {
      if (isSmartOnlineRelationship) {
        return this._buildResult(website.id, STATUS.PASS, `Resolved with recognized SmartOnline relationship`, details);
      } else {
        return this._buildResult(website.id, STATUS.WARNING, `Resolved, but missing recognized SmartOnline relationship for a SmartOnline domain`, details);
      }
    } else {
      // Custom domain
      if (isSmartOnlineRelationship) {
        return this._buildResult(website.id, STATUS.PASS, `Resolved to known SmartOnline infrastructure`, details);
      } else {
        // It resolves, but it's external or unrecognized. The site is up, so it's a WARNING/REVIEW.
        return this._buildResult(website.id, STATUS.WARNING, `Resolved to external/unrecognized infrastructure`, details);
      }
    }
  }

  /**
   * Matches a target string against the base domain using proper label boundary checks.
   */
  _matchesBaseDomain(target, baseDomain) {
    if (!target) return false;
    const lowerTarget = target.toLowerCase();
    const lowerBase = baseDomain.toLowerCase();
    return lowerTarget === lowerBase || lowerTarget.endsWith('.' + lowerBase);
  }

  _buildResult(websiteId, status, message, details = {}, evidenceError = null) {
    const evidence = evidenceError ? { 
      error: evidenceError.message,
      code: evidenceError.code,
      stack: evidenceError.stack 
    } : {};

    return new ValidationResult({
      websiteId,
      validatorName: 'dns',
      status,
      message,
      details,
      evidence
    });
  }
}

module.exports = DnsValidator;
