'use strict';

const { STATUS } = require('../models/ValidationResult');

class ResultAggregator {
  constructor() {
    this.results = [];
  }

  /**
   * Add a ValidationResult to the collection.
   * 
   * @param {import('../models/ValidationResult').ValidationResult} result 
   */
  add(result) {
    const errors = result.validate();
    if (errors.length > 0) {
      throw new Error(`Invalid ValidationResult: ${errors.join(', ')}`);
    }
    this.results.push(result);
  }

  /**
   * Get overall summary statistics.
   * 
   * @returns {object}
   */
  getSummary() {
    const summary = {
      total: this.results.length,
      [STATUS.PASS]: 0,
      [STATUS.FAIL]: 0,
      [STATUS.WARNING]: 0,
      [STATUS.SKIP]: 0,
      [STATUS.ERROR]: 0,
      totalDurationMs: 0
    };

    for (const res of this.results) {
      summary[res.status]++;
      summary.totalDurationMs += res.duration || 0;
    }

    return summary;
  }

  /**
   * Get results grouped by website ID.
   * 
   * @returns {Map<string, import('../models/ValidationResult').ValidationResult[]>}
   */
  getByWebsite() {
    const grouped = new Map();
    for (const res of this.results) {
      if (!grouped.has(res.websiteId)) {
        grouped.set(res.websiteId, []);
      }
      grouped.get(res.websiteId).push(res);
    }
    return grouped;
  }

  /**
   * Get all results.
   * 
   * @returns {import('../models/ValidationResult').ValidationResult[]}
   */
  getAll() {
    return [...this.results];
  }
}

module.exports = ResultAggregator;
