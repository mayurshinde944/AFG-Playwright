#!/usr/bin/env node
'use strict';

const ConfigurationManager = require('../core/ConfigurationManager');
const CsvExcelInventoryLoader = require('../inventory/CsvExcelInventoryLoader');
const ExecutionRequest = require('../models/ExecutionRequest');
const ScopeResolver = require('../core/ScopeResolver');
const ExecutionPlanner = require('../core/ExecutionPlanner');
const SafetyPolicy = require('../core/SafetyPolicy');
const ValidatorRegistry = require('../core/ValidatorRegistry');
const ResultAggregator = require('../core/ResultAggregator');
const ExecutionEngine = require('../core/ExecutionEngine');
const ExecutionQueue = require('../core/ExecutionQueue');
const BaselineManager = require('../core/BaselineManager');
const ReportGenerator = require('../reporting/ReportGenerator');
const ResultStore = require('../reporting/ResultStore');
const { registerValidators } = require('../validators');
const { getLogger } = require('../logging/Logger');

async function runQa(processArgs = process.argv.slice(2)) {
  const logger = getLogger();
  const startTime = Date.now();
  const runId = ResultStore.generateRunId();

  try {
    // 1. Setup minimal CLI argument parsing
    let scopeType = 'random';
    let forceOverride = false;
    let specificWebsites = [];
    let validators = null;
    let isHeaded = false;
    const cliOverrides = {};

    for (let i = 0; i < processArgs.length; i++) {
      if (processArgs[i] === '--all') scopeType = 'all';
      if (processArgs[i] === '--force') forceOverride = true;
      if (processArgs[i] === '--headed') isHeaded = true;
      if (processArgs[i] === '--specific' && processArgs[i+1]) {
        scopeType = 'specific';
        specificWebsites.push(processArgs[i+1]);
        i++; // skip next arg
      }
      if (processArgs[i] === '--url' && processArgs[i+1]) {
        scopeType = 'adhoc';
        cliOverrides.adHocUrl = processArgs[i+1];
        i++; // skip next arg
      }
      if (processArgs[i] === '--validator' && processArgs[i+1]) {
        if (!validators) validators = [];
        validators.push(processArgs[i+1]);
        i++; // skip next arg
      }
      if (processArgs[i] === '--report') {
        if (processArgs[i+1] && !processArgs[i+1].startsWith('--')) {
          cliOverrides.reporting = { enabled: true, formats: processArgs[i+1].split(',') };
          i++; // skip format arg
        } else {
          cliOverrides.reporting = { enabled: true }; // Uses defaults
        }
      }
      if (processArgs[i] === '--no-report') {
        cliOverrides.reporting = { enabled: false };
      }
    }
    
    // Fallback if random is selected but we want to avoid massive runs inadvertently
    if (scopeType === 'random' && !processArgs.includes('--random')) {
      logger.info('No scope specified. Defaulting to a safe limited rotation scope.');
    }

    if (isHeaded) {
      cliOverrides.ui = { headed: true };
    }

    const config = ConfigurationManager.resolve({}, cliOverrides);
    
    // 1.5 Load UI Baseline if configured
    if (config.ui && config.ui.baselinePath) {
      try {
        const baseline = BaselineManager.load(config.ui.baselinePath);
        if (baseline) {
          logger.info(`Loaded Master UI Baseline from ${config.ui.baselinePath}`);
          config.ui.baseline = baseline;
        } else {
          logger.info(`No Master UI Baseline found at ${config.ui.baselinePath}. Master comparison will be skipped.`);
          config.ui.baseline = null;
        }
      } catch (baselineErr) {
        logger.warn(`WARNING: ${baselineErr.message}`);
        logger.warn('Master comparison will be skipped for this run.');
        config.ui.baseline = null;
      }
    }

    // 2. Initialize ExecutionRequest
    const requestArgs = {
      scope: { type: scopeType },
      mode: 'execute',
      forceOverride
    };

    if (scopeType === 'specific') {
      requestArgs.scope.websites = specificWebsites;
    } else if (scopeType === 'adhoc') {
      requestArgs.scope.url = cliOverrides.adHocUrl;
    } else if (scopeType === 'random') {
      requestArgs.scope.count = 1; // safe default for CLI runs without explicit count
    }

    if (validators) {
      requestArgs.validators = validators;
    } else {
      requestArgs.preset = 'INFRASTRUCTURE'; // Default to a lightweight preset if no validator is specified
    }

    const request = new ExecutionRequest(requestArgs);
    const reqErrors = request.validate();
    if (reqErrors.length > 0) {
      throw new Error(`Invalid request: ${reqErrors.join(', ')}`);
    }

    // 3. Initialize Registry and Aggregator
    const registry = new ValidatorRegistry();
    registerValidators(registry);
    const aggregator = new ResultAggregator();

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

    if (!safety.allowed) {
      logger.error('Safety Policy Violations Detected:');
      safety.violations.forEach(v => logger.error(` - ${v}`));
      process.exit(1);
    }
    
    // 8. Execute
    logger.info('Executing validation plan...');
    const engine = new ExecutionEngine(config, registry, aggregator);
    await ExecutionQueue.enqueue(() => engine.execute(plan));
    const duration = Date.now() - startTime;

    // 9. Output simple console reporting
    logger.info('Execution complete. Generating summary...');
    
    console.log('\n═══════════════════════════════════════════════');
    console.log('  Validation Results');
    console.log('═══════════════════════════════════════════════\n');
    
    const results = aggregator.getAll();
    for (const res of results) {
      let icon = '❓';
      if (res.status === 'PASS') icon = '✅';
      if (res.status === 'FAIL') icon = '❌';
      if (res.status === 'WARNING') icon = '⚠️';
      
      console.log(`${icon} [${res.validatorName.toUpperCase()}] ${res.websiteId}`);
      console.log(`   Status: ${res.status}`);
      console.log(`   Message: ${res.message}`);
      if (res.pages && res.pages.length > 0) {
        console.log('   Pages:');
        for (const page of res.pages) {
          let pIcon = '[❓]';
          if (page.status === 'PASS') pIcon = '[✅]';
          if (page.status === 'FAIL') pIcon = '[❌]';
          if (page.status === 'WARNING') pIcon = '[⚠️]';
          
          let pOutput = `     ${pIcon} ${page.finalUrl}`;
          if (page.retryAttempts > 0) {
            pOutput += ` (Retries: ${page.retryAttempts})`;
          }
          console.log(pOutput);

          if (page.issues && page.issues.length > 0) {
            for (const issue of page.issues) {
              console.log(`       - [${issue.type}] ${issue.message}`);
            }
          }
        }
      } else if (res.details && Object.keys(res.details).length > 0) {
        const safeDetails = { ...res.details };
        // Prevent circular reference crash from raw TLS certificates
        if (safeDetails.certificateRaw) {
          delete safeDetails.certificateRaw;
        }
        // Don't print huge pageResults arrays on legacy fallback
        if (safeDetails.pageResults) {
          delete safeDetails.pageResults;
        }
        console.log(`   Details: ${JSON.stringify(safeDetails)}`);
      }
      console.log('');
    }

    const summary = aggregator.getSummary();
    console.log('═══════════════════════════════════════════════');
    console.log(`TOTAL: ${summary.total} | PASS: ${summary.PASS} | WARNING: ${summary.WARNING} | FAIL: ${summary.FAIL}`);
    console.log('═══════════════════════════════════════════════\n');
    
    // 9. Generate Reports (Phase 6)
    await ReportGenerator.generate(results, config, request);

    // 10. Persist execution results for dashboard
    await ResultStore.saveRun({
      runId,
      request,
      plan,
      results,
      summary,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      duration,
      config
    });

    if (summary.FAIL > 0 || summary.ERROR > 0) {
      process.exitCode = 1;
    } else if (summary.WARNING > 0) {
      process.exitCode = 2;
    }

    return summary; // Useful for integration tests

  } catch (err) {
    logger.error(`Execution failed: ${err.message}`, err);
    if (require.main === module) {
      process.exit(1);
    }
    throw err;
  }
}

if (require.main === module) {
  runQa();
}

module.exports = runQa;
