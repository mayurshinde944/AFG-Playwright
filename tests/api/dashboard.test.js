'use strict';
const http = require('http');
const { app } = require('../../src/api/server');
const ResultStore = require('../../src/reporting/ResultStore');

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
});
