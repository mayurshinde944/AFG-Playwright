const Website = require('../../src/models/Website');

describe('Website Model', () => {
  it('should create from inventory record', () => {
    const site = Website.fromRecord({
      id: 'test-1',
      name: 'Test Site',
      url: 'http://test.com',
      active: 'true'
    });
    
    expect(site.id).toBe('test-1');
    expect(site.name).toBe('Test Site');
    expect(site.url).toBe('http://test.com');
    expect(site.isActive()).toBe(true);
  });

  it('should handle false/0 as inactive', () => {
    const site = Website.fromRecord({ id: '1', name: 'A', url: 'http://a.com', active: 'false' });
    expect(site.isActive()).toBe(false);
  });
});
