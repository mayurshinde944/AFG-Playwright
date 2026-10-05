'use strict';

const express = require('express');
const router = express.Router();
const ConfigurationManager = require('../../core/ConfigurationManager');
const CsvExcelInventoryLoader = require('../../inventory/CsvExcelInventoryLoader');
const ResultStore = require('../../reporting/ResultStore');

async function generateSummaryResponse(runs, config) {
  // Sort runs newest to oldest so we can pick the latest result for a website
  runs.sort((a, b) => {
    const timeA = (a.execution && a.execution.startedAt) ? new Date(a.execution.startedAt).getTime() : 0;
    const timeB = (b.execution && b.execution.startedAt) ? new Date(b.execution.startedAt).getTime() : 0;
    return timeB - timeA;
  });

  // Attempt to load active website count for "Not Tested"
  let totalInventoryCount = null;
  let activeInventoryIds = new Set();
  try {
    const loader = new CsvExcelInventoryLoader(config.inventory.path, { logger: { info: () => {} } });
    const allWebsites = await loader.loadWebsites();
    const activeWebsites = allWebsites.filter(w => w.isActive());
    totalInventoryCount = activeWebsites.length;
    activeWebsites.forEach(w => activeInventoryIds.add(w.id));
  } catch (e) {
    // Inventory might be missing or unparseable, leave as null
  }

  const summary = {
    totalTested: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    notTested: totalInventoryCount
  };

  const websitesTestedTodayMap = new Map();
  const uniqueWebsitesTested = new Set();
  const websiteStatusMap = new Map();

  for (const run of runs) {
    const exec = run.execution || {};
    const results = run.results || [];
    const isRandom = exec.scope === 'random';

    for (const res of results) {
      uniqueWebsitesTested.add(res.websiteId);
      
      const currentStatus = websiteStatusMap.get(res.websiteId) || 'PASS';
      if (res.status === 'FAIL' || res.status === 'ERROR') {
        websiteStatusMap.set(res.websiteId, 'FAIL');
      } else if (res.status === 'WARNING' && currentStatus !== 'FAIL') {
        websiteStatusMap.set(res.websiteId, 'WARNING');
      }
    }

    if (isRandom) {
      const runWebsites = run.websites || [];
      for (const w of runWebsites) {
        if (!websitesTestedTodayMap.has(w.websiteId)) {
          const siteResults = results.filter(r => r.websiteId === w.websiteId);
          if (siteResults.length === 0) continue;

          let overallStatus = 'PASS';
          let hasWarning = false;
          let hasFail = false;
          const executedValidators = new Set();

          for (const res of siteResults) {
            executedValidators.add(res.validatorName);
            if (res.status === 'FAIL' || res.status === 'ERROR') hasFail = true;
            else if (res.status === 'WARNING') hasWarning = true;
          }

          if (hasFail) overallStatus = 'FAIL';
          else if (hasWarning) overallStatus = 'WARNING';

          websitesTestedTodayMap.set(w.websiteId, {
            websiteId: w.websiteId,
            url: w.url,
            name: w.name,
            overallStatus,
            validators: Array.from(executedValidators),
            runId: exec.runId
          });
        }
      }
    }
  }

  // Now calculate summary based on websiteStatusMap (across all run types for summary counts)
  for (const status of websiteStatusMap.values()) {
    if (status === 'FAIL') summary.failed++;
    else if (status === 'WARNING') summary.warnings++;
    else if (status === 'PASS') summary.passed++;
  }

  summary.totalTested = uniqueWebsitesTested.size;
  if (totalInventoryCount !== null) {
    let activeInventoryWebsitesTested = 0;
    for (const testedId of uniqueWebsitesTested) {
      if (activeInventoryIds.has(testedId)) {
        activeInventoryWebsitesTested++;
      }
    }
    summary.notTested = Math.max(0, totalInventoryCount - activeInventoryWebsitesTested);
  }

  return {
    summary,
    websitesTestedToday: Array.from(websitesTestedTodayMap.values())
  };
}

router.get('/today', async (req, res) => {
  try {
    const config = ConfigurationManager.resolve({}, {});
    const runs = await ResultStore.getTodayRuns(config);
    const responseData = await generateSummaryResponse(runs, config);
    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    let date = req.query.date;
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
    }

    const config = ConfigurationManager.resolve({}, {});
    const runs = await ResultStore.getRunsByDate(date, config);
    const responseData = await generateSummaryResponse(runs, config);
    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/website/:identifier/history', async (req, res) => {
  try {
    const identifier = req.params.identifier;
    if (!identifier || identifier.trim() === '') {
      return res.status(400).json({ error: 'Website identifier must not be empty.' });
    }

    const config = ConfigurationManager.resolve({}, {});
    const history = await ResultStore.getWebsiteHistory(decodeURIComponent(identifier), config);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
