const ValidatorRegistry = require('../../src/core/ValidatorRegistry');

describe('ValidatorRegistry', () => {
  it('should register and retrieve validators', () => {
    const registry = new ValidatorRegistry();
    class DummyValidator {}
    
    registry.register('dns', DummyValidator, { type: 'lightweight' });
    
    const v = registry.get('dns');
    expect(v.implementation).toBe(DummyValidator);
    expect(v.metadata.type).toBe('lightweight');
  });

  it('should throw if invalid type is provided', () => {
    const registry = new ValidatorRegistry();
    expect(() => {
      registry.register('test', {}, { type: 'invalid' });
    }).toThrow(/Validator metadata must specify type/);
  });
});
