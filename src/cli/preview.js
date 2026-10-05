#!/usr/bin/env node
'use strict';

const ConfigurationManager = require('../core/ConfigurationManager');
const CsvExcelInventoryLoader = require('../inventory/CsvExcelInventoryLoader');
const ExecutionRequest = require('../models/ExecutionRequest');
const ScopeResolver = require('../core/ScopeResolver');
const ExecutionPlanner = require('../core/ExecutionPlanner');
const SafetyPolicy = require('../core/SafetyPolicy');
const ValidatorRegistry = require('../core/ValidatorRegistry');
const { registerValidators } = require('../validators');
const { getLogger } = require('../logging/Logger');

async function runPreview() {
  const logger = getLogger();

  try {
    // 1. Load Configuration
    // In a real CLI, we'd parse process.argv. For preview demo, we simulate arguments.
    const args = process.argv.slice(2);
    
    let scopeType = 'random';
    let forceOverride = false;
    let specificWebsites = [];
    let validators = null;
    let isHeaded = false;
    
    // Simple argument parsing just to demonstrate preview flexibility
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--all') scopeType = 'all';
      if (args[i] === '--force') forceOverride = true;
      if (args[i] === '--headed') isHeaded = true;
      if (args[i] === '--specific' && args[i+1]) {
        scopeType = 'specific';
        specificWebsites.push(args[i+1]);
        i++;
      }
      if (args[i] === '--validator' && args[i+1]) {
        if (!validators) validators = [];
        validators.push(args[i+1]);
        i++;
      }
    }
    
    const cliOverrides = {};
    if (isHeaded) {
      cliOverrides.ui = { headed: true };
    }

    const config = ConfigurationManager.resolve({}, cliOverrides);
    
    // 2. Initialize ExecutionRequest
    const requestArgs = {
      scope: { type: scopeType },
      preset: 'DAILY_QA',
      mode: 'preview',
      forceOverride
    };

    if (validators) {
      requestArgs.validators = validators;
    }

    if (scopeType === 'specific') {
      requestArgs.scope.websites = specificWebsites.length > 0 ? specificWebsites : ['site-002', 'site-004'];
    } else if (scopeType === 'random') {
      requestArgs.scope.count = 3;
    }

    const request = new ExecutionRequest(requestArgs);
    const reqErrors = request.validate();
    if (reqErrors.length > 0) {
      throw new Error(`Invalid request: ${reqErrors.join(', ')}`);
    }

    // 3. Initialize Validator Registry
    const registry = new ValidatorRegistry();
    registerValidators(registry);

    // 4. Load Inventory
    logger.info(`Loading inventory from ${config.inventory.path}`);
    const loader = new CsvExcelInventoryLoader(config.inventory.path, { logger });
    const allWebsites = await loader.loadWebsites();

    // 5. Resolve Scope
    logger.info(`Resolving scope: ${scopeType}`);
    const resolvedWebsites = ScopeResolver.resolve(request, allWebsites, { rotationCount: request.scope.count });

    // 6. Plan Execution
    logger.info('Generating execution plan...');
    const plan = ExecutionPlanner.plan(request, resolvedWebsites, config, registry);

    // 7. Apply Safety Policy
    logger.info('Evaluating safety policy...');
    const safety = SafetyPolicy.evaluate(plan, config);

    // 8. Output Result
    if (!safety.allowed) {
      logger.error('Safety Policy Violations Detected:');
      safety.violations.forEach(v => logger.error(` - ${v}`));
      console.log('\n[PREVIEW FAILED DUE TO SAFETY POLICY]\n');
      process.exit(1);
    } else {
      if (safety.violations.length > 0) {
        logger.warn('Safety warnings (Allowed via forceOverride):');
        safety.violations.forEach(v => logger.warn(` - ${v}`));
      }
      
      console.log('\n' + plan.toSummary());
      logger.info('Preview complete. Zero external requests made.');
    }
    
  } catch (err) {
    logger.error(`Preview failed: ${err.message}`, err);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  runPreview();
}

module.exports = runPreview;
