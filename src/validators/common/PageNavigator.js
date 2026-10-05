'use strict';

class PageNavigator {
  /**
   * Navigate a page and perform bounded image waiting.
   * @param {import('playwright').Page} page
   * @param {string} url
   * @param {number} timeoutMs
   * @returns {Promise<{response: import('playwright').Response, finalUrl: string}>}
   */
  static async navigate(page, url, timeoutMs = 30000) {
    const response = await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
    const finalUrl = page.url();

    if (!url.startsWith('data:') && (!response || !response.ok())) {
      const statusCode = response ? response.status() : 'Unknown';
      throw new Error(`Navigation failed with status: ${statusCode}`);
    }

    await page.waitForSelector('body', { timeout: 5000 });

    // Bounded Image Wait (Phase 5F-2)
    // Ensure images have a chance to complete loading before evaluating layout or broken images.
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const images = Array.from(document.images).filter(img => 
          !img.complete && img.src && !img.src.startsWith('data:')
        );
        
        if (images.length === 0) {
          return resolve();
        }

        let loadedCount = 0;
        let hasResolved = false;

        const checkDone = () => {
          if (hasResolved) return;
          loadedCount++;
          if (loadedCount >= images.length) {
            hasResolved = true;
            resolve();
          }
        };

        images.forEach(img => {
          img.addEventListener('load', checkDone, { once: true });
          img.addEventListener('error', checkDone, { once: true });
        });

        // 5-second maximum wait to prevent hanging
        setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            resolve();
          }
        }, 5000);
      });
    });

    return { response, finalUrl };
  }
}

module.exports = PageNavigator;
