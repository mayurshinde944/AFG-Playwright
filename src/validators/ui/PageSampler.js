'use strict';

class PageSampler {
  /**
   * Extract links from the page.
   * @param {import('playwright').Page} page
   * @returns {Promise<Array<{href: string, text: string}>>}
   */
  static async extractLinks(page) {
    return page.$$eval('a', anchors => anchors.map(a => ({
      href: a.href || '',
      text: (a.innerText || a.textContent || '').trim().toLowerCase()
    })));
  }

  /**
   * Filter, normalize, and sample the pages.
   * 
   * @param {string} baseUrl
   * @param {Array<{href: string, text: string}>} rawLinks
   * @param {number} maxPages
   * @param {function} randomFn
   * @returns {string[]} Selected URLs
   */
  static sample(baseUrl, rawLinks, maxPages = 10, randomFn = Math.random) {
    if (maxPages <= 1) return [baseUrl];

    let baseHost;
    try {
      baseHost = new URL(baseUrl).hostname;
    } catch (e) {
      return [baseUrl]; // Malformed baseUrl fallback
    }
    
    // Extensions to exclude
    const excludeExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.zip', 
                         '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.mp4', '.mp3'];

    const validLinks = new Map(); // normalized URL -> priority score

    const normalizeUrl = (href) => {
      try {
        const urlObj = new URL(href);
        // Ensure same host
        if (urlObj.hostname !== baseHost) return null;
        // Ensure http/https
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') return null;
        
        // Exclude static resources
        const pathname = urlObj.pathname.toLowerCase();
        if (excludeExts.some(ext => pathname.endsWith(ext))) return null;

        // Remove hash
        urlObj.hash = '';

        // Normalize trailing slash (remove if present and path is not just '/')
        let finalStr = urlObj.toString();
        if (finalStr.endsWith('/') && urlObj.pathname !== '/') {
          finalStr = finalStr.slice(0, -1);
        }

        // Exclude if it perfectly matches baseUrl after normalization
        const baseObj = new URL(baseUrl);
        baseObj.hash = '';
        let normBase = baseObj.toString();
        if (normBase.endsWith('/') && baseObj.pathname !== '/') {
          normBase = normBase.slice(0, -1);
        }

        if (finalStr === normBase) return null;

        return finalStr;
      } catch (e) {
        return null; // Malformed URL
      }
    };

    const isPriority = (urlStr, text) => {
      try {
        const path = new URL(urlStr).pathname.toLowerCase();
        const keywords = ['about', 'contact', 'services', 'products', 'calculator', 'faq', 'location'];
        
        for (const kw of keywords) {
          if (path.includes(kw) || text.includes(kw)) {
            return true;
          }
        }
        return false;
      } catch (e) {
        return false;
      }
    };

    for (const link of rawLinks) {
      if (!link.href) continue;
      if (link.href.startsWith('mailto:') || link.href.startsWith('tel:') || link.href.startsWith('javascript:')) continue;
      
      const normalized = normalizeUrl(link.href);
      if (normalized) {
        const priority = isPriority(normalized, link.text);
        // Only set if not already set, or upgrade to priority if it is
        if (!validLinks.has(normalized)) {
          validLinks.set(normalized, priority);
        } else if (priority) {
          validLinks.set(normalized, true);
        }
      }
    }

    const priorityPages = [];
    const randomPages = [];

    for (const [url, isPrio] of validLinks.entries()) {
      if (isPrio) {
        priorityPages.push(url);
      } else {
        randomPages.push(url);
      }
    }

    // Select up to 3 priority pages
    const selectedPriority = [];
    // Shuffle priority pages for fairness if there are more than 3
    const shuffledPriority = priorityPages.sort(() => randomFn() - 0.5);
    for (let i = 0; i < Math.min(3, shuffledPriority.length); i++) {
      selectedPriority.push(shuffledPriority[i]);
    }

    const remainingQuota = (maxPages - 1) - selectedPriority.length;
    
    // Select random pages for remaining
    const selectedRandom = [];
    const shuffledRandom = randomPages.sort(() => randomFn() - 0.5);
    for (let i = 0; i < Math.min(remainingQuota, shuffledRandom.length); i++) {
      selectedRandom.push(shuffledRandom[i]);
    }

    return [baseUrl, ...selectedPriority, ...selectedRandom];
  }
}

module.exports = PageSampler;
