'use strict';
const http = require('http');
const { app } = require('../../src/api/server');

describe('API Executions Endpoints', () => {
  let server;
  let port;

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

  test('POST /api/executions rejects invalid payload', (done) => {
    const data = JSON.stringify({});
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/executions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => {
      expect(res.statusCode).toBe(400);
      done();
    });
    req.write(data);
    req.end();
  });

  test('POST /api/executions rejects invalid validator', (done) => {
    const data = JSON.stringify({ url: 'https://example.com', validators: ['unknown'] });
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/executions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => {
      expect(res.statusCode).toBe(400);
      done();
    });
    req.write(data);
    req.end();
  });

  test('GET /api/executions/:runId returns 404 for nonexistent runId', (done) => {
    http.get(`http://127.0.0.1:${port}/api/executions/invalid-run-id-999`, (res) => {
      expect(res.statusCode).toBe(404);
      done();
    });
  });
});
