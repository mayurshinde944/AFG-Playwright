const ResultAggregator = require('../../src/core/ResultAggregator');
const { ValidationResult, STATUS } = require('../../src/models/ValidationResult');

describe('ResultAggregator', () => {
  it('should aggregate results and compute summaries', () => {
    const agg = new ResultAggregator();
    
    agg.add(new ValidationResult({
      websiteId: '1', validatorName: 'dns', status: STATUS.PASS, duration: 100
    }));
    agg.add(new ValidationResult({
      websiteId: '2', validatorName: 'dns', status: STATUS.FAIL, duration: 200
    }));

    const summary = agg.getSummary();
    expect(summary.total).toBe(2);
    expect(summary[STATUS.PASS]).toBe(1);
    expect(summary[STATUS.FAIL]).toBe(1);
    expect(summary.totalDurationMs).toBe(300);
    
    const bySite = agg.getByWebsite();
    expect(bySite.get('1').length).toBe(1);
  });
});
