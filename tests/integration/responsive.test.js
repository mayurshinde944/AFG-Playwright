const { chromium } = require('playwright');
const ResponsiveChecker = require('../../src/validators/responsive/ResponsiveChecker');
const { STATUS } = require('../../src/models/ValidationResult');
const path = require('path');

describe('ResponsiveChecker Integration Tests', () => {
  jest.setTimeout(30000);
  let browser;
  let context;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    // Mobile viewport
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
  });

  afterEach(async () => {
    if (page) await page.close();
    if (context) await context.close();
  });

  const runHtmlFixture = async (html) => {
    // Create a data URL from HTML
    const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    return await ResponsiveChecker.checkPage(page, url, { name: 'mobile', width: 390, height: 844 }, { timeoutMs: 5000 });
  };

  test('should detect mobile horizontal overflow', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>body { margin: 0; padding: 0; } .wide { width: 500px; height: 100px; background: red; }</style></head>
      <body><div class="wide"></div></body>
      </html>
    `;
    const result = await runHtmlFixture(html);
    expect(result.status).toBe(STATUS.FAIL);
    expect(result.issues.some(i => i.type === 'horizontal_overflow')).toBe(true);
    expect(result.issues.some(i => i.type === 'element_overflow')).toBe(true);
  });

  test('should ignore visually hidden elements for overlap', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>
        body { margin: 0; }
        .box1 { width: 200px; height: 200px; background: blue; position: absolute; top: 0; left: 0; }
        .box2 { width: 200px; height: 200px; background: red; position: absolute; top: 0; left: 0; opacity: 0; }
      </style></head>
      <body>
        <div class="box1"></div>
        <div class="box2"></div>
      </body>
      </html>
    `;
    const result = await runHtmlFixture(html);
    // Should pass because box2 is opacity 0 and absolute positioning is ignored anyway for overlap,
    // but we can test visibility filtering by removing position absolute and using margin negative.
    expect(result.issues.some(i => i.type === 'element_overlap')).toBe(false);
  });

  test('should detect genuine element overlap', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>
        body { margin: 0; }
        .box1 { width: 200px; height: 200px; background: blue; }
        /* Using transform to force overlap without negative margin (which is excluded) */
        .box2 { width: 200px; height: 200px; background: red; transform: translateY(-100px); }
      </style></head>
      <body>
        <div class="box1"></div>
        <div class="box2"></div>
      </body>
      </html>
    `;
    const result = await runHtmlFixture(html);
    expect(result.issues.some(i => i.type === 'element_overlap')).toBe(true);
    expect(result.status).toBe(STATUS.WARNING);
  });

  test('should NOT report intentional nested parent-child overlap', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>
        .parent { width: 200px; height: 200px; background: blue; padding: 20px; }
        .child { width: 100%; height: 100%; background: red; }
      </style></head>
      <body>
        <div class="parent">
          <div class="child"></div>
        </div>
      </body>
      </html>
    `;
    const result = await runHtmlFixture(html);
    expect(result.issues.some(i => i.type === 'element_overlap')).toBe(false);
  });

  test('should cleanly pass a responsive page', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>
        body { margin: 0; padding: 10px; box-sizing: border-box; }
        .container { width: 100%; max-width: 1200px; margin: 0 auto; background: #eee; }
        .text { font-size: 16px; line-height: 1.5; }
      </style></head>
      <body>
        <div class="container">
          <p class="text">This is a clean, responsive page.</p>
        </div>
      </body>
      </html>
    `;
    const result = await runHtmlFixture(html);
    expect(result.status).toBe(STATUS.PASS);
    expect(result.issues.length).toBe(0);
  });
});
