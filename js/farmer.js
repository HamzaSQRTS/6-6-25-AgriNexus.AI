// farmer.js — static dashboard: real upload + farmer analytics from FastAPI
import { setupCommonUI, apiRequest, showToast } from './api.js';
import { initSmartAgronomy } from './smart_agronomy/main.js';

let yieldChart = null;
let nutrientChart = null;

function destroyCharts() {
  if (yieldChart) {
    yieldChart.destroy();
    yieldChart = null;
  }
  if (nutrientChart) {
    nutrientChart.destroy();
    nutrientChart = null;
  }
}

function renderCharts(analytics) {
  destroyCharts();
  const y = analytics?.charts?.yield;
  const n = analytics?.charts?.nutrients;
  const ctxYield = document.getElementById('yieldChart');
  const ctxNutrient = document.getElementById('nutrientChart');
  if (ctxYield && y?.labels?.length) {
    yieldChart = new Chart(ctxYield, {
      type: 'bar',
      data: {
        labels: y.labels,
        datasets: [
          {
            label: y.title || 'Yield index',
            data: y.data,
            backgroundColor: '#14b8a6',
            borderRadius: 6,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
  }
  if (ctxNutrient && n?.labels?.length) {
    nutrientChart = new Chart(ctxNutrient, {
      type: 'radar',
      data: {
        labels: n.labels,
        datasets: [
          {
            label: n.title || 'Nutrients',
            data: n.data,
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            borderColor: '#10b981',
            pointBackgroundColor: '#10b981',
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }
}

function renderUploadTable(recent) {
  const tableBody = document.getElementById('file-list-body');
  if (!tableBody) return;
  if (!recent?.length) {
    tableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5" class="text-center text-muted" style="padding: 24px;">No files uploaded yet.</td>
      </tr>`;
    return;
  }
  tableBody.innerHTML = recent
    .map(
      (u) => `
    <tr>
      <td><div class="font-bold"><i class="fa-solid fa-file text-emerald-400 mr-2"></i> ${u.filename || 'unknown'}</div></td>
      <td class="text-secondary">—</td>
      <td class="text-secondary">${u.timestamp ? new Date(u.timestamp).toLocaleDateString() : '—'}</td>
      <td><span class="badge badge-green">${u.processed ? 'Processed' : 'Pending'}</span></td>
      <td class="text-secondary text-xs">${u.processing_branch || '—'}</td>
    </tr>`,
    )
    .join('');
}

function applyAnalyticsToPage(analytics) {
  const empty = document.getElementById('analytics-empty-state');
  const content = document.getElementById('analytics-content');
  if (!empty || !content) return;

  if (!analytics || analytics.upload_count === 0) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    destroyCharts();
    return;
  }

  empty.classList.add('hidden');
  content.classList.remove('hidden');

  const s = analytics.summary || {};
  const elH = document.getElementById('stat-health');
  const elM = document.getElementById('stat-moisture');
  const elT = document.getElementById('stat-temp');
  if (elH) elH.textContent = s.crop_health_label || '—';
  if (elM) elM.textContent = s.soil_moisture_label || '—';
  if (elT) elT.textContent = s.temperature_label || '—';

  const titles = content.querySelectorAll('.chart-card .chart-title');
  if (titles[0] && analytics.charts?.yield?.title) titles[0].textContent = analytics.charts.yield.title;
  if (titles[1] && analytics.charts?.nutrients?.title) titles[1].textContent = analytics.charts.nutrients.title;

  renderCharts(analytics);
  renderUploadTable(analytics.recent_uploads);
}

async function refreshFarmerAnalytics() {
  try {
    const analytics = await apiRequest('/farmer/analytics');
    applyAnalyticsToPage(analytics);
    return analytics;
  } catch (e) {
    console.warn(e);
    applyAnalyticsToPage({ upload_count: 0 });
    return null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupCommonUI();
  refreshFarmerAnalytics();
  
  // Initialize Smart Agronomy view features
  initSmartAgronomy().catch(e => {
    console.error('Failed to initialize Smart Agronomy:', e);
  });

  // Sync range badges for soil sliders
  const syncRangeBadges = () => {
    ['soil-ph', 'soil-moisture', 'soil-om', 'soil-drainage'].forEach(id => {
      const range = document.getElementById(id);
      const badge = document.getElementById('val-' + id);
      if (range && badge) {
        badge.textContent = range.value + (id === 'soil-ph' ? '' : '%');
      }
    });
  };

  ['soil-ph', 'soil-moisture', 'soil-om', 'soil-drainage'].forEach(id => {
    const range = document.getElementById(id);
    if (range) {
      range.addEventListener('input', syncRangeBadges);
    }
  });

  document.addEventListener('cityChange', () => {
    // Wait briefly for values to be set by main.js
    setTimeout(syncRangeBadges, 50);
  });

  const resetBtn = document.getElementById('btn-reset-soil');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      setTimeout(syncRangeBadges, 50);
    });
  }

  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const topbarTitle = document.getElementById('topbar-title');

  navItems.forEach((item) => {
    item.addEventListener('click', async () => {
      navItems.forEach((nav) => nav.classList.remove('active'));
      viewSections.forEach((view) => view.classList.remove('active'));
      item.classList.add('active');
      const target = document.getElementById(item.dataset.target);
      if (target) target.classList.add('active');
      if (topbarTitle) topbarTitle.innerHTML = item.innerHTML;
      if (item.dataset.target === 'view-analytics') {
        await refreshFarmerAnalytics();
      }
    });
  });

  // Populate the chat city dropdown from regions.json
  const chatCitySelect = document.getElementById('chat-city');
  if (chatCitySelect) {
    fetch('data/regions.json')
      .then(res => res.json())
      .then(regions => {
        regions.sort((a, b) => a.name.localeCompare(b.name));
        regions.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.name;
          opt.textContent = `${r.name} (${r.country.split('(')[1]?.replace(')', '') || r.country})`;
          chatCitySelect.appendChild(opt);
        });
      })
      .catch(e => console.warn('Failed to load regions for chat dropdown:', e));
  }

  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = chatInput.value.trim();
      if (!message) return;

      appendMessage('user', message);
      chatInput.value = '';

      const aiThinkingId = 'msg-' + Date.now();
      appendMessage('ai', '<i class="fa-solid fa-ellipsis fa-bounce"></i>', aiThinkingId);

      const city = document.getElementById('chat-city')?.value || null;
      const landSizeVal = document.getElementById('chat-land-size')?.value;
      const landSize = landSizeVal ? parseFloat(landSizeVal) : null;

      try {
        const response = await apiRequest('/chat/query', {
          method: 'POST',
          body: JSON.stringify({
            query: message,
            city: city,
            land_size: landSize,
            use_web_search: document.getElementById('chat-web-search')?.checked || false
          }),
        });
        const el = document.getElementById(aiThinkingId);
        if (el) {
          let recsHtml = '';
          if (response.recommendations && response.recommendations.length) {
            recsHtml = `<div style="margin-top: 10px; font-weight: 700; color: var(--teal-400);">📋 Recommendations:</div>
              <ul style="margin-top: 5px; padding-left: 20px; list-style-type: disc;">
                ${response.recommendations.map(r => `<li style="margin-bottom: 4px;">${r}</li>`).join('')}
              </ul>`;
          }
          let citesHtml = '';
          if (response.citations && response.citations.length) {
            citesHtml = `<div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">📚 Sources: ${response.citations.join(', ')}</div>`;
          }
          el.innerHTML = `
            <div style="line-height: 1.5; text-align: left;">
              <strong>Diagnosis / Response:</strong><br/>
              <span style="display: inline-block; margin-top: 5px;">${response.diagnosis}</span>
              ${recsHtml}
              ${citesHtml}
            </div>
          `;
        }
      } catch (error) {
        const el = document.getElementById(aiThinkingId);
        if (el) el.textContent = error.message || 'Chat request failed.';
      }
    });

    document.querySelectorAll('.suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chatInput.value = chip.textContent.trim();
        chatForm.dispatchEvent(new Event('submit'));
      });
    });
  }

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleFiles(e.target.files);
    });
  }

  document.getElementById('btn-clear-files')?.addEventListener('click', () => {
    document.getElementById('file-list-body').innerHTML = `
      <tr class="empty-row">
        <td colspan="5" class="text-center text-muted" style="padding: 24px;">No files uploaded yet.</td>
      </tr>`;
    refreshFarmerAnalytics();
  });
});

function appendMessage(sender, html, forceId = null) {
  const container = document.getElementById('chat-history');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${sender} animate-slide-down`;

  const icon = sender === 'ai' ? '<i class="fa-solid fa-leaf" style="color: var(--teal-400);"></i>' : '<i class="fa-solid fa-user"></i>';

  div.innerHTML = `
    <div class="chat-avatar" style="${sender === 'ai' ? 'background: rgba(20, 184, 166, 0.1); border: 1px solid rgba(20, 184, 166, 0.3);' : ''}">${icon}</div>
    <div class="chat-bubble" ${forceId ? `id="${forceId}"` : ''}>${html}</div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function handleFiles(files) {
  const tableBody = document.getElementById('file-list-body');
  const emptyRow = tableBody?.querySelector('.empty-row');
  if (emptyRow) emptyRow.remove();

  for (const file of Array.from(files)) {
    const fd = new FormData();
    fd.append('file', file);
    let status = 'Processed';
    let detail = '';
    try {
      await apiRequest('/upload/file', { method: 'POST', body: fd });
      showToast(`${file.name} processed.`);
    } catch (err) {
      status = 'Failed';
      detail = err.message || String(err);
      showToast(detail, true);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="font-bold"><i class="fa-solid fa-file text-emerald-400 mr-2"></i> ${file.name}</div></td>
      <td class="text-secondary">${(file.size / 1024).toFixed(1)} KB</td>
      <td class="text-secondary">${new Date().toLocaleDateString()}</td>
      <td><span class="badge ${status === 'Processed' ? 'badge-green' : 'badge-red'}">${status}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm action-btn" type="button" title="${detail.replace(/"/g, '&quot;')}"><i class="fa-solid fa-info"></i></button>
      </td>
    `;
    tableBody.appendChild(tr);
  }

  await refreshFarmerAnalytics();
}
