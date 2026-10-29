'use strict';

const express = require('express');
const router = express.Router();

const ConfigurationManager = require('../../core/ConfigurationManager');
const CsvExcelInventoryLoader = require('../../inventory/CsvExcelInventoryLoader');
const ExecutionRequest = require('../../models/ExecutionRequest');
const ScopeResolver = require('../../core/ScopeResolver');
const ExecutionPlanner = require('../../core/ExecutionPlanner');
const SafetyPolicy = require('../../core/SafetyPolicy');
const ValidatorRegistry = require('../../core/ValidatorRegistry');
const ResultAggregator = require('../../core/ResultAggregator');
const ExecutionEngine = require('../../core/ExecutionEngine');
const ExecutionQueue = require('../../core/ExecutionQueue');
const BaselineManager = require('../../core/BaselineManager');
const ResultStore = require('../../reporting/ResultStore');
const { registerValidators } = require('../../validators');
const { getLogger } = require('../../logging/Logger');
const statusTracker = require('../statusTracker');

// Initialize registry once for the API
const globalRegistry = new ValidatorRegistry();
registerValidators(globalRegistry);

router.post('/', async (req, res) => {
  try {
    const { url, websiteId, websites, urls, validators } = req.body;
    
    if (!url && !websiteId && !websites && !urls) {
      return res.status(400).json({ error: 'Either urls, websites, websiteId, or url is required' });
    }

    const targetTypes = [
      url ? 'url' : null,
      websiteId ? 'websiteId' : null,
      websites !== undefined ? 'websites' : null,
      urls !== undefined ? 'urls' : null
    ].filter(Boolean);

    if (targetTypes.length > 1) {
      return res.status(400).json({ error: 'Specify only one of urls, websites, websiteId, or url' });
    }
    
    if (!validators || !Array.isArray(validators) || validators.length === 0) {
      return res.status(400).json({ error: 'validators array is required and cannot be empty' });
    }

    // Validate validators against registry
    for (const v of validators) {
      if (!globalRegistry.get(v)) {
        return res.status(400).json({ error: `Unknown validator: ${v}` });
      }
    }

    const config = ConfigurationManager.resolve({}, {});
    const requestArgs = { mode: 'execute', validators };

    if (urls !== undefined) {
      if (!Array.isArray(urls)) {
        return res.status(400).json({ error: 'urls must be an array of website URLs' });
      }
      if (urls.length === 0) {
        return res.status(400).json({ error: 'urls array cannot be empty' });
      }
      if (urls.length > 10) {
        return res.status(400).json({ error: 'Batch size exceeds maximum limit of 10 URLs' });
      }

      const normalizedUrls = [];
      const seenNormalized = new Set();
      for (const item of urls) {
        if (typeof item !== 'string' || item.trim() === '') {
          return res.status(400).json({ error: 'urls must contain valid non-empty string URLs' });
        }
        let normalized;
        try {
          normalized = ScopeResolver.normalizeUrl(item);
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }
        if (seenNormalized.has(normalized)) {
          return res.status(400).json({ error: `Duplicate URL detected in batch: ${item}` });
        }
        seenNormalized.add(normalized);
        normalizedUrls.push(item.trim());
      }

      requestArgs.scope = { type: 'adhoc', urls: normalizedUrls };
    } else if (websites !== undefined) {
      if (!Array.isArray(websites)) {
        return res.status(400).json({ error: 'websites must be an array of website identifiers' });
      }
      if (websites.length === 0) {
        return res.status(400).json({ error: 'websites array cannot be empty' });
      }
      if (websites.length > 10) {
        return res.status(400).json({ error: 'Batch size exceeds maximum limit of 10 websites' });
      }

      const normalizedIds = [];
      const seen = new Set();
      for (const item of websites) {
        if (typeof item !== 'string' || item.trim() === '') {
          return res.status(400).json({ error: 'websites must contain valid non-empty string identifiers' });
        }
        const trimmed = item.trim();
        if (seen.has(trimmed)) {
          return res.status(400).json({ error: 'Duplicate website identifiers are not allowed in a batch' });
        }
        seen.add(trimmed);
        normalizedIds.push(trimmed);
      }

      requestArgs.scope = { type: 'specific', websites: normalizedIds };
    } else if (websiteId) {
      if (typeof websiteId !== 'string' || websiteId.trim() === '') {
        return res.status(400).json({ error: 'websiteId must be a non-empty string' });
      }
      requestArgs.scope = { type: 'specific', websites: [websiteId.trim()] };
    } else {
      if (typeof url !== 'string' || url.trim() === '') {
        return res.status(400).json({ error: 'url must be a non-empty string' });
      }
      try {
        ScopeResolver.normalizeUrl(url);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      requestArgs.scope = { type: 'adhoc', url: url.trim() };
    }

    const request = new ExecutionRequest(requestArgs);
    const reqErrors = request.validate();
    if (reqErrors.length > 0) {
      return res.status(400).json({ error: `Invalid request: ${reqErrors.join(', ')}` });
    }

    // Quick validation before queuing
    const logger = getLogger();
    const loader = new CsvExcelInventoryLoader(config.inventory.path, { logger });
    const allWebsites = await loader.loadWebsites();
    let resolvedWebsites;
    try {
      resolvedWebsites = ScopeResolver.resolve(request, allWebsites, {});
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const plan = ExecutionPlanner.plan(request, resolvedWebsites, config, globalRegistry);
    const safety = SafetyPolicy.evaluate(plan, config);

    if (!safety.allowed) {
      return res.status(403).json({ error: 'Safety Policy Violations: ' + safety.violations.join(', ') });
    }

    const runId = ResultStore.generateRunId();
    statusTracker.set(runId, 'QUEUED');
    
    res.status(202).json({ runId, status: 'QUEUED' });

    // Enqueue execution
    ExecutionQueue.enqueue(async () => {
      const startTime = Date.now();
      statusTracker.set(runId, 'RUNNING');
      
      try {
        if (config.ui && config.ui.baselinePath) {
          try {
            config.ui.baseline = BaselineManager.load(config.ui.baselinePath);
          } catch (e) {
            config.ui.baseline = null;
          }
        }

        const aggregator = new ResultAggregator();
        const engine = new ExecutionEngine(config, globalRegistry, aggregator);
        await engine.execute(plan);

        const duration = Date.now() - startTime;
        const results = aggregator.getAll();
        const summary = aggregator.getSummary();

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

        statusTracker.set(runId, 'COMPLETED');

      } catch (err) {
        logger.error(`API Execution failed for run ${runId}: ${err.message}`);
        statusTracker.set(runId, 'FAILED');
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:runId', async (req, res) => {
  const { runId } = req.params;
  
  try {
    const record = await ResultStore.getRun(runId);
    if (record) {
      return res.json(record);
    }
  } catch (err) {
    // maybe record not found or config missing
  }

  const status = statusTracker.get(runId);
  if (status) {
    return res.json({ runId, status });
  }

  res.status(404).json({ error: 'Run not found' });
});

module.exports = router;
