'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const VisualValidator = require('../../src/validators/visual/VisualValidator');
const Website = require('../../src/models/Website');
const { STATUS } = require('../../src/models/ValidationResult');

describe('VisualValidator Integration Tests', () => {
  let server;
  let testUrl;
  let isRegression = false;
  
  const testVisualDir = path.join(__dirname, 'test_visual');
  const baselinesDir = path.join(testVisualDir, 'baselines');
  const actualsDir = path.join(testVisualDir, 'actuals');
  const diffsDir = path.join(testVisualDir, 'diffs');

  beforeAll((done) => {
    // Clean directories
    if (fs.existsSync(testVisualDir)) fs.rmSync(testVisualDir, { recursive: true, force: true });
    
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Visual Test</title>
          <style>
            body { margin: 0; padding: 20px; font-family: sans-serif; }
            .box { width: 100px; height: 100px; background: blue; }
            .dynamic { color: red; }
          </style>
        </head>
        <body>
          <h1>Visual Test Page</h1>
          <div class="box" style="background: ${isRegression ? 'red' : 'blue'};"></div>
          <p class="dynamic">Timestamp: ${Date.now()}</p>
        </body>
        </html>
      `;
      res.end(html);
    });

    server.listen(0, '127.0.0.1', () => {
      testUrl = `http://127.0.0.1:${server.address().port}/`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
    fs.rmSync(testVisualDir, { recursive: true, force: true });
  });

  it('should return WARNING for missing baseline and save actual', async () => {
    const validator = new VisualValidator();
    const website = new Website({ id: 'test-visual-site', url: testUrl });
    const context = {
      config: {
        ui: { maxPages: 1, pageTimeoutMs: 15000 },
        retry: { maxRetries: 0 },
        viewports: { desktop: { width: 800, height: 600 } },
        visual: {
          mismatchThreshold: 0.05,
          baselinesDir,
          actualsDir,
          diffsDir,
          defaultMasks: ['.dynamic']
        }
      }
    };

    const result = await validator.validate(website, context);
    
    expect(result.status).toBe(STATUS.WARNING);
    expect(result.pages.length).toBe(1);
    
    const pageResult = result.pages[0];
    expect(pageResult.status).toBe(STATUS.WARNING);
    expect(pageResult.issues[0].type).toBe('missing_baseline');
    
    // Assert actual was saved
    const slug = crypto.createHash('md5').update(testUrl).digest('hex').substring(0, 12);
    const expectedActual = path.join(actualsDir, 'test-visual-site', `desktop_${slug}.png`);
    expect(fs.existsSync(expectedActual)).toBe(true);

    // Promote actual to baseline for the next test
    const expectedBaseline = path.join(baselinesDir, 'test-visual-site', `desktop_${slug}.png`);
    fs.mkdirSync(path.dirname(expectedBaseline), { recursive: true });
    fs.copyFileSync(expectedActual, expectedBaseline);
  }, 30000);

  it('should return PASS when baseline matches exactly (ignoring dynamic masked content)', async () => {
    const validator = new VisualValidator();
    const website = new Website({ id: 'test-visual-site', url: testUrl });
    const context = {
      config: {
        ui: { maxPages: 1, pageTimeoutMs: 15000 },
        retry: { maxRetries: 0 },
        viewports: { desktop: { width: 800, height: 600 } },
        visual: {
          mismatchThreshold: 0.05,
          baselinesDir,
          actualsDir,
          diffsDir,
          defaultMasks: ['.dynamic'] // Mask the timestamp which changes
        }
      }
    };

    const result = await validator.validate(website, context);
    
    expect(result.status).toBe(STATUS.PASS);
    expect(result.pages[0].status).toBe(STATUS.PASS);
    expect(result.pages[0].metrics.mismatchPercentage).toBeLessThanOrEqual(0.05);
  }, 30000);

  it('should return FAIL and generate a diff when there is a visual regression', async () => {
    isRegression = true; // Change the box from blue to red

    const validator = new VisualValidator();
    const website = new Website({ id: 'test-visual-site', url: testUrl });
    const context = {
      config: {
        ui: { maxPages: 1, pageTimeoutMs: 15000 },
        retry: { maxRetries: 0 },
        viewports: { desktop: { width: 800, height: 600 } },
        visual: {
          mismatchThreshold: 0.05,
          baselinesDir,
          actualsDir,
          diffsDir,
          defaultMasks: ['.dynamic']
        }
      }
    };

    const result = await validator.validate(website, context);
    
    expect(result.status).toBe(STATUS.FAIL);
    expect(result.pages[0].status).toBe(STATUS.FAIL);
    expect(result.pages[0].issues[0].type).toBe('visual_regression');
    expect(result.pages[0].metrics.mismatchPercentage).toBeGreaterThan(0.05);
    
    // Assert diff was generated
    expect(fs.existsSync(result.pages[0].metrics.diffPath)).toBe(true);
  }, 30000);
});
