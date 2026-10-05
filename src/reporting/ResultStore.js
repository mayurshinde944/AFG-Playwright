'use strict';

const fs = require('fs');
const path = require('path');
const { getLogger } = require('../logging/Logger');

class ResultStore {
  /**
   * Generates a unique Run ID.
   * Format: YYYYMMDD-HHMMSS-xxxxxx
   */
  static generateRunId() {
    const now = new Date();
    const date = now.toISOString().split('T')[0].replace(/-/g, '');
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
    const random = Math.random().toString(16).substring(2, 8);
    return `${date}-${time}-${random}`;
  }

  /**
   * Save the execution results to a persistent JSON file.
   * 
   * @param {object} params
   * @param {string} params.runId
   * @param {import('../models/ExecutionRequest')} params.request
   * @param {import('../models/ExecutionPlan')} params.plan
   * @param {import('../models/ValidationResult').ValidationResult[]} params.results
   * @param {object} params.summary
   * @param {string} params.startedAt
   * @param {string} params.completedAt
   * @param {number} params.duration
   * @param {object} params.config
   */
  static async saveRun({ runId, request, plan, results, summary, startedAt, completedAt, duration, config }) {
    const logger = getLogger();
    
    try {
      const historyDir = path.resolve(config.reporting?.historyDir || './artifacts/history/runs');
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      let runStatus = 'COMPLETED';
      if (summary.FAIL > 0 || summary.ERROR > 0) {
        runStatus = 'FAILED';
      }
      
      const record = {
        execution: {
          runId,
          startedAt,
          completedAt,
          duration,
          scope: plan.scope,
          requestedValidators: plan.validators,
          status: runStatus,
          summary
        },
        websites: plan.websites.map(site => ({
          websiteId: site.id,
          url: site.url,
          name: site.name
        })),
        results: results.map(res => {
          const safeDetails = { ...(res.details || {}) };
          delete safeDetails.certificateRaw;

          return {
            websiteId: res.websiteId,
            validatorName: res.validatorName,
            status: res.status,
            duration: res.duration,
            message: res.message,
            error: res.evidence?.error || null,
            warnings: res.status === 'WARNING' ? res.message : null,
            metrics: res.metrics || {},
            details: safeDetails,
            pages: res.pages || []
          };
        })
      };

      const datePrefix = startedAt.split('T')[0]; // YYYY-MM-DD
      const filePath = path.join(historyDir, `${datePrefix}_${runId}.json`);
      
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
      logger.info(`Execution history securely saved to ${filePath}`);
    } catch (err) {
      logger.error(`Failed to persist execution history: ${err.message}`, err);
    }
  }

  /**
   * Retrieve execution results by Run ID.
   * 
   * @param {string} runId 
   * @param {object} config 
   * @returns {object|null}
   */
  static async getRun(runId, config = {}) {
    try {
      const historyDir = path.resolve(config.reporting?.historyDir || './artifacts/history/runs');
      if (!fs.existsSync(historyDir)) {
        return null;
      }
      const files = fs.readdirSync(historyDir);
      const targetFile = files.find(f => f.includes(runId));
      if (targetFile) {
        const content = fs.readFileSync(path.join(historyDir, targetFile), 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      // Ignored
    }
    return null;
  }

  /**
   * Retrieve all execution results for a specific date.
   * 
   * @param {string} date - Date string in YYYY-MM-DD format
   * @param {object} config
   * @returns {object[]}
   */
  static async getRunsByDate(date, config = {}) {
    try {
      const historyDir = path.resolve(config.reporting?.historyDir || './artifacts/history/runs');
      if (!fs.existsSync(historyDir)) {
        return [];
      }
      const files = fs.readdirSync(historyDir);
      const targetFiles = files.filter(f => f.startsWith(date) && f.endsWith('.json'));
      
      const runs = [];
      for (const file of targetFiles) {
        try {
          const content = fs.readFileSync(path.join(historyDir, file), 'utf-8');
          runs.push(JSON.parse(content));
        } catch (e) {
          // ignore corrupted individual run file
        }
      }
      return runs;
    } catch (err) {
      return [];
    }
  }

  /**
   * Retrieve all execution results from today.
   * 
   * @param {object} config
   * @returns {object[]}
   */
  static async getTodayRuns(config = {}) {
    const today = new Date().toISOString().split('T')[0];
    return this.getRunsByDate(today, config);
  }

  /**
   * Retrieves up to 50 most recent executions for a given website ID or URL.
   *
   * @param {string} identifier - websiteId or url
   * @param {object} config
   * @returns {object[]}
   */
  static async getWebsiteHistory(identifier, config = {}) {
    if (!identifier) return [];
    
    const historyDir = path.resolve(config.reporting?.historyDir || './artifacts/history/runs');
    if (!fs.existsSync(historyDir)) {
      return [];
    }

    const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
    // Sort files chronologically descending (newest first).
    files.sort().reverse();

    const lowerId = identifier.toLowerCase();
    const normalizeUrl = (url) => url ? url.toLowerCase().replace(/\/$/, '') : '';
    const normIdentifier = normalizeUrl(lowerId);

    const history = [];

    for (const file of files) {
      if (history.length >= 50) break;

      try {
        const content = fs.readFileSync(path.join(historyDir, file), 'utf-8');
        const data = JSON.parse(content);
        
        if (!data.execution || !data.websites || !data.results) continue;

        // Check if website matches
        const matchedWebsite = data.websites.find(w => {
          if (w.websiteId && w.websiteId.toLowerCase() === lowerId) return true;
          if (w.url && normalizeUrl(w.url) === normIdentifier) return true;
          return false;
        });

        if (matchedWebsite) {
          // Calculate website-specific status
          const siteResults = data.results.filter(r => r.websiteId === matchedWebsite.websiteId);
          let overallStatus = 'UNKNOWN';
          
          if (siteResults.length > 0) {
            let hasFail = false;
            let hasWarning = false;
            let hasPass = false;

            for (const res of siteResults) {
              const s = res.status ? res.status.toUpperCase() : '';
              if (s === 'FAIL' || s === 'ERROR') hasFail = true;
              else if (s === 'WARNING') hasWarning = true;
              else if (s === 'PASS') hasPass = true;
            }

            if (hasFail) overallStatus = 'FAIL';
            else if (hasWarning) overallStatus = 'WARNING';
            else if (hasPass) overallStatus = 'PASS';
          }

          history.push({
            date: data.execution.startedAt ? data.execution.startedAt.split('T')[0] : '',
            runId: data.execution.runId,
            startedAt: data.execution.startedAt,
            completedAt: data.execution.completedAt,
            duration: data.execution.duration,
            websiteId: matchedWebsite.websiteId,
            url: matchedWebsite.url,
            name: matchedWebsite.name,
            overallStatus,
            validators: siteResults.map(r => ({
              validatorName: r.validatorName,
              status: r.status
            }))
          });
        }
      } catch (e) {
        // Safe skip malformed files
      }
    }

    return history;
  }
}

module.exports = ResultStore;
