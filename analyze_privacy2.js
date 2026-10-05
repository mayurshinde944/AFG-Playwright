const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://accomplish.staging-smartonline.com.au/privacy-policy/', { waitUntil: 'load' });
  
  const analysis = await page.evaluate(() => {
    return {
      siteContent: !!document.querySelector('.site-content'),
      content: !!document.querySelector('#content'),
      pageContent: !!document.querySelector('.page-content'),
      entryContent: !!document.querySelector('.entry-content'),
      elementorNonHeaderFooter: !!document.querySelector('.elementor:not(.elementor-location-header):not(.elementor-location-footer)')
    };
  });
  
  console.log(JSON.stringify(analysis, null, 2));
  await browser.close();
})();
