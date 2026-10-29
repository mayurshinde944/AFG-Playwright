const ExecutionRequest = require('../../src/models/ExecutionRequest');

describe('ExecutionRequest Model', () => {
  it('should validate successfully for valid request', () => {
    const req = new ExecutionRequest({
      scope: { type: 'random', count: 5 },
      preset: 'DAILY_QA'
    });
    expect(req.validate()).toHaveLength(0);
  });

  it('should fail validation if specific scope has no websites', () => {
    const req = new ExecutionRequest({
      scope: { type: 'specific', websites: [] }
    });
    expect(req.validate().length).toBeGreaterThan(0);
  });

  describe('Ad-Hoc Scope Validation', () => {
    it('should validate single url adhoc request', () => {
      const req = new ExecutionRequest({
        scope: { type: 'adhoc', url: 'https://example.com' }
      });
      expect(req.validate()).toHaveLength(0);
    });

    it('should validate multi-URL urls array adhoc request', () => {
      const req = new ExecutionRequest({
        scope: { type: 'adhoc', urls: ['https://site1.com', 'https://site2.com'] }
      });
      expect(req.validate()).toHaveLength(0);
    });

    it('should fail validation if adhoc scope has neither url nor urls', () => {
      const req = new ExecutionRequest({
        scope: { type: 'adhoc' }
      });
      const errors = req.validate();
      expect(errors).toContain('scope.url or scope.urls is required for adhoc scope');
    });

    it('should fail validation if adhoc scope specifies both url and urls', () => {
      const req = new ExecutionRequest({
        scope: { type: 'adhoc', url: 'https://site1.com', urls: ['https://site2.com'] }
      });
      const errors = req.validate();
      expect(errors).toContain('Specify only one of scope.url or scope.urls for adhoc scope');
    });

    it('should fail validation if adhoc urls is not an array', () => {
      const req = new ExecutionRequest({
        scope: { type: 'adhoc', urls: 'https://site1.com' }
      });
      const errors = req.validate();
      expect(errors).toContain('scope.urls must be an array of website URLs');
    });

    it('should fail validation if adhoc urls array is empty', () => {
      const req = new ExecutionRequest({
        scope: { type: 'adhoc', urls: [] }
      });
      const errors = req.validate();
      expect(errors).toContain('scope.urls array cannot be empty');
    });

    it('should fail validation if adhoc urls exceeds 10 items', () => {
      const req = new ExecutionRequest({
        scope: {
          type: 'adhoc',
          urls: [
            'https://site1.com', 'https://site2.com', 'https://site3.com',
            'https://site4.com', 'https://site5.com', 'https://site6.com',
            'https://site7.com', 'https://site8.com', 'https://site9.com',
            'https://site10.com', 'https://site11.com'
          ]
        }
      });
      const errors = req.validate();
      expect(errors).toContain('scope.urls cannot exceed 10 URLs');
    });

    it('should fail validation if any item in urls is non-string or whitespace', () => {
      const req = new ExecutionRequest({
        scope: { type: 'adhoc', urls: ['https://site1.com', '   ', 123] }
      });
      const errors = req.validate();
      expect(errors).toContain('scope.urls[1] must be a non-empty string');
      expect(errors).toContain('scope.urls[2] must be a non-empty string');
    });
  });
});
