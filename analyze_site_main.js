const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://accomplish.staging-smartonline.com.au', { waitUntil: 'load' });
  
  const tags = await page.evaluate(() => {
    return {
      mainDivs: Array.from(document.querySelectorAll('div'))
        .filter(d => d.className.includes('elementor') && !d.className.includes('header') && !d.className.includes('footer'))
        .map(d => d.className)
        .slice(0, 10),
      hasWpPage: !!document.querySelector('[data-elementor-type="wp-page"]'),
      siteContent: !!document.querySelector('.site-content, #content, .content-area, article'),
      article: !!document.querySelector('article')
    };
  });
  
  console.log(JSON.stringify(tags, null, 2));
  await browser.close();
})();
