'use strict';

const CrossBrowserValidator = require('../../src/validators/crossbrowser/CrossBrowserValidator');
const Website = require('../../src/models/Website');
const { STATUS } = require('../../src/models/ValidationResult');
const http = require('http');

describe('CrossBrowserValidator Integration Tests', () => {
  let server;
  let testUrl;

  beforeAll((done) => {
    // Spin up a quick local server that serves different issues based on user-agent
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      
      const userAgent = req.headers['user-agent'] || '';
      
      // Common structural HTML
      let html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <header>Header</header>
          <nav>Nav</nav>
          <main>Main Content</main>
          <footer>Footer</footer>
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" width="0" />
      `;

      // Trigger a Firefox-specific issue (missing main block for instance)
      if (userAgent.includes('Firefox')) {
        html = html.replace('<main>Main Content</main>', '');
      }

      // Add a common broken image to all browsers
      html += '<img src="https://example.invalid/broken.png" />';

      html += '</body></html>';
      res.end(html);
    });

    server.listen(0, '127.0.0.1', () => {
      testUrl = `http://127.0.0.1:${server.address().port}/`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should test across multiple browsers and group issues correctly', async () => {
    // Because Playwright WebKit on Windows can sometimes be tricky in CI, 
    // we'll just test Chromium and Firefox for this integration test to ensure stability,
    // or test all 3 if they are installed. Playwright typically installs all 3 locally.
    
    const validator = new CrossBrowserValidator();
    const website = new Website({ id: 'test-cross-browser', url: testUrl });
    const context = {
      config: {
        ui: { maxPages: 1, pageTimeoutMs: 15000 },
        retry: { maxRetries: 0 },
        browsers: ['chromium', 'firefox', 'webkit']
      }
    };

    const result = await validator.validate(website, context);
    
    // Overall status should be WARNING because we have broken images and a missing component
    expect(result.status).toBe(STATUS.WARNING);
    
    // 1 URL * 3 browsers = 3 pages
    expect(result.pages.length).toBe(3);
    
    const chrom = result.pages.find(p => p.browser === 'chromium');
    const ff = result.pages.find(p => p.browser === 'firefox');
    const wk = result.pages.find(p => p.browser === 'webkit');
    
    expect(chrom).toBeDefined();
    expect(ff).toBeDefined();
    expect(wk).toBeDefined();

    // Verify common issue: broken image should be present in all and tagged as common
    const chromCommon = chrom.issues.find(i => i.type.includes('common_broken_image'));
    expect(chromCommon).toBeDefined();
    expect(chromCommon.context.affectedBrowsers).toContain('chromium');
    expect(chromCommon.context.affectedBrowsers).toContain('firefox');
    expect(chromCommon.context.affectedBrowsers).toContain('webkit');

    const ffCommon = ff.issues.find(i => i.type.includes('common_broken_image'));
    expect(ffCommon).toBeDefined();

    const wkCommon = wk.issues.find(i => i.type.includes('common_broken_image'));
    expect(wkCommon).toBeDefined();

    // Verify browser-specific issue: missing 'main' component only on Firefox
    const ffSpecific = ff.issues.find(i => i.type.includes('browser_specific_missing_component'));
    expect(ffSpecific).toBeDefined();
    expect(ffSpecific.context.component).toBe('mainContent');
    expect(ffSpecific.context.affectedBrowsers).toEqual(['firefox']);
    
    // Chromium and WebKit should NOT have this issue
    const chromSpecific = chrom.issues.find(i => i.context && i.context.component === 'mainContent');
    expect(chromSpecific).toBeUndefined();

    const wkSpecific = wk.issues.find(i => i.context && i.context.component === 'mainContent');
    expect(wkSpecific).toBeUndefined();

  }, 60000); // 60s timeout for launching 3 browsers
});
