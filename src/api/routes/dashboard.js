'use strict';

const fs = require('fs');
const path = require('path');
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
      } else if (!websiteStatusMap.has(res.websiteId)) {
        websiteStatusMap.set(res.websiteId, 'PASS');
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

router.get('/websites', async (req, res) => {
  try {
    const config = ConfigurationManager.resolve({}, {});
    const inventoryPath = config.inventory?.path || './inventory/sample.csv';
    const loader = new CsvExcelInventoryLoader(inventoryPath, {
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
    const allWebsites = await loader.loadWebsites();

    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const DEFAULT_LIMIT = 10;
    const MAX_LIMIT = 50;
    let limit = DEFAULT_LIMIT;
    if (req.query.limit !== undefined) {
      const parsed = parseInt(req.query.limit, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, MAX_LIMIT);
      }
    }

    let matches = allWebsites;
    if (q) {
      matches = allWebsites.filter(w => {
        const idMatch = w.id && w.id.toLowerCase().includes(q);
        const nameMatch = w.name && w.name.toLowerCase().includes(q);
        const urlMatch = w.url && w.url.toLowerCase().includes(q);
        return Boolean(idMatch || nameMatch || urlMatch);
      });
    }

    const limited = matches.slice(0, limit);
    const sanitized = limited.map(w => ({
      id: w.id,
      name: w.name,
      url: w.url,
      active: w.isActive()
    }));

    res.json({
      websites: sanitized,
      total: matches.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load inventory websites' });
  }
});

const ALLOWED_VISUAL_TYPES = new Set(['baselines', 'actuals', 'diffs']);

router.get('/visual/:type/:websiteId/:filename', (req, res) => {
  try {
    const { type, websiteId, filename } = req.params;

    // 1. Category allowlist check
    if (!ALLOWED_VISUAL_TYPES.has(type)) {
      return res.status(400).json({ error: 'Invalid visual image type' });
    }

    // 2. Strict format validation preventing path traversal
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(websiteId) || websiteId.includes('..')) {
      return res.status(400).json({ error: 'Invalid website identifier' });
    }
    if (!/^[a-zA-Z0-9_]+\.png$/i.test(filename)) {
      return res.status(400).json({ error: 'Invalid image filename' });
    }

    // 3. Resolve configured visual directories matching VisualValidator
    const config = ConfigurationManager.resolve({}, {});
    const visualConfig = config.visual || {};
    const dirMap = {
      baselines: visualConfig.baselinesDir || './artifacts/visual/baselines',
      actuals: visualConfig.actualsDir || './artifacts/visual/actuals',
      diffs: visualConfig.diffsDir || './artifacts/visual/diffs'
    };

    const baseDir = path.resolve(process.cwd(), dirMap[type]);
    if (!fs.existsSync(baseDir)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // 4. Lexical containment check
    const targetFile = path.resolve(baseDir, websiteId, filename);
    const lexicalRelative = path.relative(baseDir, targetFile);
    if (lexicalRelative.startsWith('..') || path.isAbsolute(lexicalRelative)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(targetFile)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // 5. Canonical filesystem realpath check against symlink escapes
    const realBaseDir = fs.realpathSync(baseDir);
    const realTargetFile = fs.realpathSync(targetFile);
    const realRelative = path.relative(realBaseDir, realTargetFile);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.statSync(realTargetFile).isFile()) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.setHeader('Content-Type', 'image/png');
    res.sendFile(realTargetFile);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
