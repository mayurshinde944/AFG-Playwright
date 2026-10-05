'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const xlsx = require('xlsx');

describe('Reporting CLI Integration', () => {
  const artifactsDir = path.join(__dirname, '../../artifacts/reports');

  beforeEach(() => {
    if (fs.existsSync(artifactsDir)) {
      const files = fs.readdirSync(artifactsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(artifactsDir, file));
      }
    } else {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
  });

  it('should generate EXACTLY 1 Operational Excel report for lightweight validators', () => {
    execSync('node src/cli/qa.js --specific dns-001 --validator dns --report excel');
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(1);
    expect(files[0]).toContain('QA_Operational_Report');
    expect(files[0]).toContain('SPECIFIC');
  });

  it('should generate EXACTLY 1 Detailed Excel report for heavy validators', () => {
    execSync('node src/cli/qa.js --specific dns-001 --validator ui --report excel');
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(1);
    expect(files[0]).toContain('QA_Detailed_Report');
    expect(files[0]).toContain('SPECIFIC');
  });

  it('should generate EXACTLY 2 reports for mixed validators', () => {
    const ReportGenerator = require('../../src/reporting/ReportGenerator');
    const request = { scope: { type: 'random' } };
    const results = [
      { validatorName: 'dns', websiteId: 'dns-001', status: 'PASS' },
      { validatorName: 'ui', websiteId: 'dns-001', status: 'PASS' }
    ];
    
    return ReportGenerator.generate(results, { reporting: { enabled: true, formats: ['excel'], outputDir: artifactsDir } }, request).then(() => {
      const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
      expect(files.length).toBe(2);
      expect(files.find(f => f.includes('QA_Operational_Report'))).toBeDefined();
      expect(files.find(f => f.includes('QA_Detailed_Report'))).toBeDefined();
      expect(files[0]).toContain('RANDOM');
      expect(files[1]).toContain('RANDOM');
    });
  });

  it('should not generate extra reports because of previous executions', () => {
    // Create a dummy previous report
    fs.writeFileSync(path.join(artifactsDir, 'QA_Operational_Report_Old_SPECIFIC.xlsx'), 'dummy');

    execSync('node src/cli/qa.js --specific dns-001 --validator dns --report excel');
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(2); // The old one + exactly one new one
  });

  it('should accumulate multiple --validator arguments and execute all of them', () => {
    // Run with 3 lightweight validators
    execSync('node src/cli/qa.js --specific dns-001 --validator dns --validator ssl --validator http --report excel');
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(1);
    
    const filepath = path.join(artifactsDir, files[0]);
    const wb = xlsx.readFile(filepath);
    const opSheet = xlsx.utils.sheet_to_json(wb.Sheets['Operational Report']);
    
    expect(opSheet.length).toBe(1);
    const row = opSheet[0];
    
    // Ensure all 3 have run by checking their columns are populated
    expect(row['DNS Status']).toBeDefined();
    expect(row['DNS Status']).not.toBe('');
    
    expect(row['SSL Status']).toBeDefined();
    expect(row['SSL Status']).not.toBe('');
    
    expect(row['HTTP Status']).toBeDefined();
    expect(row['HTTP Status']).not.toBe('');
  });

  it('should produce ALL filename for all scope', () => {
    execSync('node src/cli/qa.js --all --validator dns --report excel');
    
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.xlsx'));
    expect(files.length).toBe(1);
    expect(files[0]).toContain('ALL');
  });
});
