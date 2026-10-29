'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('../../src/api/server');
const ResultStore = require('../../src/reporting/ResultStore');
const CsvExcelInventoryLoader = require('../../src/inventory/CsvExcelInventoryLoader');
const Website = require('../../src/models/Website');

jest.mock('../../src/reporting/ResultStore', () => ({
  getTodayRuns: jest.fn(),
  getRunsByDate: jest.fn(),
  getWebsiteHistory: jest.fn()
}));

const mockRuns = [
  {
    execution: { scope: 'adhoc', runId: 'run-adhoc-1' },
    websites: [{ websiteId: 'site-1', url: 'https://site1.com' }],
    results: [{ websiteId: 'site-1', validatorName: 'dns', status: 'FAIL' }]
  },
  {
    execution: { scope: 'random', runId: 'run-daily-1', startedAt: '2026-09-30T10:00:00Z' },
    websites: [{ websiteId: 'site-1', url: 'https://site1.com' }, { websiteId: 'site-2', url: 'https://site2.com' }],
    results: [
      { websiteId: 'site-1', validatorName: 'dns', status: 'PASS' },
      { websiteId: 'site-1', validatorName: 'ssl', status: 'WARNING' },
      { websiteId: 'site-2', validatorName: 'ui', status: 'FAIL' }
    ]
  },
  {
    execution: { scope: 'random', runId: 'run-daily-2', startedAt: '2026-09-30T12:00:00Z' },
    websites: [{ websiteId: 'site-1', url: 'https://site1.com' }],
    results: [
      { websiteId: 'site-1', validatorName: 'dns', status: 'PASS' },
      { websiteId: 'site-1', validatorName: 'ssl', status: 'PASS' }
    ]
  },
  {
    execution: { scope: 'specific', runId: 'run-specific-1' },
    websites: [{ websiteId: 'site-3', url: 'https://site3.com' }],
    results: [{ websiteId: 'site-3', validatorName: 'http', status: 'PASS' }]
  },
  {
    execution: { scope: 'all', runId: 'run-all-1' },
    websites: [{ websiteId: 'site-4', url: 'https://site4.com' }],
    results: [{ websiteId: 'site-4', validatorName: 'dns', status: 'PASS' }]
  },
  {
    execution: { scope: 'rotation', runId: 'run-rotation-1' },
    websites: [{ websiteId: 'site-5', url: 'https://site5.com' }],
    results: [{ websiteId: 'site-5', validatorName: 'http', status: 'PASS' }]
  }
];

describe('Dashboard API Endpoints', () => {
  let server;
  let port;

  beforeAll((done) => {
    server = app.listen(0, () => {
      port = server.address().port;
      done();
    });
  });
  
  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/dashboard/today correctly filters and aggregates random runs', (done) => {
    ResultStore.getTodayRuns.mockResolvedValue(mockRuns);

    http.get(`http://127.0.0.1:${port}/api/dashboard/today`, (res) => {
      expect(res.statusCode).toBe(200);
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const data = JSON.parse(body);
        
        expect(data.websitesTestedToday).toBeDefined();
        
        // Only site-1 and site-2 should be here (from random scopes), site-3 and adhoc should not affect it
        expect(data.websitesTestedToday.length).toBe(2);
        
        const site1 = data.websitesTestedToday.find(w => w.websiteId === 'site-1');
        // Because run-daily-2 is later (12:00:00Z) than run-daily-1 (10:00:00Z), site-1 should come from run-daily-2
        expect(site1.runId).toBe('run-daily-2');
        expect(site1.overallStatus).toBe('PASS'); // From run-daily-2 which is PASS for both
        expect(site1.validators.sort()).toEqual(['dns', 'ssl'].sort());
        
        const site2 = data.websitesTestedToday.find(w => w.websiteId === 'site-2');
        expect(site2.runId).toBe('run-daily-1');
        expect(site2.overallStatus).toBe('FAIL'); // FAIL > WARNING > PASS
        expect(site2.validators).toEqual(['ui']);

        // Verify summary counts across all scopes in mockRuns (5 sites total: 2 failed, 0 warnings, 3 passed)
        expect(data.summary).toBeDefined();
        expect(data.summary.totalTested).toBe(5);
        expect(data.summary.failed).toBe(2);
        expect(data.summary.warnings).toBe(0);
        expect(data.summary.passed).toBe(3);
        
        done();
      });
    });
  });

  test('GET /api/dashboard/today includes PASS in summary and preserves FAIL/ERROR > WARNING > PASS precedence', (done) => {
    const testRuns = [
      {
        execution: { scope: 'random', runId: 'run-precedence-1' },
        websites: [
          { websiteId: 'site-pass', url: 'https://pass.com' },
          { websiteId: 'site-warn', url: 'https://warn.com' },
          { websiteId: 'site-fail', url: 'https://fail.com' },
          { websiteId: 'site-err', url: 'https://err.com' }
        ],
        results: [
          // site-pass: all PASS
          { websiteId: 'site-pass', validatorName: 'dns', status: 'PASS' },
          { websiteId: 'site-pass', validatorName: 'ssl', status: 'PASS' },
          // site-warn: PASS + WARNING -> WARNING
          { websiteId: 'site-warn', validatorName: 'dns', status: 'PASS' },
          { websiteId: 'site-warn', validatorName: 'ssl', status: 'WARNING' },
          // site-fail: WARNING + FAIL -> FAIL
          { websiteId: 'site-fail', validatorName: 'dns', status: 'WARNING' },
          { websiteId: 'site-fail', validatorName: 'ssl', status: 'FAIL' },
          // site-err: PASS + ERROR -> FAIL
          { websiteId: 'site-err', validatorName: 'dns', status: 'PASS' },
          { websiteId: 'site-err', validatorName: 'ssl', status: 'ERROR' }
        ]
      }
    ];
    ResultStore.getTodayRuns.mockResolvedValue(testRuns);

    http.get(`http://127.0.0.1:${port}/api/dashboard/today`, (res) => {
      expect(res.statusCode).toBe(200);
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const data = JSON.parse(body);
        expect(data.summary.totalTested).toBe(4);
        expect(data.summary.passed).toBe(1);   // site-pass
        expect(data.summary.warnings).toBe(1); // site-warn
        expect(data.summary.failed).toBe(2);   // site-fail and site-err
        done();
      });
    });
  });

  test('GET /api/dashboard/summary?date=2024-01-01 returns empty data for date with no runs', (done) => {
    ResultStore.getRunsByDate.mockResolvedValue([]);
    http.get(`http://127.0.0.1:${port}/api/dashboard/summary?date=2024-01-01`, (res) => {
      expect(res.statusCode).toBe(200);
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const data = JSON.parse(body);
        expect(data.websitesTestedToday).toEqual([]);
        expect(data.summary.totalTested).toBe(0);
        done();
      });
    });
  });

  test('GET /api/dashboard/summary returns 400 for invalid date format', (done) => {
    http.get(`http://127.0.0.1:${port}/api/dashboard/summary?date=invalid-date`, (res) => {
      expect(res.statusCode).toBe(400);
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const data = JSON.parse(body);
        expect(data.error).toBe('Invalid date format. Expected YYYY-MM-DD.');
        done();
      });
    });
  });

  describe('Website History API', () => {
    test('GET /api/dashboard/website/invalid-site/history returns 200 with empty array', (done) => {
      ResultStore.getWebsiteHistory.mockResolvedValue([]);
      http.get(`http://127.0.0.1:${port}/api/dashboard/website/invalid-site/history`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          expect(data).toEqual([]);
          done();
        });
      });
    });
  });

  describe('Visual Image Serving API', () => {
    const testVisualDir = path.resolve(process.cwd(), './artifacts/visual/baselines/test-site');
    const testFile = path.join(testVisualDir, 'desktop_123456789abc.png');

    beforeAll(() => {
      fs.mkdirSync(testVisualDir, { recursive: true });
      fs.writeFileSync(testFile, Buffer.from('fake-png-data'));
    });

    afterAll(() => {
      try {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        if (fs.existsSync(testVisualDir)) fs.rmdirSync(testVisualDir);
      } catch (e) {}
    });

    test('GET /api/dashboard/visual rejects invalid visual type with 400', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/visual/invalid_type/test-site/desktop_123.png`, (res) => {
        expect(res.statusCode).toBe(400);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          expect(JSON.parse(body).error).toBe('Invalid visual image type');
          done();
        });
      });
    });

    test('GET /api/dashboard/visual rejects path traversal in websiteId with 400', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/visual/baselines/..%2F..%2Fsecret/desktop_123.png`, (res) => {
        expect(res.statusCode).toBe(400);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          expect(JSON.parse(body).error).toBe('Invalid website identifier');
          done();
        });
      });
    });

    test('GET /api/dashboard/visual rejects non-png filename with 400', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/visual/baselines/test-site/desktop_123.jpg`, (res) => {
        expect(res.statusCode).toBe(400);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          expect(JSON.parse(body).error).toBe('Invalid image filename');
          done();
        });
      });
    });

    test('GET /api/dashboard/visual returns 404 for non-existent image', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/visual/baselines/test-site/desktop_nonexistent.png`, (res) => {
        expect(res.statusCode).toBe(404);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          expect(JSON.parse(body).error).toBe('Image not found');
          done();
        });
      });
    });

    test('GET /api/dashboard/visual successfully serves existing image', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/visual/baselines/test-site/desktop_123456789abc.png`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
        let body = [];
        res.on('data', chunk => body.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(body);
          expect(buffer.toString()).toBe('fake-png-data');
          done();
        });
      });
    });
  });

  describe('Inventory Website Search API', () => {
    let loaderSpy;
    const fixtureWebsites = [
      new Website({ id: 'site-alpha', name: 'Alpha Portal', url: 'https://alpha.example.com', active: true, domainType: 'smartonline' }),
      new Website({ id: 'site-beta', name: 'Beta Solutions', url: 'https://beta.example.com', active: true, domainType: 'custom' }),
      new Website({ id: 'site-gamma', name: 'Gamma Corp', url: 'https://gamma.corp.com', active: false, domainType: 'custom' }),
      new Website({ id: 'site-delta', name: 'Delta Services', url: 'https://delta.example.com', active: true, domainType: 'smartonline' }),
      new Website({ id: 'site-epsilon', name: 'Epsilon Tech', url: 'https://epsilon.org', active: true, domainType: 'custom' })
    ];

    beforeEach(() => {
      loaderSpy = jest.spyOn(CsvExcelInventoryLoader.prototype, 'loadWebsites').mockResolvedValue(fixtureWebsites);
    });

    afterEach(() => {
      if (loaderSpy) loaderSpy.mockRestore();
    });

    test('GET /api/dashboard/websites returns all websites up to default limit when no query provided', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/websites`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          expect(data.websites).toBeDefined();
          expect(data.websites.length).toBe(5);
          expect(data.total).toBe(5);
          done();
        });
      });
    });

    test('GET /api/dashboard/websites matches case-insensitively by website ID', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/websites?q=ALPHA`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          expect(data.websites.length).toBe(1);
          expect(data.websites[0].id).toBe('site-alpha');
          expect(data.websites[0].name).toBe('Alpha Portal');
          expect(data.total).toBe(1);
          done();
        });
      });
    });

    test('GET /api/dashboard/websites matches by website name', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/websites?q=Solutions`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          expect(data.websites.length).toBe(1);
          expect(data.websites[0].id).toBe('site-beta');
          done();
        });
      });
    });

    test('GET /api/dashboard/websites matches by website URL', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/websites?q=corp.com`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          expect(data.websites.length).toBe(1);
          expect(data.websites[0].id).toBe('site-gamma');
          expect(data.websites[0].url).toBe('https://gamma.corp.com');
          expect(data.websites[0].active).toBe(false);
          done();
        });
      });
    });

    test('GET /api/dashboard/websites returns empty array when no matches found', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/websites?q=nonexistent-query-xyz`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          expect(data.websites).toEqual([]);
          expect(data.total).toBe(0);
          done();
        });
      });
    });

    test('GET /api/dashboard/websites respects custom limit and handles invalid limit safely', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/websites?limit=2`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          expect(data.websites.length).toBe(2);
          expect(data.total).toBe(5);

          // Check fallback for invalid limit
          http.get(`http://127.0.0.1:${port}/api/dashboard/websites?limit=invalid`, (res2) => {
            expect(res2.statusCode).toBe(200);
            let body2 = '';
            res2.on('data', d => body2 += d);
            res2.on('end', () => {
              const data2 = JSON.parse(body2);
              expect(data2.websites.length).toBe(5);
              done();
            });
          });
        });
      });
    });

    test('GET /api/dashboard/websites sanitizes output to expose only safe fields', (done) => {
      http.get(`http://127.0.0.1:${port}/api/dashboard/websites?q=alpha`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          const site = data.websites[0];
          expect(Object.keys(site).sort()).toEqual(['active', 'id', 'name', 'url']);
          expect(site.domainType).toBeUndefined();
          done();
        });
      });
    });

    test('GET /api/dashboard/websites returns 500 when inventory loader fails', (done) => {
      loaderSpy.mockRejectedValue(new Error('Disk read failure'));
      http.get(`http://127.0.0.1:${port}/api/dashboard/websites?q=alpha`, (res) => {
        expect(res.statusCode).toBe(500);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const data = JSON.parse(body);
          expect(data.error).toBe('Failed to load inventory websites');
          done();
        });
      });
    });
  });
});
