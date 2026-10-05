// Integration/preview test
// It's mostly a manual run script, but we can test that it doesn't immediately crash.

describe('Preview CLI', () => {
  let originalArgv;
  let originalExit;
  let originalLog;

  beforeEach(() => {
    originalArgv = process.argv;
    originalExit = process.exit;
    originalLog = console.log;
    process.exit = jest.fn();
    console.log = jest.fn();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalLog;
  });

  it('should have preview script available', async () => {
    const preview = require('../../src/cli/preview');
    expect(typeof preview).toBe('function');
  });

  it('should parse specific website argument instead of defaulting to site-002', async () => {
    process.argv = ['node', 'src/cli/preview.js', '--specific', 'dns-001', '--validator', 'http'];
    const preview = require('../../src/cli/preview');
    await preview();
    
    // We expect it to complete without exiting with 1 (which it would do if dns-001 was missing,
    // although sample.csv has dns-001 so it should succeed)
    const logs = console.log.mock.calls.map(call => call[0]).join('\n');
    expect(logs).toContain('dns-001');
    expect(logs).toContain('http');
    expect(process.exit).not.toHaveBeenCalledWith(1);
  });
});
