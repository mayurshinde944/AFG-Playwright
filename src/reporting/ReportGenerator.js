'use strict';

const fs = require('fs');
const path = require('path');
const ExcelReportWriter = require('./writers/ExcelReportWriter');
const OperationalExcelReportWriter = require('./writers/OperationalExcelReportWriter');
const { getLogger } = require('../logging/Logger');

class ReportGenerator {
  /**
   * Generate enabled reports based on the configuration.
   * 
   * @param {import('../models/ValidationResult').ValidationResult[]} results 
   * @param {object} config 
   * @param {import('../models/ExecutionRequest')} [request]
   */
  static async generate(results, config, request = null) {
    const logger = getLogger();
    const reportingConfig = config.reporting || {};
    
    if (!reportingConfig.enabled) {
      return;
    }

    const formats = reportingConfig.formats || [];
    if (formats.length === 0) {
      return;
    }

    const outputDir = reportingConfig.outputDir || './artifacts/reports';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const now = new Date();
    const datePart = now.toISOString().split('T')[0];
    const timePart = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const timestamp = `${datePart}_${timePart}`;
    const scopeStr = (request && request.scope && request.scope.type) ? request.scope.type.toUpperCase() : 'UNKNOWN';

    if (formats.includes('excel')) {
      const executedValidators = new Set(results.map(r => r.validatorName));
      const lightweight = ['dns', 'ssl', 'http'];
      
      const hasLightweight = Array.from(executedValidators).some(v => lightweight.includes(v));
      const hasHeavy = Array.from(executedValidators).some(v => !lightweight.includes(v));

      const tasks = [];

      if (hasLightweight || (!hasLightweight && !hasHeavy)) {
        // Generate Operational Report (or if nothing ran at all)
        const filepath = path.join(outputDir, `QA_Operational_Report_${timestamp}_${scopeStr}.xlsx`);
        tasks.push(
          OperationalExcelReportWriter.write(results, filepath, scopeStr)
            .then(() => logger.info(`Operational Excel report successfully generated: ${filepath}`))
            .catch(err => logger.error(`Failed to generate Operational Excel report: ${err.message}`))
        );
      }

      if (hasHeavy) {
        // Generate Detailed Report
        const filepath = path.join(outputDir, `QA_Detailed_Report_${timestamp}_${scopeStr}.xlsx`);
        tasks.push(
          ExcelReportWriter.write(results, filepath)
            .then(() => logger.info(`Detailed Excel report successfully generated: ${filepath}`))
            .catch(err => logger.error(`Failed to generate Detailed Excel report: ${err.message}`))
        );
      }

      await Promise.all(tasks);
    }

    // Perform non-blocking cleanup
    this._cleanupOldReports(outputDir, logger);
  }

  static _cleanupOldReports(outputDir, logger) {
    const retentionDays = 7;
    const now = Date.now();
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = now - retentionMs;

    const reportRegex = /^QA_(Operational|Detailed)_Report_.*\.xlsx$/;

    fs.readdir(outputDir, (err, files) => {
      if (err) {
        logger.warn(`Failed to read report directory for cleanup: ${err.message}`);
        return;
      }

      for (const file of files) {
        if (reportRegex.test(file)) {
          const filepath = path.join(outputDir, file);
          fs.stat(filepath, (statErr, stats) => {
            if (statErr) {
              logger.warn(`Failed to stat file during cleanup (${file}): ${statErr.message}`);
              return;
            }

            if (stats.mtimeMs < cutoffTime) {
              fs.unlink(filepath, (unlinkErr) => {
                if (unlinkErr) {
                  logger.warn(`Failed to delete old report (${file}): ${unlinkErr.message}`);
                } else {
                  logger.info(`Deleted old report: ${file}`);
                }
              });
            }
          });
        }
      }
    });
  }
}

module.exports = ReportGenerator;
