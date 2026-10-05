'use strict';

const Website = require('../models/Website');

class ScopeResolver {
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
      for (const target of scope.websites) {
        const site = allWebsites.find(s => s.id === target || s.url === target || s.name === target);
        if (site) {
          // Allow inactive websites if they are explicitly selected
          specificSites.push(site);
        } else {
          // If a site is not found in the inventory, we can't test it
          throw new Error(`Website not found in inventory: ${target}`);
        }
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
      if (!scope.url) {
        throw new Error('Ad-hoc scope requires a url');
      }
      
      let host;
      try {
        const parsed = new URL(scope.url);
        host = parsed.hostname;
      } catch (err) {
        throw new Error(`Invalid ad-hoc URL provided: ${scope.url}`);
      }
      
      const shortId = host.replace(/[^a-z0-9]/gi, '-').substring(0, 30);
      
      return [new Website({
        id: `adhoc-${shortId}`,
        name: `Ad-hoc: ${host}`,
        url: scope.url,
        active: true,
        domainType: 'custom'
      })];
    }

    throw new Error(`Unsupported scope type: ${scope.type}`);
  }
}

module.exports = ScopeResolver;
