'use strict';

const fs = require('fs');
const path = require('path');
const BaselineManager = require('../../src/core/BaselineManager');

// Mock Playwright to avoid real browser launches during unit tests
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue({
            ok: () => true,
            status: () => 200
          }),
          waitForSelector: jest.fn().mockResolvedValue(true),
          evaluate: jest.fn().mockResolvedValue({
            header: { exists: true, detectedSelector: '.site-header', tagName: 'HEADER', childCount: 3 },
            footer: { exists: true, detectedSelector: '.site-footer', tagName: 'FOOTER', childCount: 4 }
          }),
          close: jest.fn().mockResolvedValue(true)
        }),
        close: jest.fn().mockResolvedValue(true)
      }),
      close: jest.fn().mockResolvedValue(true)
    })
  }
}));

describe('BaselineManager', () => {
  const testDir = path.join(__dirname, 'test_baselines');
  const testFile = path.join(testDir, 'test-baseline.json');
  
  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });
  
  afterEach(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });
  
  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });

  describe('validate()', () => {
    it('should throw if data is empty', () => {
      expect(() => BaselineManager.validate(null)).toThrow('Baseline data is empty');
    });

    it('should throw if schemaVersion is not 1.1', () => {
      expect(() => BaselineManager.validate({ schemaVersion: '1.0' }))
        .toThrow('Unsupported baseline schema version. Expected 1.1');
    });

    it('should throw if missing masterUrl', () => {
      expect(() => BaselineManager.validate({ schemaVersion: '1.1' }))
        .toThrow('Missing masterUrl in baseline');
    });

    it('should throw if missing globalComponents', () => {
      expect(() => BaselineManager.validate({ schemaVersion: '1.1', masterUrl: 'http://test.com' }))
        .toThrow('Missing globalComponents in baseline');
    });

    it('should pass for valid data', () => {
      expect(() => BaselineManager.validate({
        schemaVersion: '1.1',
        masterUrl: 'http://test.com',
        globalComponents: {}
      })).not.toThrow();
    });
  });

  describe('save() and load()', () => {
    const validData = {
      schemaVersion: '1.1',
      masterUrl: 'http://master.test',
      globalComponents: {
        header: { exists: true, detectedSelector: '.header', tagName: 'HEADER', childCount: 2 }
      }
    };

    it('should save and load valid baseline correctly atomically', () => {
      // Mock renameSync to prove atomic behavior, or just test file output natively
      BaselineManager.save(validData, testFile);
      
      const loaded = BaselineManager.load(testFile);
      expect(loaded).toBeDefined();
      expect(loaded.masterUrl).toBe('http://master.test');
      expect(loaded.updatedAt).toBeDefined(); // should be auto-added
      expect(loaded.globalComponents.header.detectedSelector).toBe('.header');
      expect(loaded.globalComponents.header.tagName).toBe('HEADER');
    });

    it('should return null if file is missing without throwing', () => {
      const loaded = BaselineManager.load(path.join(testDir, 'does-not-exist.json'));
      expect(loaded).toBeNull();
    });

    it('should throw error if file is corrupt (invalid JSON)', () => {
      fs.writeFileSync(testFile, '{ corrupt json ', 'utf8');
      expect(() => BaselineManager.load(testFile)).toThrow(/Failed to load baseline from/);
    });
    
    it('should throw error if file is loaded but schema is invalid', () => {
      fs.writeFileSync(testFile, JSON.stringify({ invalid: 'data' }), 'utf8');
      expect(() => BaselineManager.load(testFile)).toThrow(/Failed to load baseline from/);
    });
  });

  describe('generate()', () => {
    it('should generate a baseline object successfully via Playwright', async () => {
      const result = await BaselineManager.generate('http://master.example.com');
      
      expect(result).toBeDefined();
      expect(result.schemaVersion).toBe('1.1');
      expect(result.masterUrl).toBe('http://master.example.com');
      expect(result.globalComponents.header).toBeDefined();
      expect(result.globalComponents.header.detectedSelector).toBe('.site-header');
      expect(result.globalComponents.header.tagName).toBe('HEADER');
      expect(result.globalComponents.header.childCount).toBe(3);
      expect(result.globalComponents.footer).toBeDefined();
    });
  });
});
