/**
 * Inventory Provider — Abstract Interface
 *
 * Defines the contract for loading website records.
 * All inventory sources (CSV, Excel, future database) implement this interface.
 *
 * See: ARCHITECTURE.md §3
 */

'use strict';

class InventoryProvider {
  /**
   * Load all website records from the inventory source.
   * Returns both active and inactive websites — filtering is the
   * responsibility of the ScopeResolver, not the loader.
   *
   * @returns {Promise<import('../models/Website')[]>}
   */
  async loadWebsites() {
    throw new Error('loadWebsites() must be implemented by subclass');
  }
}

module.exports = InventoryProvider;
