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

  switch(res.validatorName.toLowerCase()) {
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
       if (p.metrics?.mismatchPercentage !== undefined) metaInfo.push(`Mismatch: ${escapeHTML(p.metrics.mismatchPercentage)}%`);
       if (p.metrics?.diffPixels !== undefined) metaInfo.push(`Diff Pixels: ${escapeHTML(p.metrics.diffPixels)}`);
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

  let pollInterval = null;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = document.getElementById('urlInput').value;
    const validatorCheckboxes = document.querySelectorAll('input[name="validator"]:checked');
    const validators = Array.from(validatorCheckboxes).map(cb => cb.value);

    if (validators.length === 0) {
      alert('Please select at least one validator.');
      return;
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
        body: JSON.stringify({ url, validators })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start execution');
      }

      currentRunId.textContent = data.runId;
      currentStatus.textContent = data.status;
      currentStatus.className = 'badge badge-' + data.status.toLowerCase();

      pollInterval = setInterval(() => pollStatus(data.runId, url), 3000);

    } catch (err) {
      alert(err.message);
      submitBtn.disabled = false;
      statusContainer.classList.add('hidden');
    }
  });

  async function pollStatus(runId, urlStr) {
    try {
      const res = await fetch(`/api/executions/${runId}`);
      if (!res.ok) return;

      const data = await res.json();
      
      if (data.status) {
        currentStatus.textContent = data.status;
        currentStatus.className = 'badge badge-' + data.status.toLowerCase();
      } else if (data.execution && data.execution.status) {
        clearInterval(pollInterval);
        submitBtn.disabled = false;
        currentStatus.textContent = data.execution.status;
        currentStatus.className = 'badge badge-' + data.execution.status.toLowerCase();
        
        executionResult.classList.remove('hidden');
        
        // Find the website ID associated with this ad-hoc URL
        let websiteIdToOpen = '';
        if (data.websites && data.websites.length > 0) {
          websiteIdToOpen = data.websites[0].websiteId;
        }

        if (websiteIdToOpen) {
          executionAction.innerHTML = `<button onclick="openWebsiteQaResult('${escapeHTML(websiteIdToOpen)}', '${escapeHTML(data.execution.runId)}')">View Detailed Results</button>`;
        } else {
          executionAction.innerHTML = '';
        }
        
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
