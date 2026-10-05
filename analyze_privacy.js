const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://accomplish.staging-smartonline.com.au/privacy-policy/', { waitUntil: 'load' });
  
  const analysis = await page.evaluate(() => {
    const allDivs = Array.from(document.querySelectorAll('div'));
    
    // Check which selectors actually match anything
    const checks = {
      'main': !!document.querySelector('main'),
      '#main': !!document.querySelector('#main'),
      '.site-main': !!document.querySelector('.site-main'),
      '[data-elementor-type="wp-page"]': !!document.querySelector('[data-elementor-type="wp-page"]'),
      '[data-elementor-type="single"]': !!document.querySelector('[data-elementor-type="single"]'),
      '[data-elementor-type="wp-post"]': !!document.querySelector('[data-elementor-type="wp-post"]'),
      '.elementor-location-single': !!document.querySelector('.elementor-location-single'),
      'article': !!document.querySelector('article'),
      '.elementor-widget-theme-post-content': !!document.querySelector('.elementor-widget-theme-post-content')
    };

    // Find top level divs inside body, excluding header and footer
    const topLevelElements = Array.from(document.body.children)
      .filter(el => !el.tagName.match(/SCRIPT|NOSCRIPT|STYLE|LINK|HEADER|FOOTER/i) 
                  && !el.className.includes('header') 
                  && !el.className.includes('footer'))
      .map(el => ({
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        datasetType: el.dataset.elementorType,
        childrenCount: el.children.length
      }));

    return { checks, topLevelElements };
  });
  
  console.log(JSON.stringify(analysis, null, 2));
  await browser.close();
})();
