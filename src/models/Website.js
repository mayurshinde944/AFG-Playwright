/**
 * Website Model
 *
 * Represents a website record from the inventory.
 * Contains website metadata only, not validator results.
 *
 * See: ARCHITECTURE.md §5
 */

'use strict';

/**
 * Parse various representations of an active/inactive flag.
 * Defaults to true (active) if the value is empty or unrecognized.
 *
 * @param {*} value - Raw value from inventory record
 * @returns {boolean}
 */
function parseActive(value) {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const str = String(value).toLowerCase().trim();
  return str === 'true' || str === 'yes' || str === '1' || str === 'active';
}

class Website {
  /**
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.name
   * @param {string} params.url
   * @param {boolean} [params.active=true]
   * @param {string} [params.domainType='smartonline']
   * @param {string|null} [params.lastTestedAt=null]
   * @param {string|null} [params.lastStatus=null]
   */
  constructor({ id, name, url, active, domainType, lastTestedAt, lastStatus }) {
    this.id = id || null;
    this.name = name || null;
    this.url = url || null;
    this.active = active !== undefined ? Boolean(active) : true;
    this.domainType = domainType || 'smartonline';
    this.lastTestedAt = lastTestedAt || null;
    this.lastStatus = lastStatus || null;
  }

  /**
   * Create a Website from a raw inventory record.
   * Handles common column name variations.
   *
   * @param {object} record - Raw row from CSV/Excel
   * @returns {Website}
   */
  static fromRecord(record) {
    return new Website({
      id: record.id || record.ID || record.website_id || record.websiteId || null,
      name: record.name || record.Name || record.website_name || record.websiteName || record.id || record.ID || null,
      url: record.url || record.URL || record.website_url || record.websiteUrl || record.website || null,
      active: parseActive(
        record.active !== undefined ? record.active :
        record.Active !== undefined ? record.Active :
        record.status !== undefined ? record.status :
        record.Status !== undefined ? record.Status :
        undefined
      ),
      domainType: record.domainType || record.domain_type || record.DomainType || 'smartonline',
      lastTestedAt: record.lastTestedAt || record.last_tested_at || record.LastTestedAt || null,
      lastStatus: record.lastStatus || record.last_status || record.LastStatus || null,
    });
  }

  /**
   * Validate required fields.
   *
   * @returns {string[]} Array of validation error messages (empty if valid)
   */
  validate() {
    const errors = [];
    if (!this.id) errors.push('id is required');
    if (!this.name) errors.push('name is required');
    if (!this.url) errors.push('url is required');
    return errors;
  }

  /**
   * @returns {boolean} Whether this website is active in the inventory
   */
  isActive() {
    return this.active === true;
  }
}

module.exports = Website;
