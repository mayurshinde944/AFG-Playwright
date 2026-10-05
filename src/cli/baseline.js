#!/usr/bin/env node
'use strict';

const BaselineManager = require('../core/BaselineManager');
const ConfigurationManager = require('../core/ConfigurationManager');
const { getLogger } = require('../logging/Logger');

async function runBaseline(processArgs = process.argv.slice(2)) {
  const logger = getLogger();

  try {
    let masterUrl = null;
    let isHeaded = false;

    for (let i = 0; i < processArgs.length; i++) {
      if (processArgs[i] === '--url' && processArgs[i+1]) {
        masterUrl = processArgs[i+1];
        i++; // skip next arg
      }
      if (processArgs[i] === '--headed') {
        isHeaded = true;
      }
    }

    if (!masterUrl) {
      throw new Error('Missing --url argument. Please provide the Master template URL to analyze.');
    }

    const cliOverrides = {};
    if (isHeaded) {
      cliOverrides.ui = { headed: true };
    }

    const config = ConfigurationManager.resolve({}, cliOverrides);
    const baselinePath = config.ui?.baselinePath || './config/baselines/master-ui-baseline.json';

    logger.info(`Starting Master UI Baseline generation for: ${masterUrl}`);
    logger.info('Analyzing Master website structure...');

    // Generate the baseline object
    const baselineData = await BaselineManager.generate(masterUrl, config);
    
    // Save it to disk
    BaselineManager.save(baselineData, baselinePath);

    logger.info(`Successfully generated and saved baseline to ${baselinePath}`);
    console.log('\n═══════════════════════════════════════════════');
    console.log('  Master UI Baseline Summary');
    console.log('═══════════════════════════════════════════════\n');
    console.log(`Master URL: ${baselineData.masterUrl}`);
    console.log('Detected Global Components:');
    
    for (const [name, comp] of Object.entries(baselineData.globalComponents)) {
      const status = comp.exists ? '✅ FOUND' : '❌ MISSING';
      console.log(`  - ${name.padEnd(12)} : ${status}`);
      if (comp.exists) {
        console.log(`                   (selector: ${comp.detectedSelector})`);
      }
    }
    console.log('\n═══════════════════════════════════════════════\n');
    
    return baselineData; // Return for tests
  } catch (err) {
    logger.error(`Baseline generation failed: ${err.message}`, err);
    if (require.main === module) {
      process.exit(1);
    }
    throw err;
  }
}

if (require.main === module) {
  runBaseline();
}

module.exports = runBaseline;
