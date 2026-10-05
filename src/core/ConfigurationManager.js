'use strict';

const defaultConfig = require('../../config/default');

class ConfigurationManager {
  /**
   * Resolve configuration from defaults and optional overrides.
   * Hierarchy: Defaults -> Config File -> CLI -> Final Config.
   * (Jenkins parameters would be passed as CLI arguments).
   *
   * @param {object} [fileOverrides={}]
   * @param {object} [cliOverrides={}]
   */
  static resolve(fileOverrides = {}, cliOverrides = {}) {
    // Deep clone default config to prevent mutation
    const config = JSON.parse(JSON.stringify(defaultConfig));

    // Merge file overrides
    ConfigurationManager._merge(config, fileOverrides);

    // Merge CLI overrides
    ConfigurationManager._merge(config, cliOverrides);

    return config;
  }

  static _merge(target, source) {
    if (!source || typeof source !== 'object') return;
    
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && !Array.isArray(source[key]) && target[key]) {
        ConfigurationManager._merge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

module.exports = ConfigurationManager;
