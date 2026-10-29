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
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="table-empty-cell">
          <div class="empty-state-wrap">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-title">No Website Tests Recorded</div>
            <div class="empty-state-desc">No test runs were recorded for this date. Run a QA test above or select another date from the header.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = websites.map(site => {
    const valTags = (site.validators || []).map(v => `<span class="val-tag">${escapeHTML(v.toUpperCase())}</span>`).join('');
    return `
      <tr class="table-row-clickable" onclick="openWebsiteQaResult('${escapeHTML(site.websiteId)}', '${escapeHTML(site.runId)}');">
        <td>
          <a href="#" class="table-website-link" onclick="event.preventDefault();">${escapeHTML(site.websiteId)}</a>
        </td>
        <td>
          <a href="${escapeHTML(site.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="table-url-link">${escapeHTML(site.url)} &UpperRightArrow;</a>
        </td>
        <td>
          <span class="badge badge-${escapeHTML(site.overallStatus.toLowerCase())}">${escapeHTML(site.overallStatus)}</span>
        </td>
        <td>
          <div class="table-validators-list">${valTags}</div>
        </td>
      </tr>
    `;
  }).join('');
}

async function openWebsiteQaResult(websiteId, runId) {
  const modal = document.getElementById('detailsModal');
  const modalBody = document.getElementById('modalBodyContent');
  modalBody.innerHTML = `
    <div class="modal-loading-state">
      <div class="spinner"></div>
      <p>Loading QA results for <strong>${escapeHTML(websiteId)}</strong>...</p>
    </div>
  `;
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
      const s = (r.status || '').toUpperCase();
      if (s === 'FAIL' || s === 'ERROR') hasFail = true;
      else if (s === 'WARNING') hasWarning = true;
    });
    if (hasFail) overallStatus = 'FAIL';
    else if (hasWarning) overallStatus = 'WARNING';

    let html = `
      <div class="modal-meta-box">
        <div class="modal-meta-grid">
          <div class="modal-meta-item">
            <span class="modal-meta-label">Website ID</span>
            <code class="modal-meta-value">${escapeHTML(websiteInfo.websiteId)}</code>
          </div>
          <div class="modal-meta-item">
            <span class="modal-meta-label">Overall Status</span>
            <div><span class="badge badge-${escapeHTML(overallStatus.toLowerCase())}">${escapeHTML(overallStatus)}</span></div>
          </div>
          <div class="modal-meta-item">
            <span class="modal-meta-label">Run ID</span>
            <code class="modal-meta-value">${escapeHTML(runId)}</code>
          </div>
          <div class="modal-meta-item full-width">
            <span class="modal-meta-label">Target URL</span>
            <a href="${escapeHTML(websiteInfo.url)}" target="_blank" rel="noopener noreferrer" class="modal-meta-url">${escapeHTML(websiteInfo.url)} &UpperRightArrow;</a>
          </div>
        </div>
      </div>

      <div class="modal-section-header">
        <h3>Tests Performed (${siteResults.length})</h3>
      </div>
    `;

    siteResults.forEach(res => {
      html += `
        <div class="validator-card status-${escapeHTML((res.status || 'unknown').toLowerCase())}">
          <div class="validator-card-header">
            <span class="validator-card-title">${escapeHTML(res.validatorName.toUpperCase())}</span>
            <span class="badge badge-${escapeHTML(res.status.toLowerCase())}">${escapeHTML(res.status)}</span>
          </div>
          <div class="validator-card-body">
            ${renderQaReport(res)}
          </div>
        </div>
      `;
    });

    modalBody.innerHTML = html;
  } catch (err) {
    modalBody.innerHTML = `
      <div class="modal-error-state">
        <div class="modal-error-title">Unable to Load QA Result</div>
        <div class="modal-error-message">${escapeHTML(err.message)}</div>
      </div>
    `;
  }
}

function getStatusColor(status) {
  if (status === 'PASS') return 'var(--success)';
  if (status === 'WARNING') return 'var(--warning)';
  if (status === 'FAIL' || status === 'ERROR') return 'var(--danger)';
  return 'var(--text-muted)';
}

function renderQaReport(res) {
  let html = `<div class="report-result-lead"><strong>Result:</strong> ${escapeHTML(res.message || res.error || '-')}</div>`;
  const details = res.details || {};
  const metrics = res.metrics || {};
  const pages = res.pages || details.pageResults || [];

  switch (res.validatorName.toLowerCase()) {
    case 'dns':
      html += `<h4 class="report-section-title">DNS Information</h4>`;
      let dnsRows = '';
      if (details.cnames && details.cnames.length > 0) dnsRows += `<tr><th class="info-table-label">CNAME</th><td class="info-table-value">${escapeHTML(details.cnames.join(', '))}</td></tr>`;
      if (details.ipAddresses && details.ipAddresses.length > 0) dnsRows += `<tr><th class="info-table-label">IP Address</th><td class="info-table-value">${escapeHTML(details.ipAddresses.join(', '))}</td></tr>`;
      if (details.infrastructure) dnsRows += `<tr><th class="info-table-label">Infrastructure</th><td class="info-table-value">${escapeHTML(details.infrastructure)}</td></tr>`;
      if (details.relationship) dnsRows += `<tr><th class="info-table-label">Relationship</th><td class="info-table-value">${escapeHTML(details.relationship)}</td></tr>`;
      if (dnsRows) html += `<div class="table-responsive"><table class="info-table"><tbody>${dnsRows}</tbody></table></div>`;
      break;

    case 'ssl':
      html += `<h4 class="report-section-title">Certificate Information</h4>`;
      let sslRows = '';
      const cert = details.certificateNormalized;
      if (cert) {
        if (cert.subject) sslRows += `<tr><th class="info-table-label">Domain / Subject</th><td class="info-table-value">${escapeHTML(cert.subject)}</td></tr>`;
        if (cert.issuer) sslRows += `<tr><th class="info-table-label">Issuer</th><td class="info-table-value">${escapeHTML(cert.issuer)}</td></tr>`;
        if (cert.validFrom) sslRows += `<tr><th class="info-table-label">Valid From</th><td class="info-table-value">${escapeHTML(cert.validFrom)}</td></tr>`;
        if (cert.validTo) sslRows += `<tr><th class="info-table-label">Valid Until</th><td class="info-table-value">${escapeHTML(cert.validTo)}</td></tr>`;
        if (cert.daysRemaining !== undefined) sslRows += `<tr><th class="info-table-label">Days Remaining</th><td class="info-table-value">${escapeHTML(cert.daysRemaining)}</td></tr>`;
      }
      if (details.finalUrl) sslRows += `<tr><th class="info-table-label">Final URL</th><td class="info-table-value">${escapeHTML(details.finalUrl)}</td></tr>`;
      if (sslRows) html += `<div class="table-responsive"><table class="info-table"><tbody>${sslRows}</tbody></table></div>`;
      break;

    case 'http':
      html += `<h4 class="report-section-title">HTTP Information</h4>`;
      let httpRows = '';
      if (details.statusCode) httpRows += `<tr><th class="info-table-label">Status Code</th><td class="info-table-value"><span class="badge ${details.statusCode < 400 ? 'badge-pass' : 'badge-fail'}">${escapeHTML(details.statusCode)}</span></td></tr>`;
      if (details.originalUrl) httpRows += `<tr><th class="info-table-label">Original URL</th><td class="info-table-value">${escapeHTML(details.originalUrl)}</td></tr>`;
      if (details.finalUrl) httpRows += `<tr><th class="info-table-label">Final URL</th><td class="info-table-value">${escapeHTML(details.finalUrl)}</td></tr>`;
      if (httpRows) html += `<div class="table-responsive"><table class="info-table"><tbody>${httpRows}</tbody></table></div>`;
      break;

    case 'ui':
    case 'responsive':
    case 'cross-browser':
    case 'visual':
      html += `<h4 class="report-section-title">Pages Tested (${pages.length})</h4>`;
      html += renderPages(pages, res.validatorName.toLowerCase());
      break;

    default:
      if (pages.length > 0) {
        html += `<h4 class="report-section-title">Pages Tested (${pages.length})</h4>`;
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
  placeholder.className = 'visual-diff-unavailable';
  placeholder.style.cssText = 'padding: 1.5rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px dashed var(--border-color);';
  placeholder.textContent = 'Image file is no longer available';

  if (link) {
    link.replaceWith(placeholder);
  } else {
    img.replaceWith(placeholder);
  }
}

function renderPages(pages, type) {
  if (!pages || pages.length === 0) return '<div class="empty-pages-notice">No pages were tested.</div>';

  let html = '';
  pages.forEach(p => {
    html += `<div class="page-card">`;
    html += `<div class="page-card-header">`;
    html += `<span class="badge badge-${escapeHTML(p.status?.toLowerCase() || 'unknown')}">${escapeHTML(p.status || 'UNKNOWN')}</span>`;
    html += `<span class="page-card-url">${escapeHTML(p.url)}</span>`;
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
      html += `<div class="page-card-meta">${metaInfo.join(' <span class="meta-separator">&bull;</span> ')}</div>`;
    }

    if (p.issues && p.issues.length > 0) {
      html += `<div class="page-card-issues"><strong class="page-card-issues-title">Issues:</strong><ul>`;
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

      html += `<div class="visual-diff-grid">`;

      if (baselineUrl) {
        html += `
          <div class="visual-diff-card">
            <div class="visual-diff-header">
              <strong class="visual-diff-label">Baseline Screenshot</strong>
              <a href="${baselineUrl}" target="_blank" class="visual-diff-link">View Full Size &UpperRightArrow;</a>
            </div>
            <a href="${baselineUrl}" target="_blank" class="visual-diff-img-wrap"><img src="${baselineUrl}" alt="Baseline Screenshot" class="visual-diff-img" /></a>
          </div>`;
      } else {
        html += `
          <div class="visual-diff-card visual-diff-empty">
            <strong class="visual-diff-label">Baseline Screenshot</strong>
            <p>Baseline not established — actual screenshot saved for manual promotion</p>
          </div>`;
      }

      if (actualUrl) {
        html += `
          <div class="visual-diff-card">
            <div class="visual-diff-header">
              <strong class="visual-diff-label">Actual Screenshot</strong>
              <a href="${actualUrl}" target="_blank" class="visual-diff-link">View Full Size &UpperRightArrow;</a>
            </div>
            <a href="${actualUrl}" target="_blank" class="visual-diff-img-wrap"><img src="${actualUrl}" alt="Actual Screenshot" onerror="handleImageError(this)" class="visual-diff-img" /></a>
          </div>`;
      }

      if (diffUrl) {
        html += `
          <div class="visual-diff-card visual-diff-mismatch">
            <div class="visual-diff-header">
              <strong class="visual-diff-label text-danger">Visual Diff (${escapeHTML(p.metrics.mismatchPercentage)}%)</strong>
              <a href="${diffUrl}" target="_blank" class="visual-diff-link text-danger">View Full Size &UpperRightArrow;</a>
            </div>
            <a href="${diffUrl}" target="_blank" class="visual-diff-img-wrap"><img src="${diffUrl}" alt="Visual Diff" onerror="handleImageError(this)" class="visual-diff-img" /></a>
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

  // URL input textarea and live counter badge
  const batchUrlsInput = document.getElementById('batchUrlsInput');
  const batchCountBadge = document.getElementById('batchCountBadge');

  const MAX_BATCH_SIZE = 10;
  let pollInterval = null;
  let activeBatch = null;

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
      batchCountBadge.className = 'badge badge-queued';
      batchCountBadge.style.cssText = '';
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

  // Helper to ensure URL has an explicit protocol, defaulting to https:// if omitted
  function resolveUrlProtocol(raw) {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';

    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ||
                      /^(javascript|data|vbscript|mailto|about|blob):/i.test(trimmed);
    return hasScheme ? trimmed : `https://${trimmed}`;
  }

  // Client-side URL normalization for duplicate checking (mirrors backend ScopeResolver rules)
  function clientNormalizeUrl(raw) {
    const urlToParse = resolveUrlProtocol(raw);
    const parsed = new URL(urlToParse);
    let port = parsed.port;
    if ((parsed.protocol === 'http:' && port === '80') || (parsed.protocol === 'https:' && port === '443')) {
      port = '';
    }
    let pathname = parsed.pathname || '/';
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
      if (pathname === '') {
        pathname = '/';
      }
    }
    const host = parsed.hostname.toLowerCase() + (port ? `:${port}` : '');
    const protocol = parsed.protocol.toLowerCase();
    const search = parsed.search || '';
    return `${protocol}//${host}${pathname}${search}`;
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

    const urls = getBatchUrls();
    if (urls.length === 0) {
      alert('Please enter at least one website URL in the textarea.');
      if (batchUrlsInput) batchUrlsInput.focus();
      return;
    }
    if (urls.length > MAX_BATCH_SIZE) {
      alert(`Batch size cannot exceed ${MAX_BATCH_SIZE} URLs. You currently have ${urls.length} URLs.`);
      return;
    }

    // Validate each URL syntax & protocol
    const seenNormalized = new Set();
    const resolvedUrls = [];
    for (let i = 0; i < urls.length; i++) {
      const item = urls[i];
      const withProtocol = resolveUrlProtocol(item);
      let parsed;
      try {
        parsed = new URL(withProtocol);
      } catch (err) {
        alert(`Invalid URL format on line ${i + 1}: "${item}". Please enter a valid website domain or URL.`);
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        alert(`Unsupported protocol on line ${i + 1}: "${item}". Only http: and https: protocols are supported.`);
        return;
      }

      const host = parsed.hostname.toLowerCase();
      const isLocalhost = host === 'localhost';
      const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith('[');
      const hasValidDomainStructure = host.includes('.') && !host.startsWith('.') && !host.endsWith('.');

      if (!isLocalhost && !isIp && !hasValidDomainStructure) {
        alert(`Invalid URL format on line ${i + 1}: "${item}". Please enter a valid website domain or URL.`);
        return;
      }

      let normalized;
      try {
        normalized = clientNormalizeUrl(withProtocol);
      } catch (err) {
        alert(`Invalid URL format on line ${i + 1}: "${item}".`);
        return;
      }

      if (seenNormalized.has(normalized)) {
        alert(`Duplicate URL detected on line ${i + 1}: "${item}". Each URL must be distinct.`);
        return;
      }
      seenNormalized.add(normalized);
      resolvedUrls.push(withProtocol);
    }

    const payload = { urls: resolvedUrls, validators };
    activeBatch = resolvedUrls.map(u => {
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

      if (activeBatch && activeBatch.length > 0) {
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
    if (!websites || websites.length === 0) return;
    const isPending = statusText.toLowerCase() === 'pending';
    const badgeClass = isPending ? 'badge-pending' : 'badge-running';
    let html = `
      <div class="batch-results-container">
        <div class="batch-results-header">
          <span>Websites in this Execution (${websites.length})</span>
        </div>
        <div class="batch-websites-grid">
    `;

    websites.forEach(w => {
      const displayName = w.name && w.name !== w.websiteId ? w.name : w.websiteId;
      const subId = w.name && w.name !== w.websiteId ? `(${escapeHTML(w.websiteId)})` : '';
      html += `
        <div class="batch-website-card provisional">
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
            <button type="button" class="btn btn-secondary btn-sm" disabled style="opacity: 0.6; cursor: not-allowed;">Pending Results</button>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    executionAction.innerHTML = html;
  }

  function renderBatchFailed(websites) {
    if (!websites || websites.length === 0) {
      executionAction.innerHTML = '<div style="color: var(--danger); margin-top: 0.5rem;">Execution failed unexpectedly.</div>';
      return;
    }
    let html = `
      <div class="batch-results-container">
        <div class="batch-results-header">
          <span>Websites in this Execution (${websites.length})</span>
        </div>
        <div class="batch-websites-grid">
    `;

    websites.forEach(w => {
      const displayName = w.name && w.name !== w.websiteId ? w.name : w.websiteId;
      const subId = w.name && w.name !== w.websiteId ? `(${escapeHTML(w.websiteId)})` : '';
      html += `
        <div class="batch-website-card status-fail">
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

    if (websites.length >= 1) {
      let html = `
        <div class="batch-results-container">
          <div class="batch-results-header">
            <span>Websites in this Execution (${websites.length})</span>
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
        if (passCount > 0) countsHtml += `<span class="batch-count-item text-success count-pass">Pass: <strong>${passCount}</strong></span>`;
        if (warnCount > 0) countsHtml += `<span class="batch-count-item text-warning count-warn">Warn: <strong>${warnCount}</strong></span>`;
        if (failCount > 0) countsHtml += `<span class="batch-count-item text-danger count-fail">Fail: <strong>${failCount}</strong></span>`;
        if (errCount > 0) countsHtml += `<span class="batch-count-item text-danger count-err">Err: <strong>${errCount}</strong></span>`;

        let validatorTagsHtml = '';
        if (siteResults.length > 0) {
          validatorTagsHtml = `<div class="batch-card-validators">` + siteResults.map(r => {
            const vStatus = (r.status || 'UNKNOWN').toUpperCase();
            return `<span class="badge badge-${escapeHTML(vStatus.toLowerCase())}" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">${escapeHTML(r.validatorName.toUpperCase())}: ${escapeHTML(vStatus)}</span>`;
          }).join(' ') + `</div>`;
        }

        html += `
          <div class="batch-website-card status-${escapeHTML(siteStatus.toLowerCase())}">
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
              <button type="button" class="btn btn-secondary btn-sm" onclick="openWebsiteQaResult('${escapeHTML(w.websiteId)}', '${escapeHTML(runId)}')">View Detailed Results</button>
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
      executionAction.innerHTML = html;
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

        if (data.status === 'RUNNING' && activeBatch && activeBatch.length > 0) {
          renderProvisionalBatchCards(activeBatch, 'Running');
          executionResult.classList.remove('hidden');
        } else if (data.status === 'QUEUED' && activeBatch && activeBatch.length > 0) {
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
  body.innerHTML = `
    <div class="modal-loading-state">
      <div class="spinner"></div>
      <p>Loading history for <strong>${escapeHTML(identifier)}</strong>...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/dashboard/website/${encodeURIComponent(identifier)}/history`);
    if (!res.ok) {
      throw new Error(`Failed to load history: ${res.statusText}`);
    }
    const history = await res.json();

    if (history.length === 0) {
      body.innerHTML = `
        <div class="modal-empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-title">No History Records Found</div>
          <div class="empty-state-desc">No past execution records were found matching <strong>${escapeHTML(identifier)}</strong>.</div>
        </div>
      `;
      return;
    }

    const site = history[0];

    let html = `
      <div class="history-meta-card">
        <div class="history-meta-grid">
          <div class="history-meta-col history-meta-id">
            <span class="history-meta-label">Website ID</span>
            <code class="history-meta-value" title="${escapeHTML(site.websiteId)}">${escapeHTML(site.websiteId)}</code>
          </div>
          <div class="history-meta-col history-meta-url">
            <span class="history-meta-label">Target URL</span>
            <a href="${escapeHTML(site.url)}" target="_blank" rel="noopener noreferrer" class="history-meta-link" title="${escapeHTML(site.url)}">
              <span class="history-meta-url-text">${escapeHTML(site.url)}</span>
              <span class="history-meta-ext">&UpperRightArrow;</span>
            </a>
          </div>
          <div class="history-meta-col history-meta-count">
            <span class="history-meta-label">Total Executions</span>
            <span class="history-meta-badge">${history.length} ${history.length === 1 ? 'Run' : 'Runs'}</span>
          </div>
        </div>
      </div>
      <div class="table-responsive history-table-responsive">
        <table class="table history-table">
          <thead>
            <tr>
              <th class="col-date">Date</th>
              <th class="col-run-id">Run ID</th>
              <th class="col-validators">Validators</th>
              <th class="col-status">Status</th>
              <th class="col-action">Action</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const run of history) {
      const valBadges = run.validators.map(v => {
        const valName = (v.validatorName || '').toUpperCase();
        const valStatus = (v.status || '').toUpperCase();
        const statusClass = (v.status || 'unknown').toLowerCase();
        return `
          <span class="history-val-badge badge-${escapeHTML(statusClass)}" title="${escapeHTML(valName)}: ${escapeHTML(valStatus)}">
            <span class="val-badge-name">${escapeHTML(valName)}</span>
            <span class="val-badge-status">${escapeHTML(valStatus)}</span>
          </span>
        `;
      }).join('');

      html += `
        <tr>
          <td class="col-date"><span class="history-date">${escapeHTML(run.date)}</span></td>
          <td class="col-run-id">
            <code class="history-run-id" title="${escapeHTML(run.runId)}">${escapeHTML(run.runId)}</code>
          </td>
          <td class="col-validators">
            <div class="history-val-list">${valBadges}</div>
          </td>
          <td class="col-status">
            <span class="badge badge-${escapeHTML(run.overallStatus.toLowerCase())}">${escapeHTML(run.overallStatus)}</span>
          </td>
          <td class="col-action">
            <button type="button" class="btn btn-secondary btn-sm history-action-btn" onclick="openWebsiteQaResult('${escapeHTML(site.websiteId)}', '${escapeHTML(run.runId)}')">View Details</button>
          </td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    body.innerHTML = html;
  } catch (err) {
    console.error(err);
    body.innerHTML = `
      <div class="modal-error-state">
        <div class="modal-error-title">Failed to load history</div>
        <div class="modal-error-message">${escapeHTML(err.message)}</div>
      </div>
    `;
  }
}
