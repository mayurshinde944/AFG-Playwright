'use strict';

const { STATUS } = require('../models/ValidationResult');
const RateLimiter = require('./RateLimiter');

class ExecutionEngine {
  /**
   * @param {object} config - Resolved configuration
   * @param {import('./ValidatorRegistry')} registry 
   * @param {import('./ResultAggregator')} aggregator 
   */
  constructor(config, registry, aggregator) {
    this.config = config;
    this.registry = registry;
    this.aggregator = aggregator;
    
    // We initialize the infrastructure rate limiter based on config
    const infraLimit = this.config.concurrency.infrastructureConcurrency || 5;
    this.infraLimiter = new RateLimiter(infraLimit);
    
    // We initialize the browser rate limiter based on config
    const browserLimit = this.config.concurrency.browserWorkers || 1;
    this.browserLimiter = new RateLimiter(browserLimit);
  }

  /**
   * Execute the given plan.
   * 
   * @param {import('../models/ExecutionPlan')} plan 
   */
  async execute(plan) {
    if (plan.mode === 'preview') {
      throw new Error('Cannot execute a preview plan');
    }

    const maxRetries = plan.maxRetries !== undefined ? plan.maxRetries : this.config.retry.maxRetries;
    const tasks = [];

    for (const website of plan.websites) {
      for (const validatorName of plan.validators) {
        const validatorReg = this.registry.get(validatorName);
        if (!validatorReg) {
          throw new Error(`Validator not found in registry: ${validatorName}`);
        }

        const validator = validatorReg.implementation;
        const isLightweight = validatorReg.metadata.type === 'lightweight';
        
        if (isLightweight) {
          tasks.push(this.infraLimiter.run(async () => {
            await this._executeWithRetries(validator, website, maxRetries);
          }));
        } else {
          tasks.push(this.browserLimiter.run(async () => {
            await this._executeWithRetries(validator, website, maxRetries);
          }));
        }
      }
    }

    // Wait for all tasks to complete
    await Promise.all(tasks);
  }

  /**
   * Internal execution logic with orchestrator-level retries.
   */
  async _executeWithRetries(validator, website, maxRetries) {
    let attempt = 0;
    let finalResult = null;
    const context = { config: this.config };

    while (attempt <= maxRetries) {
      attempt++;
      try {
        finalResult = await validator.validate(website, context);
        
        // If it passes, warns, skips, or has already exhausted internal retries, we break the loop
        if (finalResult.status === STATUS.PASS || 
            finalResult.status === STATUS.WARNING || 
            finalResult.status === STATUS.SKIP || 
            finalResult.handledRetries) {
          break;
        }
        
        // If it's a FAIL or ERROR, the loop continues and we retry.
        // We will keep the last failed result.
      } catch (err) {
        // If the validator threw an unhandled exception, convert to a standard error result
        finalResult = {
          websiteId: website.id,
          validatorName: validator.constructor.name.toLowerCase().replace('validator', ''),
          status: STATUS.ERROR,
          message: `Validator threw an unhandled exception: ${err.message}`,
          details: {},
          duration: 0,
          evidence: { error: err.stack },
          validate: () => [] // Fake validatable object for aggregator if hard fail
        };
      }
    }

    // Attempt count is appended to the message if retries happened
    if (attempt > 1 && finalResult && (finalResult.status === STATUS.FAIL || finalResult.status === STATUS.ERROR)) {
      finalResult.message = `${finalResult.message} (Failed after ${attempt} attempts)`;
    }

    this.aggregator.add(finalResult);
  }
}

module.exports = ExecutionEngine;
