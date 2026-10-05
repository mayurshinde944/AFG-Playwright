const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://accomplish.staging-smartonline.com.au', { waitUntil: 'load' });
  
  const tags = await page.evaluate(() => {
    return {
      header: !!document.querySelector('header'),
      headerClasses: document.querySelector('header') ? document.querySelector('header').className : null,
      logo: !!document.querySelector('.site-logo, .custom-logo, img[alt*="logo" i]'),
      nav: !!document.querySelector('nav'),
      navClasses: document.querySelector('nav') ? document.querySelector('nav').className : null,
      main: !!document.querySelector('main, #main, .site-main'),
      mainClasses: document.querySelector('main') ? document.querySelector('main').className : null,
      footer: !!document.querySelector('footer, .site-footer'),
      footerClasses: document.querySelector('footer') ? document.querySelector('footer').className : null
    };
  });
  
  console.log(JSON.stringify(tags, null, 2));
  await browser.close();
})();
