const ConfigurationManager = require('../../src/core/ConfigurationManager');
const defaultConfig = require('../../config/default');

describe('ConfigurationManager', () => {
  it('should return default config when no overrides provided', () => {
    const config = ConfigurationManager.resolve();
    expect(config.rotation.count).toBe(defaultConfig.rotation.count);
    expect(config.concurrency.infrastructureConcurrency).toBe(5);
  });

  it('should apply file overrides', () => {
    const fileOverrides = {
      concurrency: {
        infrastructureConcurrency: 10
      }
    };
    
    const config = ConfigurationManager.resolve(fileOverrides);
    expect(config.concurrency.infrastructureConcurrency).toBe(10);
    expect(config.concurrency.browserWorkers).toBe(1); // untouched
  });

  it('should apply CLI overrides over file overrides', () => {
    const fileOverrides = {
      concurrency: { infrastructureConcurrency: 10 }
    };
    const cliOverrides = {
      concurrency: { infrastructureConcurrency: 20 }
    };
    
    const config = ConfigurationManager.resolve(fileOverrides, cliOverrides);
    expect(config.concurrency.infrastructureConcurrency).toBe(20);
  });
});
