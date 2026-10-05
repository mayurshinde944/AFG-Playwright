'use strict';

const xlsx = require('xlsx');

class ExcelReportWriter {
  /**
   * Write validation results to an Excel file.
   * 
   * @param {import('../../models/ValidationResult').ValidationResult[]} results 
   * @param {string} filepath 
   */
  static async write(results, filepath) {
    const wb = xlsx.utils.book_new();

    // Generate Sheets
    const summaryData = this._generateSummaryData(results);
    const websitesData = this._generateWebsitesData(results);
    const pagesData = this._generatePagesData(results);
    const issuesData = this._generateIssuesData(results);

    // Append Sheets
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(summaryData), 'Summary');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(websitesData), 'Websites');
    
    if (pagesData.length > 0) {
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(pagesData), 'Pages');
    }
    
    if (issuesData.length > 0) {
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(issuesData), 'Issues');
    }

    // Write file
    xlsx.writeFile(wb, filepath);
  }

  static _generateSummaryData(results) {
    let totalWebsites = new Set();
    let durationMs = 0;
    let passes = 0;
    let fails = 0;
    let warnings = 0;
    let skips = 0;

    let totalPagesTested = 0;
    let totalPagesPassed = 0;
    let totalPagesWarnings = 0;
    let totalPagesFailed = 0;
    let totalIssues = 0;

    for (const res of results) {
      totalWebsites.add(res.websiteId);
      durationMs += res.duration || 0;
      if (res.status === 'PASS') passes++;
      if (res.status === 'FAIL') fails++;
      if (res.status === 'WARNING') warnings++;
      if (res.status === 'SKIP') skips++;

      // 1 & 2. Aggregate page metrics across ALL ValidationResult objects (UI primarily)
      if (res.metrics) {
        totalPagesTested += res.metrics.pagesTested || 0;
        totalPagesPassed += res.metrics.pagesPassed || 0;
        totalPagesWarnings += res.metrics.pagesWarnings || 0;
        totalPagesFailed += res.metrics.pagesFailed || 0;
      }

      // 4. Total Issues must represent the total number of structured issues across all pages
      if (res.pages && res.pages.length > 0) {
        for (const page of res.pages) {
          if (page.issues && page.issues.length > 0) {
            totalIssues += page.issues.length;
          }
        }
      } else {
        // 5. Lightweight validators or infrastructure errors
        if (res.status === 'FAIL' || res.status === 'WARNING' || res.status === 'ERROR') {
          totalIssues += 1;
        }
      }
    }

    return [{
      'Run Date': new Date().toISOString(),
      'Total Websites': totalWebsites.size,
      'Total Validators Executed': results.length,
      'Total Duration (s)': (durationMs / 1000).toFixed(2),
      'Total Passes': passes,
      'Total Warnings': warnings,
      'Total Fails': fails,
      'Total Skips': skips,
      'Total Pages Tested': totalPagesTested,
      'Total Pages Passed': totalPagesPassed,
      'Total Pages Warnings': totalPagesWarnings,
      'Total Pages Failed': totalPagesFailed,
      'Total Issues': totalIssues
    }];
  }

  static _generateWebsitesData(results) {
    return results.map(res => {
      const originalUrl = res.details?.originalUrl || res.websiteId; // fallback
      
      return {
        'Website ID': res.websiteId,
        'URL': originalUrl,
        'Validator': res.validatorName,
        'Status': res.status,
        'Duration (ms)': res.duration || 0,
        'Pages Tested': res.metrics?.pagesTested || (res.pages ? res.pages.length : 0),
        'Pages Passed': res.metrics?.pagesPassed || 0,
        'Pages Warnings': res.metrics?.pagesWarnings || 0,
        'Pages Failed': res.metrics?.pagesFailed || 0,
        'Message': res.message || ''
      };
    });
  }

  static _generatePagesData(results) {
    const data = [];
    for (const res of results) {
      if (res.pages && res.pages.length > 0) {
        for (const page of res.pages) {
          data.push({
            'Website ID': res.websiteId,
            'Validator': res.validatorName,
            'Page URL': page.url,
            'Final URL': page.finalUrl || page.url,
            'Status': page.status,
            'Duration (ms)': page.duration || 0,
            'Retries': page.retryAttempts || 0,
            'Viewport Name': page.viewport ? page.viewport.name : '',
            'Viewport Width': page.viewport ? page.viewport.width : '',
            'Viewport Height': page.viewport ? page.viewport.height : '',
            'Browser': page.browser || '',
            'Baseline Used': page.metrics?.baselinePath || '',
            'Mismatch %': page.metrics?.mismatchPercentage !== undefined ? page.metrics.mismatchPercentage : '',
            'Diff Pixels': page.metrics?.diffPixels !== undefined ? page.metrics.diffPixels : '',
            'Actual Artifact': page.metrics?.actualPath || '',
            'Diff Artifact': page.metrics?.diffPath || ''
          });
        }
      }
    }
    return data;
  }

  static _generateIssuesData(results) {
    const data = [];
    for (const res of results) {
      // 1. Page-level issues (UI)
      if (res.pages && res.pages.length > 0) {
        for (const page of res.pages) {
          if (page.issues && page.issues.length > 0) {
            for (const issue of page.issues) {
              data.push({
                'Website ID': res.websiteId,
                'Validator': res.validatorName,
                'Page URL': page.url,
                'Issue Type': issue.type || 'unknown',
                'Severity': issue.severity,
                'Message': issue.message,
                'Details/Context': issue.context ? JSON.stringify(issue.context) : '',
                'Viewport Name': page.viewport ? page.viewport.name : '',
                'Viewport Width': page.viewport ? page.viewport.width : '',
                'Viewport Height': page.viewport ? page.viewport.height : '',
                'Browser': page.browser || '',
                'Baseline Used': page.metrics?.baselinePath || '',
                'Mismatch %': page.metrics?.mismatchPercentage !== undefined ? page.metrics.mismatchPercentage : '',
                'Diff Pixels': page.metrics?.diffPixels !== undefined ? page.metrics.diffPixels : '',
                'Actual Artifact': page.metrics?.actualPath || '',
                'Diff Artifact': page.metrics?.diffPath || ''
              });
            }
          }
        }
      } 
      // 2. Website-level issues (Lightweight or general errors)
      else {
        if (res.status === 'FAIL' || res.status === 'WARNING' || res.status === 'ERROR') {
          let details = '';
          if (res.evidence) {
            // Prevent raw TLS certificate from causing problems
            const safeEvidence = { ...res.evidence };
            if (safeEvidence.certificateRaw) delete safeEvidence.certificateRaw;
            details = JSON.stringify(safeEvidence);
          }

          data.push({
            'Website ID': res.websiteId,
            'Validator': res.validatorName,
            'Page URL': 'N/A', // No specific page
            'Issue Type': res.status === 'ERROR' ? 'execution_error' : `${res.validatorName}_issue`,
            'Severity': res.status,
            'Message': res.message,
            'Details/Context': details,
            'Viewport Name': '',
            'Viewport Width': '',
            'Viewport Height': '',
            'Browser': '',
            'Baseline Used': '',
            'Mismatch %': '',
            'Diff Pixels': '',
            'Actual Artifact': '',
            'Diff Artifact': ''
          });
        }
      }
    }
    return data;
  }
}

module.exports = ExcelReportWriter;
