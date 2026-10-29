const ScopeResolver = require('../../src/core/ScopeResolver');
const Website = require('../../src/models/Website');

describe('ScopeResolver', () => {
  const activeNeverTested = new Website({ id: '1', name: 'A', url: 'http://a.com', active: true });
  const activeOldest = new Website({ id: '2', name: 'B', url: 'http://b.com', active: true, lastTestedAt: '2024-01-01' });
  const activeRecent = new Website({ id: '3', name: 'C', url: 'http://c.com', active: true, lastTestedAt: '2024-06-01' });
  const inactive = new Website({ id: '4', name: 'D', url: 'http://d.com', active: false });

  const allWebsites = [activeOldest, inactive, activeRecent, activeNeverTested];

  it('should exclude inactive sites from ALL scope', () => {
    const req = { scope: { type: 'all' } };
    const resolved = ScopeResolver.resolve(req, allWebsites);
    expect(resolved.length).toBe(3);
    expect(resolved.some(w => w.id === '4')).toBe(false);
  });

  it('should allow inactive sites for SPECIFIC scope if selected', () => {
    const req = { scope: { type: 'specific', websites: ['4'] } };
    const resolved = ScopeResolver.resolve(req, allWebsites);
    expect(resolved.length).toBe(1);
    expect(resolved[0].id).toBe('4');
  });

  it('should exclude inactive sites from RANDOM scope and prioritize correctly', () => {
    const req = { scope: { type: 'random', count: 2 } };
    const resolved = ScopeResolver.resolve(req, allWebsites);
    
    expect(resolved.length).toBe(2);
    expect(resolved.some(w => w.id === '4')).toBe(false); // Inactive excluded
    
    // Never tested should be first
    expect(resolved[0].id).toBe('1');
    // Oldest should be second
    expect(resolved[1].id).toBe('2');
  });

  it('should resolve multiple valid websites for SPECIFIC scope', () => {
    const req = { scope: { type: 'specific', websites: ['1', '2'] } };
    const resolved = ScopeResolver.resolve(req, allWebsites);
    expect(resolved.length).toBe(2);
    expect(resolved.map(w => w.id)).toEqual(['1', '2']);
  });

  it('should throw clear error when an identifier in SPECIFIC scope is not found', () => {
    const req = { scope: { type: 'specific', websites: ['1', 'nonexistent-id'] } };
    expect(() => ScopeResolver.resolve(req, allWebsites)).toThrow('Website not found in inventory: nonexistent-id');
  });

  it('should throw clear error listing multiple missing identifiers in SPECIFIC scope', () => {
    const req = { scope: { type: 'specific', websites: ['missing-1', 'missing-2'] } };
    expect(() => ScopeResolver.resolve(req, allWebsites)).toThrow('Websites not found in inventory: missing-1, missing-2');
  });

  describe('normalizeUrl', () => {
    it('should trim surrounding whitespace', () => {
      expect(ScopeResolver.normalizeUrl('   https://example.com/   ')).toBe('https://example.com/');
    });

    it('should lowercase hostname', () => {
      expect(ScopeResolver.normalizeUrl('https://EXAMPLE.COM/about')).toBe('https://example.com/about');
    });

    it('should remove default ports for http and https', () => {
      expect(ScopeResolver.normalizeUrl('http://example.com:80/path')).toBe('http://example.com/path');
      expect(ScopeResolver.normalizeUrl('https://example.com:443/path')).toBe('https://example.com/path');
    });

    it('should preserve non-default ports', () => {
      expect(ScopeResolver.normalizeUrl('https://example.com:8443/path')).toBe('https://example.com:8443/path');
    });

    it('should normalize trailing slash on subpaths while preserving root slash', () => {
      expect(ScopeResolver.normalizeUrl('https://example.com')).toBe('https://example.com/');
      expect(ScopeResolver.normalizeUrl('https://example.com/')).toBe('https://example.com/');
      expect(ScopeResolver.normalizeUrl('https://example.com/about/')).toBe('https://example.com/about');
      expect(ScopeResolver.normalizeUrl('https://example.com/about')).toBe('https://example.com/about');
    });

    it('should preserve distinct paths and query strings', () => {
      expect(ScopeResolver.normalizeUrl('https://example.com/about?v=1')).toBe('https://example.com/about?v=1');
      expect(ScopeResolver.normalizeUrl('https://example.com/about?v=2')).toBe('https://example.com/about?v=2');
      expect(ScopeResolver.normalizeUrl('https://example.com/contact')).toBe('https://example.com/contact');
    });

    it('should strip client fragments', () => {
      expect(ScopeResolver.normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
      expect(ScopeResolver.normalizeUrl('https://example.com/#section')).toBe('https://example.com/');
    });

    it('should reject non-http/https protocols', () => {
      expect(() => ScopeResolver.normalizeUrl('ftp://example.com')).toThrow(/Only http: and https: protocols are supported/);
      expect(() => ScopeResolver.normalizeUrl('javascript:alert(1)')).toThrow();
    });

    it('should reject invalid URL strings', () => {
      expect(() => ScopeResolver.normalizeUrl('not-a-valid-url')).toThrow('Invalid ad-hoc URL provided: not-a-valid-url');
      expect(() => ScopeResolver.normalizeUrl('')).toThrow();
    });
  });

  describe('Ad-Hoc Scope Multi-URL Resolution', () => {
    it('should resolve multiple valid ad-hoc URLs into Website instances', () => {
      const req = {
        scope: {
          type: 'adhoc',
          urls: ['https://site1.com', 'https://site2.com/about', 'https://site3.com.au']
        }
      };
      const resolved = ScopeResolver.resolve(req, allWebsites);
      expect(resolved).toHaveLength(3);
      expect(resolved[0].url).toBe('https://site1.com');
      expect(resolved[1].url).toBe('https://site2.com/about');
      expect(resolved[2].url).toBe('https://site3.com.au');
    });

    it('should assign unique internal website IDs even for URLs sharing the same hostname', () => {
      const req = {
        scope: {
          type: 'adhoc',
          urls: [
            'https://example.com',
            'https://example.com/services',
            'https://example.com/contact',
            'https://example.com/services?tab=2'
          ]
        }
      };
      const resolved = ScopeResolver.resolve(req, allWebsites);
      expect(resolved).toHaveLength(4);

      const ids = resolved.map(w => w.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(4);
      expect(ids[0]).toBe('adhoc-example-com');
      expect(ids[1]).toBe('adhoc-example-com-services');
      expect(ids[2]).toBe('adhoc-example-com-contact');
      expect(ids[3]).toBe('adhoc-example-com-services-2');
    });

    it('should throw an error if duplicate URLs exist in the batch (normalized)', () => {
      const req = {
        scope: {
          type: 'adhoc',
          urls: [
            'https://EXAMPLE.com/about/',
            '  https://example.com/about  '
          ]
        }
      };
      expect(() => ScopeResolver.resolve(req, allWebsites)).toThrow(/Duplicate URL detected in batch/);
    });

    it('should throw an error and reject the entire batch if any URL is invalid', () => {
      const req = {
        scope: {
          type: 'adhoc',
          urls: ['https://valid-site.com', 'invalid-url-string', 'https://another-site.com']
        }
      };
      expect(() => ScopeResolver.resolve(req, allWebsites)).toThrow('Invalid ad-hoc URL provided: invalid-url-string');
    });

    it('should preserve backward compatibility for single url ad-hoc scope', () => {
      const req = {
        scope: {
          type: 'adhoc',
          url: 'https://example.com'
        }
      };
      const resolved = ScopeResolver.resolve(req, allWebsites);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe('adhoc-example-com');
      expect(resolved[0].url).toBe('https://example.com');
    });
  });
});
