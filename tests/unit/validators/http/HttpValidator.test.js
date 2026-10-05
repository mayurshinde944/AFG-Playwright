'use strict';

const http = require('http');
const https = require('https');
const HttpValidator = require('../../../../src/validators/http/HttpValidator');
const Website = require('../../../../src/models/Website');
const { STATUS } = require('../../../../src/models/ValidationResult');
const { performance } = require('perf_hooks');

jest.mock('http');
jest.mock('https');

describe('HttpValidator', () => {
  let validator;
  let mockWebsite;
  let mockContext;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new HttpValidator();
    mockWebsite = new Website({
      id: 'test-001',
      name: 'Test Website',
      url: 'https://example.com'
    });
    mockContext = {
      config: {
        http: {
          timeoutMs: 1000,
          maxRedirects: 3
        }
      }
    };
  });

  const setupMockRequest = (client, statusCode, headers = {}, delayMs = 0) => {
    const activeReq = {
      on: jest.fn(),
      end: jest.fn(() => {
        setTimeout(() => {
          if (client.request.mock.calls.length > 0) {
            // Find the most recent call to this client
            const calls = client.request.mock.calls;
            const cb = calls[calls.length - 1][2];
            if (cb) {
              cb({
                statusCode,
                headers,
                on: jest.fn((event, callback) => {
                  if (event === 'data') {
                    // simulate data
                  }
                }),
                destroy: jest.fn()
              });
            }
          }
        }, delayMs);
      }),
      destroy: jest.fn(),
      abort: jest.fn()
    };
    client.request.mockReturnValue(activeReq);
    return activeReq;
  };

  it('should return PASS for a 200 response and measure duration', async () => {
    setupMockRequest(https, 200);

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.PASS);
    expect(result.details.statusCode).toBe(200);
    expect(result.details.originalUrl).toBe('https://example.com');
    expect(result.details.finalUrl).toBe('https://example.com');
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(https.request).toHaveBeenCalledTimes(1);
  });

  it('should return PASS for a 204 response', async () => {
    setupMockRequest(https, 204);
    const result = await validator.validate(mockWebsite, mockContext);
    expect(result.status).toBe(STATUS.PASS);
    expect(result.details.statusCode).toBe(204);
  });

  it('should successfully follow a 301 redirect to a 200 response', async () => {
    // First request returns 301
    const req1 = {
      on: jest.fn(),
      end: jest.fn(() => {
        const cb = https.request.mock.calls[0][2];
        cb({
          statusCode: 301,
          headers: { location: '/new-path' },
          on: jest.fn(),
          destroy: jest.fn()
        });
      }),
      destroy: jest.fn()
    };
    
    // Second request returns 200
    const req2 = {
      on: jest.fn(),
      end: jest.fn(() => {
        const cb = https.request.mock.calls[1][2];
        cb({
          statusCode: 200,
          headers: {},
          on: jest.fn(),
          destroy: jest.fn()
        });
      }),
      destroy: jest.fn()
    };

    https.request
      .mockReturnValueOnce(req1)
      .mockReturnValueOnce(req2);

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.PASS);
    expect(result.details.statusCode).toBe(200);
    expect(result.details.finalUrl).toBe('https://example.com/new-path');
    expect(https.request).toHaveBeenCalledTimes(2);
  });

  it('should return FAIL if redirect limit is exceeded', async () => {
    const req = {
      on: jest.fn(),
      end: jest.fn(() => {
        const calls = https.request.mock.calls;
        const cb = calls[calls.length - 1][2];
        cb({
          statusCode: 302,
          headers: { location: '/loop' },
          on: jest.fn(),
          destroy: jest.fn()
        });
      }),
      destroy: jest.fn()
    };
    
    https.request.mockReturnValue(req);

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.message).toContain('Exceeded maximum redirects');
    // maxRedirects is 3, so 1 initial + 3 redirects attempted before failing = 4 requests
    expect(https.request).toHaveBeenCalledTimes(4);
  });

  it('should return FAIL for a 404 response', async () => {
    setupMockRequest(https, 404);

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.details.statusCode).toBe(404);
    expect(result.message).toContain('Client error');
  });

  it('should return FAIL for a 500 response', async () => {
    setupMockRequest(https, 500);

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.details.statusCode).toBe(500);
    expect(result.message).toContain('Server error');
  });

  it('should return FAIL on connection error', async () => {
    const req = {
      on: jest.fn((event, cb) => {
        if (event === 'error') {
          cb(new Error('ECONNREFUSED'));
        }
      }),
      end: jest.fn(),
      destroy: jest.fn()
    };
    https.request.mockReturnValue(req);

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.message).toContain('ECONNREFUSED');
    expect(result.evidence.error).toBe('ECONNREFUSED');
  });

  it('should return FAIL on timeout', async () => {
    // Setup a request that never fires its response callback,
    // triggering the timeout logic in HttpValidator.
    const req = {
      on: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn()
    };
    https.request.mockReturnValue(req);

    mockContext.config.http.timeoutMs = 100;

    const result = await validator.validate(mockWebsite, mockContext);

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.message).toContain('timeout');
    expect(req.destroy).toHaveBeenCalled();
  });

  it('should cleanly destroy final response to avoid downloading body', async () => {
    const mockDestroy = jest.fn();
    const req = {
      on: jest.fn(),
      end: jest.fn(() => {
        const cb = https.request.mock.calls[0][2];
        cb({
          statusCode: 200,
          headers: {},
          on: jest.fn(),
          destroy: mockDestroy
        });
      }),
      destroy: jest.fn()
    };
    https.request.mockReturnValue(req);

    await validator.validate(mockWebsite, mockContext);

    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
