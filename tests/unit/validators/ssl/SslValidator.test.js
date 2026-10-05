const SslValidator = require('../../../../src/validators/ssl/SslValidator');
const { STATUS } = require('../../../../src/models/ValidationResult');
const https = require('https');
const http = require('http');
const Website = require('../../../../src/models/Website');
const tls = require('tls');

jest.mock('https');
jest.mock('http');

describe('SslValidator', () => {
  let validator;
  let context;
  let website;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    validator = new SslValidator();
    context = {
      config: {
        ssl: { timeoutMs: 1000, maxRedirects: 2 }
      }
    };
    website = new Website({ id: 'test-01', name: 'Test', url: 'https://example.com' });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const setupMockRequest = (mockModule, responseMock, requestMock = {}) => {
    const activeReq = {
      on: jest.fn((event, cb) => {
        if (event === 'error' && requestMock.error) {
          cb(requestMock.error);
        }
      }),
      end: jest.fn(() => {
        if (!requestMock.error) {
          // Immediately invoke response callback to simulate network response
          if (mockModule.request.mock.calls.length > 0) {
            const cb = mockModule.request.mock.calls[mockModule.request.mock.calls.length - 1][2];
            cb(responseMock);
          }
        }
      }),
      destroy: jest.fn(),
      abort: jest.fn()
    };
    mockModule.request.mockReturnValue(activeReq);
    return activeReq;
  };

  it('should return PASS for a valid certificate and normalize details', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const mockCert = { 
      valid_from: new Date().toISOString(),
      valid_to: futureDate.toISOString(),
      subject: { CN: 'example.com' },
      issuer: { O: 'Test CA' }
    };
    const mockSocket = { getPeerCertificate: () => mockCert, authorizationError: null };
    const mockRes = { statusCode: 200, headers: {}, socket: mockSocket, on: jest.fn() };

    setupMockRequest(https, mockRes);
    jest.spyOn(tls, 'checkServerIdentity').mockReturnValue(undefined);

    const promise = validator.validate(website, context);
    jest.runAllTimers();
    const result = await promise;

    expect(result.status).toBe(STATUS.PASS);
    expect(result.details.originalUrl).toBe('https://example.com');
    expect(result.details.finalUrl).toBe('https://example.com');
    
    // Normalized check
    expect(result.details.certificateNormalized).toBeDefined();
    expect(result.details.certificateNormalized.subject).toBe('example.com');
    expect(result.details.certificateNormalized.issuer).toBe('Test CA');
    expect(result.details.certificateNormalized.validTo).toBe(mockCert.valid_to);
    expect(result.details.certificateNormalized.daysRemaining).toBeGreaterThan(364);
    
    // Raw check
    expect(result.details.certificateRaw).toBeDefined();
  });

  it('should return FAIL for an expired certificate and extract valid_to', async () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);

    const mockCert = { valid_to: pastDate.toISOString() };
    const mockSocket = { getPeerCertificate: () => mockCert, authorizationError: 'CERT_HAS_EXPIRED' };
    const mockRes = { statusCode: 200, headers: {}, socket: mockSocket, on: jest.fn() };

    setupMockRequest(https, mockRes);
    jest.spyOn(tls, 'checkServerIdentity').mockReturnValue(undefined);

    const promise = validator.validate(website, context);
    jest.runAllTimers();
    const result = await promise;

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.message).toBe('Certificate is expired');
    expect(result.evidence.error).toBe('Expired certificate');
    expect(result.details.certificateNormalized.validTo).toBe(pastDate.toISOString());
    expect(result.details.certificateNormalized.daysRemaining).toBeLessThan(0);
  });

  it('should return FAIL for a hostname mismatch (using real tls.checkServerIdentity)', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    // Provide a cert that fails tls.checkServerIdentity against "example.com"
    const mockCert = { 
      valid_to: futureDate.toISOString(), 
      subject: { CN: 'wrongdomain.com' },
      subjectaltname: 'DNS:wrongdomain.com' 
    };
    const mockSocket = { getPeerCertificate: () => mockCert, authorizationError: 'ERR_TLS_CERT_ALTNAME_INVALID' };
    const mockRes = { statusCode: 200, headers: {}, socket: mockSocket, on: jest.fn() };

    setupMockRequest(https, mockRes);
    // DO NOT mock tls.checkServerIdentity so the real Node.js logic runs
    jest.restoreAllMocks();

    const promise = validator.validate(website, context);
    jest.runAllTimers();
    const result = await promise;

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.message).toContain('Hostname mismatch');
  });

  it('should return FAIL for TLS/connection error', async () => {
    setupMockRequest(https, null, { error: new Error('ECONNREFUSED') });

    const promise = validator.validate(website, context);
    jest.runAllTimers();
    const result = await promise;

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.message).toBe('ECONNREFUSED');
    expect(result.evidence.error).toBe('ECONNREFUSED');
  });

  it('should follow a single redirect, return PASS, and evaluate the correct final cert', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const mockCert = { valid_to: futureDate.toISOString() };
    
    // First request is HTTP 301
    const mockRes1 = { statusCode: 301, headers: { location: 'https://example.com/redirected' }, on: jest.fn() };
    setupMockRequest(http, mockRes1);

    // Second request is HTTPS 200
    const mockRes2 = { statusCode: 200, headers: {}, socket: { getPeerCertificate: () => mockCert, authorizationError: null }, on: jest.fn() };
    
    https.request.mockImplementation((url, options, cb) => {
      const activeReq2 = {
        on: jest.fn(),
        end: jest.fn(() => cb(mockRes2)),
        destroy: jest.fn(),
        abort: jest.fn()
      };
      return activeReq2;
    });

    website.url = 'http://example.com';
    jest.spyOn(tls, 'checkServerIdentity').mockReturnValue(undefined);

    const promise = validator.validate(website, context);
    jest.runAllTimers();
    const result = await promise;

    // Verify 1 HTTP request and 1 HTTPS request
    expect(http.request).toHaveBeenCalledTimes(1);
    expect(https.request).toHaveBeenCalledTimes(1);

    expect(result.status).toBe(STATUS.PASS);
    expect(result.details.originalUrl).toBe('http://example.com');
    expect(result.details.finalUrl).toBe('https://example.com/redirected');
    expect(result.details.certificateRaw).toBe(mockCert);
  });

  it('should return FAIL if redirect limit is exceeded', async () => {
    // 3 redirects, limit is 2
    const mockRes = { statusCode: 301, headers: { location: 'https://example.com/loop' }, on: jest.fn() };
    setupMockRequest(https, mockRes);

    const promise = validator.validate(website, context);
    jest.runAllTimers();
    const result = await promise;

    // Verify 3 requests (initial + 2 redirects) were made before failing
    expect(https.request).toHaveBeenCalledTimes(3);
    
    expect(result.status).toBe(STATUS.FAIL);
    expect(result.message).toBe('Exceeded maximum redirects limit');
  });

  it('should handle multiple redirects up to maxRedirects', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const mockRes1 = { statusCode: 302, headers: { location: 'https://example.com/2' }, on: jest.fn() };
    const mockRes2 = { statusCode: 301, headers: { location: 'https://example.com/3' }, on: jest.fn() };
    const mockRes3 = { 
      statusCode: 200, 
      headers: {}, 
      socket: { getPeerCertificate: () => ({ valid_to: futureDate.toISOString() }), authorizationError: null }, 
      on: jest.fn() 
    };

    let reqCount = 0;
    https.request.mockImplementation((url, options, cb) => {
      reqCount++;
      const req = {
        on: jest.fn(),
        end: jest.fn(() => {
          if (reqCount === 1) cb(mockRes1);
          else if (reqCount === 2) cb(mockRes2);
          else cb(mockRes3);
        }),
        destroy: jest.fn()
      };
      return req;
    });

    jest.spyOn(tls, 'checkServerIdentity').mockReturnValue(undefined);

    const promise = validator.validate(website, context);
    jest.runAllTimers();
    const result = await promise;

    // Verify exactly 3 HTTPS requests (initial + 2 valid redirects within limit)
    expect(https.request).toHaveBeenCalledTimes(3);

    expect(result.status).toBe(STATUS.PASS);
    expect(result.details.finalUrl).toBe('https://example.com/3');
  });

  it('should timeout and abort request', async () => {
    const activeReq = {
      on: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      abort: jest.fn()
    };
    https.request.mockReturnValue(activeReq);

    const promise = validator.validate(website, context);
    
    jest.advanceTimersByTime(1100);
    
    const result = await promise;

    expect(result.status).toBe(STATUS.FAIL);
    expect(result.message).toBe('SSL validation timeout');
    expect(activeReq.destroy).toHaveBeenCalled();
  });

  it('should pass agent: false to https.request to prevent TLS session caching/resumption', async () => {
    const mockRes = { statusCode: 200, headers: {}, socket: { getPeerCertificate: () => ({ valid_to: new Date().toISOString() }), authorizationError: null }, on: jest.fn() };
    setupMockRequest(https, mockRes);
    jest.spyOn(tls, 'checkServerIdentity').mockReturnValue(undefined);

    const promise = validator.validate(website, context);
    jest.runAllTimers();
    await promise;

    expect(https.request).toHaveBeenCalled();
    const requestOptions = https.request.mock.calls[0][1];
    expect(requestOptions).toBeDefined();
    expect(requestOptions.agent).toBe(false);
  });
});
