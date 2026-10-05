'use strict';

const xlsx = require('xlsx');

class OperationalExcelReportWriter {
  /**
   * Write operational validation results (DNS, SSL, HTTP) to an Excel file.
   * 
   * @param {import('../../models/ValidationResult').ValidationResult[]} results 
   * @param {string} filepath 
   * @param {string} scopeType e.g., 'random', 'specific', 'all'
   */
  static async write(results, filepath, scopeType) {
    const wb = xlsx.utils.book_new();

    const summaryData = this._generateSummaryData(results, scopeType);
    const operationalData = this._generateOperationalData(results);

    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(summaryData), 'Run Summary');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(operationalData), 'Operational Report');

    xlsx.writeFile(wb, filepath);
  }

  static _generateSummaryData(results, scopeType) {
    let totalWebsites = new Set();
    let durationMs = 0;
    let passes = 0;
    let fails = 0;
    let warnings = 0;
    let errors = 0;

    for (const res of results) {
      totalWebsites.add(res.websiteId);
      durationMs += res.duration || 0;
      if (res.status === 'PASS') passes++;
      if (res.status === 'FAIL') fails++;
      if (res.status === 'WARNING') warnings++;
      if (res.status === 'ERROR') errors++;
    }

    const now = new Date();
    // Helper to format local time HH:mm:ss safely
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });

    return [{
      'Run Date': now.toISOString().split('T')[0],
      'Run Time': timeString,
      'Scope': (scopeType || 'UNKNOWN').toUpperCase(),
      'Websites Tested': totalWebsites.size,
      'Validators Executed': results.length,
      'Total Passes': passes,
      'Total Warnings': warnings,
      'Total Fails': fails,
      'Total Errors': errors,
      'Overall Execution Status': (fails > 0 || errors > 0) ? 'FAILED' : (warnings > 0 ? 'WARNING' : 'PASSED'),
      'Duration (s)': (durationMs / 1000).toFixed(2)
    }];
  }

  static _generateOperationalData(results) {
    // Group by website ID
    const websiteMap = new Map();

    for (const res of results) {
      if (!websiteMap.has(res.websiteId)) {
        websiteMap.set(res.websiteId, {
          'Website ID': res.websiteId,
          'Website': res.details?.originalUrl || res.details?.finalUrl || res.websiteId,
          // DNS Columns
          'DNS Status': '',
          'DNS Details': '',
          // SSL Columns
          'SSL Status': '',
          'SSL Certificate Expiry Date': '',
          'SSL Certificate Details': '',
          // HTTP Columns
          'HTTP Status': '',
          'HTTP Status Code': '',
          'HTTP Details': '',
          // Aggregated Message
          'Message': ''
        });
      }

      const row = websiteMap.get(res.websiteId);
      
      // Update the URL if we found a better one
      if (res.details?.originalUrl) {
        row['Website'] = res.details.originalUrl;
      }

      const appendMessage = (msg) => {
        if (msg) {
          row['Message'] = row['Message'] ? `${row['Message']} | [${res.validatorName}] ${msg}` : `[${res.validatorName}] ${msg}`;
        }
      };

      appendMessage(res.message);

      if (res.validatorName === 'dns') {
        row['DNS Status'] = res.status;
        const cnames = res.details?.cnames ? res.details.cnames.join(', ') : '';
        const ips = res.details?.ipAddresses ? res.details.ipAddresses.join(', ') : '';
        row['DNS Details'] = [cnames ? `CNAMEs: ${cnames}` : '', ips ? `IPs: ${ips}` : ''].filter(Boolean).join('; ');
      } 
      else if (res.validatorName === 'ssl') {
        row['SSL Status'] = res.status;
        const certNorm = res.details?.certificateNormalized;
        if (certNorm) {
          if (certNorm.validTo) {
             row['SSL Certificate Expiry Date'] = certNorm.validTo;
          }
          row['SSL Certificate Details'] = `Subject: ${certNorm.subject}, Issuer: ${certNorm.issuer}, Days Remaining: ${certNorm.daysRemaining}`;
        } else {
          row['SSL Certificate Details'] = res.details?.errorDetails?.message || '';
        }
      }
      else if (res.validatorName === 'http') {
        row['HTTP Status'] = res.status;
        row['HTTP Status Code'] = res.details?.statusCode || '';
        const redirects = (res.details?.finalUrl !== res.details?.originalUrl) ? `Redirected to ${res.details?.finalUrl}` : '';
        row['HTTP Details'] = redirects;
      }
    }

    return Array.from(websiteMap.values());
  }
}

module.exports = OperationalExcelReportWriter;
