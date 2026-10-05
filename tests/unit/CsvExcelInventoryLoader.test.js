const CsvExcelInventoryLoader = require('../../src/inventory/CsvExcelInventoryLoader');
const path = require('path');

describe('CsvExcelInventoryLoader', () => {
  it('should load websites from CSV without filtering inactive ones', async () => {
    const filePath = path.resolve(__dirname, '../fixtures/test-inventory.csv');
    const loader = new CsvExcelInventoryLoader(filePath);
    
    const websites = await loader.loadWebsites();
    expect(websites.length).toBe(10); // All rows should load
    
    // Check specific inactive site
    const inactiveSite = websites.find(w => w.id === 'test-004');
    expect(inactiveSite).toBeDefined();
    expect(inactiveSite.isActive()).toBe(false);
  });
});
