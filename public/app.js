function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('historyDateInput');
  const todayStr = new Date().toISOString().split('T')[0];
  dateInput.value = todayStr;

  loadSummary();
  setupAdHocForm();

  document.getElementById('loadDateBtn').addEventListener('click', () => {
    const selectedDate = dateInput.value;
    loadSummary(selectedDate);
  });
});

async function loadSummary(date = null) {
  try {
    let url = '/api/dashboard/summary';
    if (date) {
      url += `?date=${date}`;
    } else {
      url = '/api/dashboard/today';
    }

    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to fetch summary');
    }

    const data = await res.json();

    const todayStr = new Date().toISOString().split('T')[0];
    const displayDate = (!date || date === todayStr) ? "Today" : date;
    document.getElementById('summaryHeading').textContent = `${displayDate}'s Summary`;
    document.getElementById('websiteTestsHeading').textContent = `${displayDate}'s Website Tests`;

    document.getElementById('statTotalTested').textContent = data.summary.totalTested;
    document.getElementById('statPassed').textContent = data.summary.passed;
    document.getElementById('statFailed').textContent = data.summary.failed;
    document.getElementById('statWarnings').textContent = data.summary.warnings;

    document.getElementById('statNotTested').textContent =
      data.summary.notTested !== null ? data.summary.notTested : 'N/A';

    renderWebsiteTests(data.websitesTestedToday || []);
  } catch (err) {
    console.error(err);
  }
}

function renderWebsiteTests(websites) {
  const tbody = document.getElementById('websiteTestsBody');
  if (!websites || websites.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">No website tests found for this date.</td></tr>';
    return;
  }

  tbody.innerHTML = websites.map(site => `
    <tr style="cursor: pointer;" onclick="openWebsiteQaResult('${escapeHTML(site.websiteId)}', '${escapeHTML(site.runId)}');">
      <td><a href="#" style="color: var(--primary-color); font-weight: 500; text-decoration: none;">${escapeHTML(site.websiteId)}</a></td>
      <td><a href="${escapeHTML(site.url)}" target="_blank" onclick="event.stopPropagation();" style="color: var(--text-muted); text-decoration: none;">${escapeHTML(site.url)}</a></td>
      <td><span class="badge badge-${escapeHTML(site.overallStatus.toLowerCase())}">${escapeHTML(site.overallStatus)}</span></td>
      <td>${escapeHTML(site.validators.join(', '))}</td>
    </tr>
  `).join('');
}

async function openWebsiteQaResult(websiteId, runId) {
  const modal = document.getElementById('detailsModal');
  const modalBody = document.getElementById('modalBodyContent');
  modalBody.innerHTML = '<p>Loading QA Result...</p>';
  modal.showModal();

  try {
    const res = await fetch(`/api/executions/${runId}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error('Run details not found.');
      throw new Error('Failed to fetch run details.');
    }

    const data = await res.json();
    if (!data.execution || !data.results) {
      throw new Error('Malformed result data.');
    }

    const siteResults = data.results.filter(r => r.websiteId === websiteId);
    if (siteResults.length === 0) {
      throw new Error('No results found for this website in this run.');
    }

    const websiteInfo = (data.websites || []).find(w => w.websiteId === websiteId) || { websiteId, url: '' };

    let overallStatus = 'PASS';
    let hasFail = false;
    let hasWarning = false;
    siteResults.forEach(r => {
      if (r.status === 'FAIL' || r.status === 'ERROR') hasFail = true;
      else if (r.status === 'WARNING') hasWarning = true;
    });
    if (hasFail) overallStatus = 'FAIL';
    else if (hasWarning) overallStatus = 'WARNING';

    let html = `
      <div style="margin-bottom: 2rem;">
        <p><strong>Website ID:</strong> ${escapeHTML(websiteInfo.websiteId)}</p>
        <p><strong>URL:</strong> <a href="${escapeHTML(websiteInfo.url)}" target="_blank">${escapeHTML(websiteInfo.url)}</a></p>
        <p><strong>Overall Status:</strong> <span class="badge badge-${escapeHTML(overallStatus.toLowerCase())}">${escapeHTML(overallStatus)}</span></p>
      </div>
      
      <h3 style="margin-bottom: 1.5rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--border-color);">Tests Performed</h3>
    `;

    siteResults.forEach(res => {
      html += `
        <div class="validator-card" style="margin-bottom: 1.5rem; border-left: 4px solid ${getStatusColor(res.status)};">
          <div class="validator-card-header" style="background-color: var(--card-bg); padding: 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between;">
            <span style="font-weight: 600; font-size: 1.2rem;">${escapeHTML(res.validatorName.toUpperCase())}</span>
            <span class="badge badge-${escapeHTML(res.status.toLowerCase())}">${escapeHTML(res.status)}</span>
          </div>
          <div style="padding: 1.5rem;">
            ${renderQaReport(res)}
          </div>
        </div>
      `;
    });

    modalBody.innerHTML = html;
  } catch (err) {
    modalBody.innerHTML = `<p style="color: var(--danger);"><strong>Error:</strong> ${escapeHTML(err.message)}</p>`;
  }
}

function getStatusColor(status) {
  if (status === 'PASS') return 'var(--success)';
  if (status === 'WARNING') return 'var(--warning)';
  if (status === 'FAIL' || status === 'ERROR') return 'var(--danger)';
  return 'var(--text-muted)';
}

function renderQaReport(res) {
  let html = `<p style="font-size: 1.1rem; margin-bottom: 1.5rem;"><strong>Result:</strong> ${escapeHTML(res.message || res.error || '-')}</p>`;
  const details = res.details || {};
  const metrics = res.metrics || {};
  const pages = res.pages || details.pageResults || [];

  switch (res.validatorName.toLowerCase()) {
    case 'dns':
      html += `<h4 style="margin-bottom: 0.5rem; color: var(--text-muted); text-transform: uppercase;">DNS Information</h4>`;
      let dnsRows = '';
      if (details.cnames && details.cnames.length > 0) dnsRows += `<tr><th style="text-align: left; padding: 0.5rem;">CNAME</th><td style="padding: 0.5rem;">${escapeHTML(details.cnames.join(', '))}</td></tr>`;
      if (details.ipAddresses && details.ipAddresses.length > 0) dnsRows += `<tr><th style="text-align: left; padding: 0.5rem;">IP Address</th><td style="padding: 0.5rem;">${escapeHTML(details.ipAddresses.join(', '))}</td></tr>`;
      if (details.infrastructure) dnsRows += `<tr><th style="text-align: left; padding: 0.5rem;">Infrastructure</th><td style="padding: 0.5rem;">${escapeHTML(details.infrastructure)}</td></tr>`;
      if (details.relationship) dnsRows += `<tr><th style="text-align: left; padding: 0.5rem;">Relationship</th><td style="padding: 0.5rem;">${escapeHTML(details.relationship)}</td></tr>`;
      if (dnsRows) html += `<table style="width: 100%; border-collapse: collapse;"><tbody>${dnsRows}</tbody></table>`;
      break;

    case 'ssl':
      html += `<h4 style="margin-bottom: 0.5rem; color: var(--text-muted); text-transform: uppercase;">Certificate Information</h4>`;
      let sslRows = '';
      const cert = details.certificateNormalized;
      if (cert) {
        if (cert.subject) sslRows += `<tr><th style="text-align: left; padding: 0.5rem;">Domain/Subject</th><td style="padding: 0.5rem;">${escapeHTML(cert.subject)}</td></tr>`;
        if (cert.issuer) sslRows += `<tr><th style="text-align: left; padding: 0.5rem;">Issuer</th><td style="padding: 0.5rem;">${escapeHTML(cert.issuer)}</td></tr>`;
        if (cert.validFrom) sslRows += `<tr><th style="text-align: left; padding: 0.5rem;">Valid From</th><td style="padding: 0.5rem;">${escapeHTML(cert.validFrom)}</td></tr>`;
        if (cert.validTo) sslRows += `<tr><th style="text-align: left; padding: 0.5rem;">Valid Until</th><td style="padding: 0.5rem;">${escapeHTML(cert.validTo)}</td></tr>`;
        if (cert.daysRemaining !== undefined) sslRows += `<tr><th style="text-align: left; padding: 0.5rem;">Days Remaining</th><td style="padding: 0.5rem;">${escapeHTML(cert.daysRemaining)}</td></tr>`;
      }
      if (details.finalUrl) sslRows += `<tr><th style="text-align: left; padding: 0.5rem;">Final URL</th><td style="padding: 0.5rem;">${escapeHTML(details.finalUrl)}</td></tr>`;
      if (sslRows) html += `<table style="width: 100%; border-collapse: collapse;"><tbody>${sslRows}</tbody></table>`;
      break;

    case 'http':
      html += `<h4 style="margin-bottom: 0.5rem; color: var(--text-muted); text-transform: uppercase;">HTTP Information</h4>`;
      let httpRows = '';
      if (details.statusCode) httpRows += `<tr><th style="text-align: left; padding: 0.5rem;">Status Code</th><td style="padding: 0.5rem;">${escapeHTML(details.statusCode)}</td></tr>`;
      if (details.originalUrl) httpRows += `<tr><th style="text-align: left; padding: 0.5rem;">Original URL</th><td style="padding: 0.5rem;">${escapeHTML(details.originalUrl)}</td></tr>`;
      if (details.finalUrl) httpRows += `<tr><th style="text-align: left; padding: 0.5rem;">Final URL</th><td style="padding: 0.5rem;">${escapeHTML(details.finalUrl)}</td></tr>`;
      if (httpRows) html += `<table style="width: 100%; border-collapse: collapse;"><tbody>${httpRows}</tbody></table>`;
      break;

    case 'ui':
      html += `<h4 style="margin-bottom: 1rem; color: var(--text-muted); text-transform: uppercase;">Pages Tested</h4>`;
      html += renderPages(pages, 'ui');
      break;

    case 'responsive':
      html += `<h4 style="margin-bottom: 1rem; color: var(--text-muted); text-transform: uppercase;">Pages Tested</h4>`;
      html += renderPages(pages, 'responsive');
      break;

    case 'cross-browser':
      html += `<h4 style="margin-bottom: 1rem; color: var(--text-muted); text-transform: uppercase;">Pages Tested</h4>`;
      html += renderPages(pages, 'cross-browser');
      break;

    case 'visual':
      html += `<h4 style="margin-bottom: 1rem; color: var(--text-muted); text-transform: uppercase;">Pages Tested</h4>`;
      html += renderPages(pages, 'visual');
      break;

    default:
      if (pages.length > 0) {
        html += `<h4 style="margin-bottom: 1rem; color: var(--text-muted); text-transform: uppercase;">Pages Tested</h4>`;
        html += renderPages(pages, res.validatorName.toLowerCase());
      }
      break;
  }

  return html;
}

function toVisualImageUrl(filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\/artifacts\/visual\/(baselines|actuals|diffs)\/([^/]+)\/([^/]+\.png)$/i);
  if (!match) return null;
  return `/api/dashboard/visual/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}/${encodeURIComponent(match[3])}`;
}

function handleImageError(img) {
  if (!img) return;
  const link = img.closest('a');

  let card = (link || img).parentElement;
  while (card && card !== document.body) {
    const viewLink = Array.from(card.querySelectorAll('a')).find(
      a => a !== link && a.textContent.toLowerCase().includes('view full size')
    );
    if (viewLink) {
      viewLink.style.display = 'none';
      break;
    }
    if (card.parentElement && card.parentElement.style && card.parentElement.style.display === 'grid') {
      break;
    }
    card = card.parentElement;
  }

  const placeholder = document.createElement('div');
  placeholder.style.cssText = 'padding: 1.5rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px dashed var(--border-color);';
  placeholder.textContent = 'Image file is no longer available';

  if (link) {
    link.replaceWith(placeholder);
  } else {
    img.replaceWith(placeholder);
  }
}

function renderPages(pages, type) {
  if (!pages || pages.length === 0) return '<p>No pages were tested.</p>';

  let html = '';
  pages.forEach(p => {
    html += `<div style="margin-bottom: 1.5rem; padding: 1rem; background-color: var(--bg-color); border-radius: 6px; border: 1px solid var(--border-color);">`;
    html += `<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">`;
    html += `<span class="badge badge-${escapeHTML(p.status?.toLowerCase() || 'unknown')}">${escapeHTML(p.status || 'UNKNOWN')}</span>`;
    html += `<span style="font-weight: 600; word-break: break-all;">${escapeHTML(p.url)}</span>`;
    html += `</div>`;

    let metaInfo = [];
    if (p.finalUrl && p.finalUrl !== p.url) metaInfo.push(`Final URL: ${escapeHTML(p.finalUrl)}`);
    if (p.retryAttempts > 0) metaInfo.push(`Retries: ${escapeHTML(p.retryAttempts)}`);

    if (type === 'responsive' || type === 'visual') {
      if (p.viewport) metaInfo.push(`Viewport: ${escapeHTML(p.viewport.name || '')} (${escapeHTML(p.viewport.width)}x${escapeHTML(p.viewport.height)})`);
    }

    if (type === 'cross-browser') {
      if (p.browser) metaInfo.push(`Browser: ${escapeHTML(p.browser)}`);
      if (p.context && p.context.affectedBrowsers) {
        metaInfo.push(`Affected Browsers: ${escapeHTML(p.context.affectedBrowsers.join(', '))}`);
      }
    }

    if (type === 'visual') {
      const isMissingBaseline = p.issues?.some(i => i && (i.type === 'missing_baseline' || i.message?.includes('No baseline exists')));
      if (isMissingBaseline) {
        metaInfo.push(`<span class="badge badge-warning" style="vertical-align: middle;">Baseline: Pending Promotion</span>`);
      } else {
        if (p.metrics?.mismatchPercentage !== undefined) metaInfo.push(`Mismatch: ${escapeHTML(p.metrics.mismatchPercentage)}%`);
        if (p.metrics?.diffPixels !== undefined) metaInfo.push(`Diff Pixels: ${escapeHTML(p.metrics.diffPixels)}`);
      }
    }

    if (metaInfo.length > 0) {
      html += `<div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">${metaInfo.join(' | ')}</div>`;
    }

    if (p.issues && p.issues.length > 0) {
      html += `<div style="margin-top: 0.5rem;"><strong>Issues:</strong><ul style="margin-top: 0.25rem; margin-bottom: 0; padding-left: 1.5rem; font-size: 0.9rem;">`;
      p.issues.forEach(issue => {
        let issueContext = '';
        if (issue.context?.affectedBrowsers && type === 'cross-browser') {
          issueContext = ` <em>(Browsers: ${escapeHTML(issue.context.affectedBrowsers.join(', '))})</em>`;
        }
        html += `<li>${escapeHTML(issue.message)}${issueContext}</li>`;
      });
      html += `</ul></div>`;
    }

    if (type === 'visual' && p.metrics) {
      const isMissingBaseline = p.issues?.some(i => i && (i.type === 'missing_baseline' || i.message?.includes('No baseline exists')));
      const actualUrl = toVisualImageUrl(p.metrics.actualPath);
      const baselineUrl = !isMissingBaseline ? toVisualImageUrl(p.metrics.baselinePath) : null;
      const diffUrl = toVisualImageUrl(p.metrics.diffPath);

      html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 1rem;">`;

      if (baselineUrl) {
        html += `
          <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem; background: var(--card-bg);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Baseline Screenshot</strong>
              <a href="${baselineUrl}" target="_blank" style="font-size: 0.75rem; color: var(--primary-color); text-decoration: none;">View Full Size &UpperRightArrow;</a>
            </div>
            <a href="${baselineUrl}" target="_blank"><img src="${baselineUrl}" alt="Baseline Screenshot" style="width: 100%; max-height: 280px; object-fit: contain; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 4px; display: block;" /></a>
          </div>`;
      } else {
        html += `
          <div style="border: 1px dashed var(--border-color); border-radius: 6px; padding: 1.5rem 1rem; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.02);">
            <strong style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">Baseline Screenshot</strong>
            <p style="font-size: 0.85rem; margin: 0; line-height: 1.4;">Baseline not established — actual screenshot saved for manual promotion</p>
          </div>`;
      }

      if (actualUrl) {
        html += `
          <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem; background: var(--card-bg);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Actual Screenshot</strong>
              <a href="${actualUrl}" target="_blank" style="font-size: 0.75rem; color: var(--primary-color); text-decoration: none;">View Full Size &UpperRightArrow;</a>
            </div>
            <a href="${actualUrl}" target="_blank"><img src="${actualUrl}" alt="Actual Screenshot" onerror="handleImageError(this)" style="width: 100%; max-height: 280px; object-fit: contain; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 4px; display: block;" /></a>
          </div>`;
      }

      if (diffUrl) {
        html += `
          <div style="border: 1px solid var(--danger); border-radius: 6px; padding: 0.75rem; background: var(--card-bg);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong style="font-size: 0.85rem; color: var(--danger); text-transform: uppercase;">Visual Diff (${escapeHTML(p.metrics.mismatchPercentage)}%)</strong>
              <a href="${diffUrl}" target="_blank" style="font-size: 0.75rem; color: var(--danger); text-decoration: none;">View Full Size &UpperRightArrow;</a>
            </div>
            <a href="${diffUrl}" target="_blank"><img src="${diffUrl}" alt="Visual Diff" onerror="handleImageError(this)" style="width: 100%; max-height: 280px; object-fit: contain; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 4px; display: block;" /></a>
          </div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
  });
  return html;
}

function closeRunDetails() {
  document.getElementById('detailsModal').close();
}

function setupAdHocForm() {
  const form = document.getElementById('testForm');
  const submitBtn = document.getElementById('submitBtn');
  const statusContainer = document.getElementById('statusContainer');
  const currentRunId = document.getElementById('currentRunId');
  const currentStatus = document.getElementById('currentStatus');
  const executionResult = document.getElementById('executionResult');
  const executionAction = document.getElementById('executionAction');

  // Mode radio buttons and containers
  const modeBatch = document.getElementById('modeBatch');
  const modeSingle = document.getElementById('modeSingle');
  const batchModeControls = document.getElementById('batchModeControls');
  const singleModeControls = document.getElementById('singleModeControls');

  // Input elements and badge
  const batchUrlsInput = document.getElementById('batchUrlsInput');
  const batchCountBadge = document.getElementById('batchCountBadge');
  const urlInput = document.getElementById('urlInput');

  const MAX_BATCH_SIZE = 10;
  let pollInterval = null;
  let activeBatch = null;

  // Toggle modes
  function updateMode() {
    const isBatch = modeBatch ? modeBatch.checked : true;
    if (batchModeControls) {
      if (isBatch) batchModeControls.classList.remove('hidden');
      else batchModeControls.classList.add('hidden');
    }
    if (singleModeControls) {
      if (isBatch) singleModeControls.classList.add('hidden');
      else singleModeControls.classList.remove('hidden');
    }
  }

  if (modeBatch) modeBatch.addEventListener('change', updateMode);
  if (modeSingle) modeSingle.addEventListener('change', updateMode);

  // Extract non-blank trimmed lines from textarea
  function getBatchUrls() {
    if (!batchUrlsInput) return [];
    return batchUrlsInput.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  // Update live count badge
  function updateBatchCount() {
    if (!batchCountBadge) return;
    const urls = getBatchUrls();
    const count = urls.length;
    batchCountBadge.textContent = `URLs: ${count} / ${MAX_BATCH_SIZE}`;

    if (count === 0) {
      batchCountBadge.className = 'badge';
      batchCountBadge.style.cssText = 'background: #e2e8f0; color: #334155;';
    } else if (count > MAX_BATCH_SIZE) {
      batchCountBadge.className = 'badge badge-danger';
      batchCountBadge.style.cssText = '';
    } else {
      batchCountBadge.className = 'badge badge-running';
      batchCountBadge.style.cssText = '';
    }
  }

  if (batchUrlsInput) {
    batchUrlsInput.addEventListener('input', updateBatchCount);
    batchUrlsInput.addEventListener('paste', () => {
      setTimeout(updateBatchCount, 50);
    });
  }

  // Initial count render
  updateBatchCount();

  // Client-side URL normalization for duplicate checking (mirrors backend ScopeResolver rules)
  function clientNormalizeUrl(raw) {
    const parsed = new URL(raw);
    let port = parsed.port;
    if ((parsed.protocol === 'http:' && port === '80') || (parsed.protocol === 'https:' && port === '443')) {
      port = '';
    }
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
      if (pathname === '') {
        pathname = '/';
      }
    }
    const host = parsed.hostname.toLowerCase() + (port ? `:${port}` : '');
    return `${parsed.protocol}//${host}${pathname}${parsed.search}`;
  }

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const validatorCheckboxes = document.querySelectorAll('input[name="validator"]:checked');
    const validators = Array.from(validatorCheckboxes).map(cb => cb.value);

    if (validators.length === 0) {
      alert('Please select at least one validator.');
      return;
    }

    const isBatch = modeBatch ? modeBatch.checked : true;
    let payload = { validators };

    if (isBatch) {
      const urls = getBatchUrls();
      if (urls.length === 0) {
        alert('Please enter at least one website URL in the batch textarea.');
        if (batchUrlsInput) batchUrlsInput.focus();
        return;
      }
      if (urls.length > MAX_BATCH_SIZE) {
        alert(`Batch size cannot exceed ${MAX_BATCH_SIZE} URLs. You currently have ${urls.length} URLs.`);
        return;
      }

      // Validate each URL syntax & protocol
      const seenNormalized = new Set();
      for (let i = 0; i < urls.length; i++) {
        const item = urls[i];
        let parsed;
        try {
          parsed = new URL(item);
        } catch (err) {
          alert(`Invalid URL format on line ${i + 1}: "${item}". Please ensure it includes http:// or https://.`);
          return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          alert(`Unsupported protocol on line ${i + 1}: "${item}". Only http: and https: protocols are supported.`);
          return;
        }

        const normalized = clientNormalizeUrl(item);
        if (seenNormalized.has(normalized)) {
          alert(`Duplicate URL detected on line ${i + 1}: "${item}". Each URL in a batch must be distinct.`);
          return;
        }
        seenNormalized.add(normalized);
      }

      payload.urls = urls;
      activeBatch = urls.map(u => {
        let label = u;
        try {
          label = new URL(u).hostname;
        } catch (e) {}
        return {
          websiteId: label,
          name: label,
          url: u
        };
      });
    } else {
      const url = urlInput ? urlInput.value.trim() : '';
      if (!url) {
        alert('Please enter a website URL.');
        if (urlInput) urlInput.focus();
        return;
      }
      let parsed;
      try {
        parsed = new URL(url);
      } catch (err) {
        alert(`Invalid URL format: "${url}". Please ensure it includes http:// or https://.`);
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        alert(`Unsupported protocol: "${url}". Only http: and https: protocols are supported.`);
        return;
      }

      payload.url = url;
      activeBatch = null;
    }

    submitBtn.disabled = true;
    statusContainer.classList.remove('hidden');
    executionResult.classList.add('hidden');
    currentStatus.className = 'badge badge-queued';
    currentStatus.textContent = 'SUBMITTING...';
    currentRunId.textContent = '-';

    if (pollInterval) clearInterval(pollInterval);

    try {
      const res = await fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start execution');
      }

      currentRunId.textContent = data.runId;
      currentStatus.textContent = data.status;
      currentStatus.className = 'badge badge-' + data.status.toLowerCase();

      if (activeBatch && activeBatch.length > 1) {
        renderProvisionalBatchCards(activeBatch, 'Pending');
        executionResult.classList.remove('hidden');
      }

      pollInterval = setInterval(() => pollStatus(data.runId), 3000);

    } catch (err) {
      alert(err.message);
      submitBtn.disabled = false;
      statusContainer.classList.add('hidden');
    }
  });

  function getWebsiteStatus(siteResults) {
    if (!siteResults || siteResults.length === 0) return 'UNKNOWN';
    let failCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    let passCount = 0;
    let skipCount = 0;

    for (const r of siteResults) {
      const s = (r.status || '').toUpperCase();
      if (s === 'FAIL') failCount++;
      else if (s === 'ERROR') errorCount++;
      else if (s === 'WARNING') warningCount++;
      else if (s === 'PASS') passCount++;
      else if (s === 'SKIP') skipCount++;
    }

    if (failCount > 0) return 'FAIL';
    if (errorCount > 0) return 'ERROR';
    if (warningCount > 0) return 'WARNING';
    if (passCount > 0) return 'PASS';
    if (skipCount > 0) return 'SKIP';
    return 'UNKNOWN';
  }

  function renderProvisionalBatchCards(websites, statusText) {
    if (!websites || websites.length <= 1) return;
    const isPending = statusText.toLowerCase() === 'pending';
    const badgeClass = isPending ? 'badge-pending' : 'badge-running';
    let html = `
      <div class="batch-results-container">
        <div class="batch-results-header">
          <span>Websites in this Batch (${websites.length})</span>
        </div>
        <div class="batch-websites-grid">
    `;

    websites.forEach(w => {
      const displayName = w.name && w.name !== w.websiteId ? w.name : w.websiteId;
      const subId = w.name && w.name !== w.websiteId ? `(${escapeHTML(w.websiteId)})` : '';
      html += `
        <div class="batch-website-card">
          <div class="batch-card-header">
            <div class="batch-card-title">
              <strong>${escapeHTML(displayName)}</strong>
              ${subId ? `<span class="batch-card-subid">${subId}</span>` : ''}
            </div>
            <span class="badge ${badgeClass}">${escapeHTML(statusText)}</span>
          </div>
          <div class="batch-card-url">
            <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(w.url)} &UpperRightArrow;</a>
          </div>
          <div class="batch-card-summary">
            <span style="font-size: 0.85rem; color: var(--text-muted);">${isPending ? 'Queued in execution queue...' : 'Validation tests running...'}</span>
            <button type="button" disabled style="opacity: 0.6; cursor: not-allowed; font-size: 0.8rem; padding: 0.25rem 0.75rem;">Pending Results</button>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    executionAction.innerHTML = html;
  }

  function renderBatchFailed(websites) {
    if (!websites || websites.length <= 1) {
      executionAction.innerHTML = '<div style="color: var(--danger); margin-top: 0.5rem;">Execution failed unexpectedly.</div>';
      return;
    }
    let html = `
      <div class="batch-results-container">
        <div class="batch-results-header">
          <span>Websites in this Batch (${websites.length})</span>
        </div>
        <div class="batch-websites-grid">
    `;

    websites.forEach(w => {
      const displayName = w.name && w.name !== w.websiteId ? w.name : w.websiteId;
      const subId = w.name && w.name !== w.websiteId ? `(${escapeHTML(w.websiteId)})` : '';
      html += `
        <div class="batch-website-card">
          <div class="batch-card-header">
            <div class="batch-card-title">
              <strong>${escapeHTML(displayName)}</strong>
              ${subId ? `<span class="batch-card-subid">${subId}</span>` : ''}
            </div>
            <span class="badge badge-error">ERROR</span>
          </div>
          <div class="batch-card-url">
            <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(w.url)} &UpperRightArrow;</a>
          </div>
          <div class="batch-card-summary">
            <span style="font-size: 0.85rem; color: var(--danger);">Execution failed before results could be saved.</span>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    executionAction.innerHTML = html;
  }

  function renderCompletedResults(data) {
    const websites = data.websites || [];
    const results = data.results || [];
    const runId = data.execution?.runId || '';

    if (websites.length > 1) {
      let html = `
        <div class="batch-results-container">
          <div class="batch-results-header">
            <span>Websites in this Batch (${websites.length})</span>
          </div>
          <div class="batch-websites-grid">
      `;

      websites.forEach(w => {
        const siteResults = results.filter(r => r.websiteId === w.websiteId);
        const siteStatus = getWebsiteStatus(siteResults);
        const displayName = w.name && w.name !== w.websiteId ? w.name : w.websiteId;
        const subId = w.name && w.name !== w.websiteId ? `(${escapeHTML(w.websiteId)})` : '';

        const totalCount = siteResults.length;
        const passCount = siteResults.filter(r => r.status === 'PASS').length;
        const warnCount = siteResults.filter(r => r.status === 'WARNING').length;
        const failCount = siteResults.filter(r => r.status === 'FAIL').length;
        const errCount = siteResults.filter(r => r.status === 'ERROR').length;

        let countsHtml = `<span class="batch-count-item">Validators: <strong>${totalCount}</strong></span>`;
        if (passCount > 0) countsHtml += `<span class="batch-count-item text-success">Pass: <strong>${passCount}</strong></span>`;
        if (warnCount > 0) countsHtml += `<span class="batch-count-item text-warning">Warn: <strong>${warnCount}</strong></span>`;
        if (failCount > 0) countsHtml += `<span class="batch-count-item text-danger">Fail: <strong>${failCount}</strong></span>`;
        if (errCount > 0) countsHtml += `<span class="batch-count-item text-danger">Err: <strong>${errCount}</strong></span>`;

        let validatorTagsHtml = '';
        if (siteResults.length > 0) {
          validatorTagsHtml = `<div class="batch-card-validators">` + siteResults.map(r => {
            const vStatus = (r.status || 'UNKNOWN').toUpperCase();
            return `<span class="badge badge-${escapeHTML(vStatus.toLowerCase())}" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">${escapeHTML(r.validatorName.toUpperCase())}: ${escapeHTML(vStatus)}</span>`;
          }).join(' ') + `</div>`;
        }

        html += `
          <div class="batch-website-card">
            <div class="batch-card-header">
              <div class="batch-card-title">
                <strong>${escapeHTML(displayName)}</strong>
                ${subId ? `<span class="batch-card-subid">${subId}</span>` : ''}
              </div>
              <span class="badge badge-${escapeHTML(siteStatus.toLowerCase())}">${escapeHTML(siteStatus)}</span>
            </div>
            <div class="batch-card-url">
              <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(w.url)} &UpperRightArrow;</a>
            </div>
            <div class="batch-card-summary">
              <div class="batch-card-counts">
                ${countsHtml}
              </div>
              ${validatorTagsHtml}
            </div>
            <div class="batch-card-action">
              <button type="button" style="padding: 0.35rem 0.85rem; font-size: 0.85rem;" onclick="openWebsiteQaResult('${escapeHTML(w.websiteId)}', '${escapeHTML(runId)}')">View Detailed Results</button>
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
      executionAction.innerHTML = html;
    } else if (websites.length === 1) {
      const siteId = websites[0].websiteId;
      executionAction.innerHTML = `<button type="button" onclick="openWebsiteQaResult('${escapeHTML(siteId)}', '${escapeHTML(runId)}')">View Detailed Results</button>`;
    } else {
      executionAction.innerHTML = '';
    }
  }

  async function pollStatus(runId) {
    try {
      const res = await fetch(`/api/executions/${runId}`);
      if (!res.ok) return;

      const data = await res.json();

      if (data.status) {
        currentStatus.textContent = data.status;
        currentStatus.className = 'badge badge-' + data.status.toLowerCase();

        if (data.status === 'RUNNING' && activeBatch && activeBatch.length > 1) {
          renderProvisionalBatchCards(activeBatch, 'Running');
          executionResult.classList.remove('hidden');
        } else if (data.status === 'QUEUED' && activeBatch && activeBatch.length > 1) {
          renderProvisionalBatchCards(activeBatch, 'Pending');
          executionResult.classList.remove('hidden');
        } else if (data.status === 'FAILED') {
          clearInterval(pollInterval);
          submitBtn.disabled = false;
          currentStatus.textContent = 'FAILED';
          currentStatus.className = 'badge badge-failed';
          executionResult.classList.remove('hidden');
          renderBatchFailed(activeBatch);
        }
      } else if (data.execution && data.execution.status) {
        clearInterval(pollInterval);
        submitBtn.disabled = false;
        currentStatus.textContent = data.execution.status;
        currentStatus.className = 'badge badge-' + data.execution.status.toLowerCase();

        executionResult.classList.remove('hidden');

        // Render detailed results action buttons for batch or single site
        renderCompletedResults(data);

        loadSummary();
      }
    } catch (err) {
      console.error('Polling error', err);
    }
  }
}

// --- Website History ---

document.getElementById('websiteHistoryBtn').addEventListener('click', () => {
  const input = document.getElementById('websiteHistorySearch');
  const identifier = input.value.trim();
  if (identifier) {
    openWebsiteHistory(identifier);
  }
});

document.getElementById('websiteHistorySearch').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const identifier = e.target.value.trim();
    if (identifier) {
      openWebsiteHistory(identifier);
    }
  }
});

async function openWebsiteHistory(identifier) {
  const modal = document.getElementById('websiteHistoryModal');
  const body = document.getElementById('historyModalBody');

  modal.showModal();
  body.innerHTML = '<p>Loading history...</p>';

  try {
    const res = await fetch(`/api/dashboard/website/${encodeURIComponent(identifier)}/history`);
    if (!res.ok) {
      throw new Error(`Failed to load history: ${res.statusText}`);
    }
    const history = await res.json();

    if (history.length === 0) {
      body.innerHTML = `<p>No history found for <strong>${escapeHTML(identifier)}</strong>.</p>`;
      return;
    }

    const site = history[0];

    let html = `
      <div style="margin-bottom: 1rem;">
        <strong>Website ID:</strong> ${escapeHTML(site.websiteId)}<br>
        <strong>URL:</strong> <a href="${escapeHTML(site.url)}" target="_blank">${escapeHTML(site.url)}</a>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Run ID</th>
            <th>Validators</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const run of history) {
      const valStrings = run.validators.map(v => `${escapeHTML(v.validatorName)}: <span class="badge badge-${escapeHTML(v.status.toLowerCase())}" style="font-size: 0.7em; padding: 0.1em 0.3em;">${escapeHTML(v.status)}</span>`).join('<br>');

      html += `
        <tr>
          <td>${escapeHTML(run.date)}</td>
          <td>${escapeHTML(run.runId)}</td>
          <td>${valStrings}</td>
          <td><span class="badge badge-${escapeHTML(run.overallStatus.toLowerCase())}">${escapeHTML(run.overallStatus)}</span></td>
          <td><button onclick="openWebsiteQaResult('${escapeHTML(site.websiteId)}', '${escapeHTML(run.runId)}')">View Details</button></td>
        </tr>
      `;
    }

    html += `
        </tbody>
      </table>
    `;

    body.innerHTML = html;
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p style="color: red;">Error: ${escapeHTML(err.message)}</p>`;
  }
}
