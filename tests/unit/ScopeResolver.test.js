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
});
