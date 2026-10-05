'use strict';

const dns = require('dns').promises;
const DnsValidator = require('../../../src/validators/dns/DnsValidator');
const Website = require('../../../src/models/Website');
const { STATUS } = require('../../../src/models/ValidationResult');

// Mock Node's dns module
jest.mock('dns', () => ({
  promises: {
    resolveCname: jest.fn(),
    resolve4: jest.fn()
  }
}));

describe('DnsValidator', () => {
  let validator;
  let context;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new DnsValidator();
    context = {
      config: {
        retry: { maxRetries: 1 },
        dns: { timeoutMs: 1000, smartonlineBaseDomain: 'smartonline.com.au' }
      }
    };
  });

  const runValidator = async (domainType, url) => {
    const website = new Website({ id: '1', name: 'Test', url, domainType });
    return await validator.validate(website, context);
  };

  describe('SmartOnline Domain', () => {
    it('should PASS when resolving to an exact base domain match', async () => {
      dns.resolveCname.mockRejectedValueOnce({ code: 'ENODATA' });
      dns.resolve4.mockResolvedValueOnce(['1.2.3.4']);
      
      const result = await runValidator('smartonline', 'https://smartonline.com.au');
      
      expect(result.status).toBe(STATUS.PASS);
      expect(result.message).toMatch(/Recognized SmartOnline relationship/i);
    });

    it('should PASS when resolving to a recognized CNAME', async () => {
      dns.resolveCname.mockResolvedValueOnce(['amalis.smartonline.com.au']);
      dns.resolve4.mockResolvedValueOnce(['1.2.3.4']);
      
      const result = await runValidator('smartonline', 'https://test.smartonline.com.au');
      
      expect(result.status).toBe(STATUS.PASS);
      expect(result.message).toMatch(/Recognized SmartOnline relationship/i);
    });

    it('should WARNING when resolving to unrecognized infrastructure', async () => {
      dns.resolveCname.mockRejectedValueOnce({ code: 'ENODATA' });
      dns.resolve4.mockResolvedValueOnce(['1.2.3.4']); // Resolves, but not matching pattern
      
      const result = await runValidator('smartonline', 'https://unknown.com');
      
      expect(result.status).toBe(STATUS.WARNING);
      expect(result.message).toMatch(/missing recognized SmartOnline relationship/i);
    });

    it('should WARNING when SmartOnline hostname has external CNAME', async () => {
      // e.g. test.smartonline.com.au CNAME -> external.example.com
      dns.resolveCname.mockResolvedValueOnce(['external.example.com']);
      dns.resolve4.mockResolvedValueOnce(['1.2.3.4']);
      
      const result = await runValidator('smartonline', 'https://test.smartonline.com.au');
      
      expect(result.status).toBe(STATUS.WARNING);
      expect(result.message).toMatch(/missing recognized SmartOnline relationship/i);
    });

    it('should FAIL when resolution fails completely', async () => {
      dns.resolveCname.mockRejectedValueOnce({ code: 'ENOTFOUND' });
      dns.resolve4.mockRejectedValueOnce({ code: 'ENOTFOUND' });
      
      const result = await runValidator('smartonline', 'https://notfound.example.com');
      
      expect(result.status).toBe(STATUS.FAIL);
      expect(result.message).toMatch(/DNS resolution failed/i);
    });
  });

  describe('Custom Domain', () => {
    it('should PASS when CNAME points to SmartOnline', async () => {
      dns.resolveCname.mockResolvedValueOnce(['custom.smartonline.com.au']);
      dns.resolve4.mockResolvedValueOnce(['1.2.3.4']);
      
      const result = await runValidator('custom', 'https://mycustom.com');
      
      expect(result.status).toBe(STATUS.PASS);
    });

    it('should WARNING when resolving to external infrastructure', async () => {
      dns.resolveCname.mockResolvedValueOnce(['external.example.com']);
      dns.resolve4.mockResolvedValueOnce(['1.2.3.4']);
      
      const result = await runValidator('custom', 'https://mycustom.com');
      
      expect(result.status).toBe(STATUS.WARNING);
      expect(result.message).toMatch(/external\/unrecognized/i);
    });

    it('should FAIL when resolution fails completely', async () => {
      dns.resolveCname.mockRejectedValueOnce({ code: 'ENOTFOUND' });
      dns.resolve4.mockRejectedValueOnce({ code: 'ENOTFOUND' });
      
      const result = await runValidator('custom', 'https://mycustom.com');
      
      expect(result.status).toBe(STATUS.FAIL);
    });
  });

  describe('Timeouts', () => {
    it('should fail on timeout', async () => {
      context.config.dns.timeoutMs = 10;
      
      dns.resolveCname.mockRejectedValue(new Error('DNS resolution timeout'));
      dns.resolve4.mockRejectedValue(new Error('DNS resolution timeout'));

      const result = await runValidator('smartonline', 'https://timeout.com');
      
      expect(result.status).toBe(STATUS.FAIL);
      expect(result.message).toMatch(/DNS resolution timeout/);
    });
  });

  describe('Invalid URL Format', () => {
    it('should ERROR when the URL cannot be parsed', async () => {
      const result = await runValidator('smartonline', 'not-a-valid-url');
      expect(result.status).toBe(STATUS.ERROR);
      expect(result.message).toMatch(/Invalid URL format/i);
    });
  });
});
