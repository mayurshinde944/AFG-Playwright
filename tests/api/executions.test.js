'use strict';
const http = require('http');
const { app } = require('../../src/api/server');
const CsvExcelInventoryLoader = require('../../src/inventory/CsvExcelInventoryLoader');
const Website = require('../../src/models/Website');
const ExecutionEngine = require('../../src/core/ExecutionEngine');
const ResultStore = require('../../src/reporting/ResultStore');

describe('API Executions Endpoints', () => {
  let server;
  let port;
  let loaderSpy;
  let engineSpy;
  let resultStoreSpy;

  const fixtureWebsites = [
    new Website({ id: 'site-001', name: 'Site 1', url: 'https://site1.example.com', active: true }),
    new Website({ id: 'site-002', name: 'Site 2', url: 'https://site2.example.com', active: true }),
    new Website({ id: 'site-003', name: 'Site 3', url: 'https://site3.example.com', active: true }),
    new Website({ id: 'site-004', name: 'Site 4', url: 'https://site4.example.com', active: true }),
    new Website({ id: 'site-005', name: 'Site 5', url: 'https://site5.example.com', active: true }),
    new Website({ id: 'site-006', name: 'Site 6', url: 'https://site6.example.com', active: true }),
    new Website({ id: 'site-007', name: 'Site 7', url: 'https://site7.example.com', active: true }),
    new Website({ id: 'site-008', name: 'Site 8', url: 'https://site8.example.com', active: true }),
    new Website({ id: 'site-009', name: 'Site 9', url: 'https://site9.example.com', active: true }),
    new Website({ id: 'site-010', name: 'Site 10', url: 'https://site10.example.com', active: true }),
    new Website({ id: 'site-011', name: 'Site 11', url: 'https://site11.example.com', active: true })
  ];

  beforeAll((done) => {
    // Let OS assign a random available port to avoid EADDRINUSE
    server = app.listen(0, () => {
      port = server.address().port;
      done();
    });
  });
  
  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    loaderSpy = jest.spyOn(CsvExcelInventoryLoader.prototype, 'loadWebsites').mockResolvedValue(fixtureWebsites);
    engineSpy = jest.spyOn(ExecutionEngine.prototype, 'execute').mockResolvedValue();
    resultStoreSpy = jest.spyOn(ResultStore, 'saveRun').mockResolvedValue();
  });

  afterEach(() => {
    if (loaderSpy) loaderSpy.mockRestore();
    if (engineSpy) engineSpy.mockRestore();
    if (resultStoreSpy) resultStoreSpy.mockRestore();
  });

  function postJson(payload, callback) {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/executions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body); } catch (e) {}
        callback(res, parsed);
      });
    });
    req.write(data);
    req.end();
  }

  test('POST /api/executions rejects invalid payload when no target provided', (done) => {
    postJson({}, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toBe('Either websites, websiteId, or url is required');
      done();
    });
  });

  test('POST /api/executions rejects payload with multiple target types', (done) => {
    postJson({ websites: ['site-001'], url: 'https://example.com', validators: ['http'] }, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toBe('Specify only one of websites, websiteId, or url');
      done();
    });
  });

  test('POST /api/executions rejects non-array websites field', (done) => {
    postJson({ websites: 'site-001', validators: ['http'] }, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toBe('websites must be an array of website identifiers');
      done();
    });
  });

  test('POST /api/executions rejects empty websites array', (done) => {
    postJson({ websites: [], validators: ['http'] }, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toBe('websites array cannot be empty');
      done();
    });
  });

  test('POST /api/executions rejects batches exceeding 10 websites', (done) => {
    const elevenSites = [
      'site-001', 'site-002', 'site-003', 'site-004', 'site-005',
      'site-006', 'site-007', 'site-008', 'site-009', 'site-010', 'site-011'
    ];
    postJson({ websites: elevenSites, validators: ['http'] }, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toBe('Batch size exceeds maximum limit of 10 websites');
      done();
    });
  });

  test('POST /api/executions rejects malformed entries in websites array', (done) => {
    postJson({ websites: ['site-001', '   ', 123], validators: ['http'] }, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toBe('websites must contain valid non-empty string identifiers');
      done();
    });
  });

  test('POST /api/executions rejects duplicate website IDs in batch', (done) => {
    postJson({ websites: ['site-001', 'site-002', 'site-001'], validators: ['http'] }, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toBe('Duplicate website identifiers are not allowed in a batch');
      done();
    });
  });

  test('POST /api/executions rejects invalid validator on multi-website batch', (done) => {
    postJson({ websites: ['site-001', 'site-002'], validators: ['unknown-validator'] }, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toBe('Unknown validator: unknown-validator');
      done();
    });
  });

  test('POST /api/executions rejects when website ID in batch is missing from inventory', (done) => {
    postJson({ websites: ['site-001', 'nonexistent-site'], validators: ['http'] }, (res, body) => {
      expect(res.statusCode).toBe(400);
      expect(body.error).toContain('Website not found in inventory: nonexistent-site');
      done();
    });
  });

  test('POST /api/executions successfully enqueues a valid batch of multiple websites', (done) => {
    postJson({ websites: ['site-001', 'site-002', 'site-003'], validators: ['http', 'ssl'] }, (res, body) => {
      expect(res.statusCode).toBe(202);
      expect(body.runId).toBeDefined();
      expect(body.status).toBe('QUEUED');
      done();
    });
  });

  test('POST /api/executions preserves backward compatibility for single websiteId', (done) => {
    postJson({ websiteId: 'site-001', validators: ['http'] }, (res, body) => {
      expect(res.statusCode).toBe(202);
      expect(body.runId).toBeDefined();
      expect(body.status).toBe('QUEUED');
      done();
    });
  });

  test('POST /api/executions preserves backward compatibility for single url', (done) => {
    postJson({ url: 'https://example.com', validators: ['dns'] }, (res, body) => {
      expect(res.statusCode).toBe(202);
      expect(body.runId).toBeDefined();
      expect(body.status).toBe('QUEUED');
      done();
    });
  });

  test('GET /api/executions/:runId returns 404 for nonexistent runId', (done) => {
    http.get(`http://127.0.0.1:${port}/api/executions/invalid-run-id-999`, (res) => {
      expect(res.statusCode).toBe(404);
      done();
    });
  });
});
