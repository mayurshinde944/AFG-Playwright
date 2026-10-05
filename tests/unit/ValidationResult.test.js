const { ValidationResult, STATUS } = require('../../src/models/ValidationResult');

describe('ValidationResult Model', () => {
  it('should create valid object', () => {
    const res = new ValidationResult({
      websiteId: '1', validatorName: 'dns', status: STATUS.PASS
    });
    expect(res.validate()).toHaveLength(0);
    expect(res.isPassed()).toBe(true);
  });

  it('should enforce valid status', () => {
    const res = new ValidationResult({
      websiteId: '1', validatorName: 'dns', status: 'UNKNOWN'
    });
    expect(res.validate().length).toBeGreaterThan(0);
  });
});
