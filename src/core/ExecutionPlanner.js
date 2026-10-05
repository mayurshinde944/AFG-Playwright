'use strict';

const ExecutionPlan = require('../models/ExecutionPlan');
const ConfigurationManager = require('./ConfigurationManager');

class ExecutionPlanner {
  /**
   * Generates a fully resolved ExecutionPlan.
   * 
   * @param {import('../models/ExecutionRequest')} request 
   * @param {import('../models/Website')[]} resolvedWebsites 
   * @param {object} config - Resolved system configuration
   * @returns {import('../models/ExecutionPlan')}
   */
  static plan(request, resolvedWebsites, config) {
    let validators = [];
    
    // Resolve validators from preset or explicit list
    if (request.validators && request.validators.length > 0) {
      validators = [...request.validators];
    } else if (request.preset && config.presets[request.preset]) {
      validators = [...config.presets[request.preset].validators];
    } else {
      throw new Error('ExecutionRequest must specify validators or a valid preset');
    }

    // Resolve execution settings, favoring request overrides over config defaults
    const browsers = request.browsers || config.browsers;
    const viewports = request.viewports || config.viewports;
    const maxRetries = request.retries !== undefined ? request.retries : config.retry.maxRetries;
    const screenshotMode = request.screenshots || config.screenshots.mode;
    
    const maxPages = (request.crawlSettings && request.crawlSettings.maxPages) 
      ? request.crawlSettings.maxPages 
      : config.crawler.maxPages;

    const concurrency = {
      infrastructureConcurrency: config.concurrency.infrastructureConcurrency,
      browserWorkers: config.concurrency.browserWorkers
    };

    return new ExecutionPlan({
      scope: request.scope.type,
      websites: resolvedWebsites,
      validators,
      browsers,
      viewports,
      concurrency,
      maxRetries,
      screenshotMode,
      maxPages,
      mode: request.mode,
      forceOverride: request.forceOverride
    });
  }
}

module.exports = ExecutionPlanner;
