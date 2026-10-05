'use strict';

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const ExcelReportWriter = require('../../../src/reporting/writers/ExcelReportWriter');
const { ValidationResult } = require('../../../src/models/ValidationResult');

describe('ExcelReportWriter', () => {
  const testDir = path.join(__dirname, 'test_artifacts');
  const filepath = path.join(testDir, 'test_report.xlsx');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  });

  it('should generate an empty report without throwing', async () => {
    await ExcelReportWriter.write([], filepath);
    expect(fs.existsSync(filepath)).toBe(true);

    const wb = xlsx.readFile(filepath);
    expect(wb.SheetNames).toContain('Summary');
    expect(wb.SheetNames).toContain('Websites');
    
    const summarySheet = xlsx.utils.sheet_to_json(wb.Sheets['Summary']);
    expect(summarySheet[0]['Total Pages Tested']).toBe(0);
    expect(summarySheet[0]['Total Issues']).toBe(0);
  });

  it('should correctly map UI validation results with pages', async () => {
    const result = new ValidationResult({
      websiteId: 'site-001',
      validatorName: 'ui',
      status: 'WARNING',
      duration: 5000,
      metrics: { pagesTested: 2, pagesPassed: 1, pagesWarnings: 1, pagesFailed: 0 },
      pages: [
        {
          url: 'http://example.com',
          finalUrl: 'http://example.com',
          status: 'PASS',
          duration: 1000,
          issues: []
        },
        {
          url: 'http://example.com/about',
          finalUrl: 'http://example.com/about',
          status: 'WARNING',
          duration: 4000,
          issues: [
            { type: 'broken_image', severity: 'WARNING', message: 'Broken image', context: { src: 'broken.jpg' } }
          ]
        }
      ]
    });

    await ExcelReportWriter.write([result], filepath);
    const wb = xlsx.readFile(filepath);

    expect(wb.SheetNames).toContain('Pages');
    expect(wb.SheetNames).toContain('Issues');

    const pagesSheet = xlsx.utils.sheet_to_json(wb.Sheets['Pages']);
    expect(pagesSheet.length).toBe(2);
    expect(pagesSheet[1]['Page URL']).toBe('http://example.com/about');

    const issuesSheet = xlsx.utils.sheet_to_json(wb.Sheets['Issues']);
    expect(issuesSheet.length).toBe(1);
    expect(issuesSheet[0]['Issue Type']).toBe('broken_image');
    expect(issuesSheet[0]['Details/Context']).toContain('broken.jpg');

    const summarySheet = xlsx.utils.sheet_to_json(wb.Sheets['Summary']);
    expect(summarySheet[0]['Total Pages Tested']).toBe(2);
    expect(summarySheet[0]['Total Pages Passed']).toBe(1);
    expect(summarySheet[0]['Total Pages Warnings']).toBe(1);
    expect(summarySheet[0]['Total Pages Failed']).toBe(0);
    expect(summarySheet[0]['Total Issues']).toBe(1);
  });

  it('should correctly map Infrastructure validation results', async () => {
    const dnsResult = new ValidationResult({
      websiteId: 'site-002',
      validatorName: 'dns',
      status: 'FAIL',
      message: 'Resolution failed',
      duration: 50,
      evidence: { error: 'ENOTFOUND' }
    });

    await ExcelReportWriter.write([dnsResult], filepath);
    const wb = xlsx.readFile(filepath);

    expect(wb.SheetNames).not.toContain('Pages'); // Lightweight shouldn't have Pages sheet
    expect(wb.SheetNames).toContain('Issues');

    const issuesSheet = xlsx.utils.sheet_to_json(wb.Sheets['Issues']);
    expect(issuesSheet.length).toBe(1);
    expect(issuesSheet[0]['Validator']).toBe('dns');
    expect(issuesSheet[0]['Page URL']).toBe('N/A');
    expect(issuesSheet[0]['Details/Context']).toContain('ENOTFOUND');
    
    const summarySheet = xlsx.utils.sheet_to_json(wb.Sheets['Summary']);
    expect(summarySheet[0]['Total Pages Tested']).toBe(0); // Lightweight validator contributes 0
    expect(summarySheet[0]['Total Issues']).toBe(1); // DNS failure counts as 1 issue
  });
  
  it('should not double-count issues for mixed UI + infrastructure results', async () => {
    const uiResult = new ValidationResult({
      websiteId: 'site-001',
      validatorName: 'ui',
      status: 'WARNING',
      duration: 5000,
      metrics: { pagesTested: 5, pagesPassed: 4, pagesWarnings: 1, pagesFailed: 0 },
      pages: [
        {
          url: 'http://example.com/about',
          status: 'WARNING',
          issues: [{ type: 'broken_image', severity: 'WARNING', message: 'Broken image' }]
        }
      ]
    });
    
    const dnsResult = new ValidationResult({
      websiteId: 'site-001',
      validatorName: 'dns',
      status: 'FAIL',
      message: 'Resolution failed',
      duration: 50
    });

    await ExcelReportWriter.write([uiResult, dnsResult], filepath);
    const wb = xlsx.readFile(filepath);
    
    const summarySheet = xlsx.utils.sheet_to_json(wb.Sheets['Summary']);
    expect(summarySheet[0]['Total Websites']).toBe(1); // both are site-001
    expect(summarySheet[0]['Total Issues']).toBe(2); // 1 UI issue + 1 DNS issue
  });

  it('should correctly map responsive validation results with viewport metadata', async () => {
    const responsiveResult = new ValidationResult({
      websiteId: 'site-001',
      validatorName: 'responsive',
      status: 'WARNING',
      duration: 10000,
      metrics: { pagesTested: 1, pagesPassed: 0, pagesWarnings: 1, pagesFailed: 0 },
      pages: [
        {
          url: 'http://example.com',
          finalUrl: 'http://example.com',
          status: 'WARNING',
          duration: 2000,
          viewport: { name: 'mobile', width: 390, height: 844 },
          issues: [
            { type: 'element_overflow', severity: 'WARNING', message: 'Element overflows viewport horizontally (DIV)', context: {} }
          ]
        }
      ]
    });

    await ExcelReportWriter.write([responsiveResult], filepath);
    const wb = xlsx.readFile(filepath);
    
    const pagesSheet = xlsx.utils.sheet_to_json(wb.Sheets['Pages']);
    expect(pagesSheet.length).toBe(1);
    expect(pagesSheet[0]['Viewport Name']).toBe('mobile');
    expect(pagesSheet[0]['Viewport Width']).toBe(390);
    expect(pagesSheet[0]['Viewport Height']).toBe(844);

    const issuesSheet = xlsx.utils.sheet_to_json(wb.Sheets['Issues']);
    expect(issuesSheet.length).toBe(1);
    expect(issuesSheet[0]['Issue Type']).toBe('element_overflow');
    expect(issuesSheet[0]['Viewport Name']).toBe('mobile');
    expect(issuesSheet[0]['Viewport Width']).toBe(390);
    expect(issuesSheet[0]['Viewport Height']).toBe(844);
  });

  it('should correctly map cross-browser validation results with browser metadata', async () => {
    const crossBrowserResult = new ValidationResult({
      websiteId: 'site-001',
      validatorName: 'cross-browser',
      status: 'WARNING',
      duration: 10000,
      metrics: { pagesTested: 2, pagesPassed: 1, pagesWarnings: 1, pagesFailed: 0 },
      pages: [
        {
          url: 'http://example.com',
          finalUrl: 'http://example.com',
          status: 'WARNING',
          duration: 2000,
          browser: 'firefox',
          issues: [
            { type: 'browser_specific_issue', severity: 'WARNING', message: 'Firefox issue', context: { affectedBrowsers: ['firefox'] } }
          ]
        },
        {
          url: 'http://example.com',
          finalUrl: 'http://example.com',
          status: 'PASS',
          duration: 2000,
          browser: 'chromium',
          issues: []
        }
      ]
    });

    await ExcelReportWriter.write([crossBrowserResult], filepath);
    const wb = xlsx.readFile(filepath);
    
    const pagesSheet = xlsx.utils.sheet_to_json(wb.Sheets['Pages']);
    expect(pagesSheet.length).toBe(2);
    expect(pagesSheet[0]['Browser']).toBe('firefox');
    expect(pagesSheet[1]['Browser']).toBe('chromium');

    const issuesSheet = xlsx.utils.sheet_to_json(wb.Sheets['Issues']);
    expect(issuesSheet.length).toBe(1);
    expect(issuesSheet[0]['Issue Type']).toBe('browser_specific_issue');
    expect(issuesSheet[0]['Browser']).toBe('firefox');
  });
});
