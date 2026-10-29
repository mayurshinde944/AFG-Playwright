'use strict';

const Website = require('../models/Website');

class ScopeResolver {
  /**
   * Normalizes a URL for consistent matching and duplicate detection.
   * - Trims leading and trailing whitespace
   * - Lowercases hostname
   * - Normalizes default ports (:80 for http, :443 for https)
   * - Normalizes trailing slash on subpaths while preserving root /
   * - Preserves distinct paths and query strings
   * - Strips client-side fragments (#...)
   * - Enforces http: or https: protocols
   *
   * @param {string} rawUrl
   * @returns {string} Normalized URL
   */
  static normalizeUrl(rawUrl) {
    if (typeof rawUrl !== 'string') {
      throw new Error(`Invalid ad-hoc URL provided: ${rawUrl}`);
    }
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      throw new Error(`Invalid ad-hoc URL provided: ${rawUrl}`);
    }
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (err) {
      throw new Error(`Invalid ad-hoc URL provided: ${trimmed}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid ad-hoc URL provided: ${trimmed}. Only http: and https: protocols are supported.`);
    }

    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    const port = (parsed.port && parsed.port !== '80' && parsed.port !== '443') ? `:${parsed.port}` : '';

    let pathname = parsed.pathname || '/';
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
    }

    const search = parsed.search || '';

    return `${protocol}//${host}${port}${pathname}${search}`;
  }

  /**
   * Resolves the final list of websites based on the requested scope.
   * 
   * @param {import('../models/ExecutionRequest')} request 
   * @param {import('../models/Website')[]} allWebsites 
   * @param {object} options 
   * @param {number} [options.rotationCount] 
   * @returns {import('../models/Website')[]}
   */
  static resolve(request, allWebsites, options = {}) {
    const scope = request.scope;
    
    if (scope.type === 'all') {
      // Exclude inactive websites from ALL scope
      return allWebsites.filter(site => site.isActive());
    }

    if (scope.type === 'specific') {
      if (!scope.websites || scope.websites.length === 0) {
        throw new Error('Specific scope requires a list of website IDs or URLs');
      }
      
      const specificSites = [];
      const missingSites = [];
      for (const target of scope.websites) {
        const site = allWebsites.find(s => s.id === target || s.url === target || s.name === target);
        if (site) {
          // Allow inactive websites if they are explicitly selected
          specificSites.push(site);
        } else {
          // If a site is not found in the inventory, we can't test it
          missingSites.push(target);
        }
      }

      if (missingSites.length > 0) {
        if (missingSites.length === 1) {
          throw new Error(`Website not found in inventory: ${missingSites[0]}`);
        }
        throw new Error(`Websites not found in inventory: ${missingSites.join(', ')}`);
      }

      return specificSites;
    }

    if (scope.type === 'random' || scope.type === 'rotation') {
      // Exclude inactive websites from automatic rotation
      const activeWebsites = allWebsites.filter(site => site.isActive());
      const count = scope.count || options.rotationCount || 15;
      
      // Sort strategy:
      // 1. Never tested websites (lastTestedAt is null/undefined) come first
      // 2. Websites tested longest ago come next
      // 3. Randomize among equals (not strictly implemented in this basic sort for simplicity,
      //    but in a real rotation, we'd group and shuffle).
      
      const sortedWebsites = [...activeWebsites].sort((a, b) => {
        if (!a.lastTestedAt && !b.lastTestedAt) return Math.random() - 0.5;
        if (!a.lastTestedAt) return -1;
        if (!b.lastTestedAt) return 1;
        
        const dateA = new Date(a.lastTestedAt).getTime();
        const dateB = new Date(b.lastTestedAt).getTime();
        
        if (dateA === dateB) return Math.random() - 0.5;
        return dateA - dateB;
      });

      return sortedWebsites.slice(0, count);
    }

    if (scope.type === 'adhoc') {
      const hasUrl = scope.url !== undefined;
      const hasUrls = scope.urls !== undefined;

      if (!hasUrl && !hasUrls) {
        throw new Error('Ad-hoc scope requires a url');
      }

      if (hasUrl && !scope.url) {
        throw new Error('Ad-hoc scope requires a url');
      }

      const rawTargets = hasUrls ? scope.urls : [scope.url];
      if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
        throw new Error('Ad-hoc scope requires a non-empty list of URLs');
      }
      if (rawTargets.length > 10) {
        throw new Error('Ad-hoc scope cannot exceed 10 URLs');
      }

      const websites = [];
      const seenNormalized = new Set();
      const seenSlugs = new Map();

      for (const target of rawTargets) {
        const normalized = ScopeResolver.normalizeUrl(target);
        if (seenNormalized.has(normalized)) {
          throw new Error(`Duplicate URL detected in batch: ${target}`);
        }
        seenNormalized.add(normalized);

        const parsed = new URL(normalized);
        const hostSlug = parsed.hostname.replace(/[^a-z0-9]/gi, '-').substring(0, 30);
        let pathSlug = '';
        if (parsed.pathname && parsed.pathname !== '/') {
          const cleanPath = parsed.pathname.toLowerCase().replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 20);
          if (cleanPath) {
            pathSlug = `-${cleanPath}`;
          }
        }

        const baseSlug = `adhoc-${hostSlug}${pathSlug}`;
        const count = (seenSlugs.get(baseSlug) || 0) + 1;
        seenSlugs.set(baseSlug, count);
        const id = count === 1 ? baseSlug : `${baseSlug}-${count}`;

        const nameSuffix = parsed.pathname !== '/' ? parsed.pathname : '';
        websites.push(new Website({
          id,
          name: `Ad-hoc: ${parsed.hostname}${nameSuffix}`,
          url: typeof target === 'string' ? target.trim() : normalized,
          active: true,
          domainType: 'custom'
        }));
      }

      return websites;
    }

    throw new Error(`Unsupported scope type: ${scope.type}`);
  }
}

module.exports = ScopeResolver;
