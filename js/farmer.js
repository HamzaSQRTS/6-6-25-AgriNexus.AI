// farmer.js — static dashboard: real upload + farmer analytics from FastAPI
import { setupCommonUI, apiRequest, showToast } from './api.js';
import { initSmartAgronomy } from './smart_agronomy/main.js';

let yieldChart = null;
let nutrientChart = null;
const uploadedDocuments = new Map();

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

      const selectedCheckboxes = document.querySelectorAll('.doc-checkbox:checked');
      const selectedFiles = Array.from(selectedCheckboxes).map(cb => cb.dataset.filename);
      const activeDocs = selectedFiles.map(filename => ({
        filename: filename,
        text: uploadedDocuments.get(filename) || ""
      }));

      try {
        const response = await apiRequest('/chat/query', {
          method: 'POST',
          body: JSON.stringify({
            query: message,
            selected_files: selectedFiles,
            active_docs: activeDocs
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

    // Toggle Chat Overlay Query History inside AI Advisory
    const toggleOverlayBtn = document.getElementById('btn-toggle-chat-history');
    const closeOverlayBtn = document.getElementById('btn-close-chat-history');
    const historyOverlay = document.getElementById('chat-history-overlay');
    const historyListContainer = document.getElementById('chat-history-list');

    const loadChatHistoryOverlay = async () => {
      try {
        historyListContainer.innerHTML = '<div class="text-center text-muted" style="padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin text-teal-400"></i> Loading queries...</div>';
        const history = await apiRequest('/chat/history');
        if (!history || !history.length) {
          historyListContainer.innerHTML = '<div class="text-center text-muted" style="padding: 20px;">No query history yet.</div>';
          return;
        }
        historyListContainer.innerHTML = history.map(item => {
          const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : "";
          const queryText = item.query || "";
          return `
            <div class="overlay-item" data-query="${queryText.replace(/"/g, '&quot;')}">
              <div class="item-query">${queryText}</div>
              <div class="item-date">${dateStr}</div>
            </div>
          `;
        }).join('');

        // Bind click events on items to auto-populate chat input
        historyListContainer.querySelectorAll('.overlay-item').forEach(item => {
          item.addEventListener('click', () => {
            chatInput.value = item.dataset.query;
            historyOverlay.classList.add('hidden');
          });
        });
      } catch (err) {
        historyListContainer.innerHTML = '<div class="text-center text-muted" style="padding: 20px; color: var(--red-400);">Failed to load history.</div>';
      }
    };

    if (toggleOverlayBtn && historyOverlay) {
      toggleOverlayBtn.addEventListener('click', () => {
        const isHidden = historyOverlay.classList.contains('hidden');
        if (isHidden) {
          historyOverlay.classList.remove('hidden');
          loadChatHistoryOverlay();
        } else {
          historyOverlay.classList.add('hidden');
        }
      });
    }

    if (closeOverlayBtn && historyOverlay) {
      closeOverlayBtn.addEventListener('click', () => {
        historyOverlay.classList.add('hidden');
      });
    }

    const chatAttachBtn = document.getElementById('btn-chat-attach');
    const chatFileInput = document.getElementById('chat-file-input');
    if (chatAttachBtn && chatFileInput) {
      chatAttachBtn.addEventListener('click', () => {
        chatFileInput.click();
      });
      chatFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
          handleChatFiles(e.target.files);
        }
      });
    }
  }
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

function renderDocumentShelf() {
  const shelf = document.getElementById('chat-document-shelf');
  if (!shelf) return;
  if (uploadedDocuments.size === 0) {
    shelf.classList.add('hidden');
    shelf.innerHTML = '';
    return;
  }
  shelf.classList.remove('hidden');
  shelf.innerHTML = Array.from(uploadedDocuments.keys()).map(filename => `
    <div class="doc-pill">
      <input type="checkbox" class="doc-checkbox" data-filename="${filename.replace(/"/g, '&quot;')}" checked>
      <span><i class="fa-solid fa-file-invoice"></i> ${filename}</span>
      <button class="doc-delete-btn" data-filename="${filename.replace(/"/g, '&quot;')}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
  
  // Bind delete events
  shelf.querySelectorAll('.doc-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const fname = btn.dataset.filename;
      uploadedDocuments.delete(fname);
      renderDocumentShelf();
    });
  });
}

async function handleChatFiles(files) {
  for (const file of Array.from(files)) {
    const aiThinkingId = 'msg-upload-' + Date.now();
    appendMessage('ai', `<i class="fa-solid fa-circle-notch fa-spin text-teal-400"></i> Uploading and analyzing document: <strong>${file.name}</strong>...`, aiThinkingId);
    
    const fd = new FormData();
    fd.append('file', file);
    try {
      const response = await apiRequest('/upload/file', { method: 'POST', body: fd });
      showToast(`${file.name} uploaded and processed.`);
      const bubbleEl = document.getElementById(aiThinkingId);
      if (bubbleEl) {
        bubbleEl.innerHTML = `✅ <strong>${file.name}</strong> has been uploaded and processed successfully! I have analyzed its contents and added it to my knowledge base. You can now ask questions about it.`;
      }
      uploadedDocuments.set(file.name, response.metadata?.text || "");
      renderDocumentShelf();
    } catch (err) {
      const bubbleEl = document.getElementById(aiThinkingId);
      if (bubbleEl) {
        bubbleEl.innerHTML = `❌ Failed to process <strong>${file.name}</strong>. Error: ${err.message || String(err)}`;
      }
      showToast(err.message || String(err), true);
    }
  }
  await refreshFarmerAnalytics();
}

// Plant Health Tab Functionality
let selectedPlantFile = null;

function initPlantHealthUI() {
  const dropZone = document.getElementById('plant-drop-zone');
  const fileInput = document.getElementById('plant-file-input');
  const previewContainer = document.getElementById('plant-preview-container');
  const imagePreview = document.getElementById('plant-image-preview');
  const btnRemovePreview = document.getElementById('btn-remove-plant-preview');
  const btnSubmit = document.getElementById('btn-submit-plant');
  const btnClear = document.getElementById('btn-clear-plant');
  const loadingOverlay = document.getElementById('plant-loading-overlay');
  const loadingText = document.getElementById('plant-loading-text');
  
  const altCard = document.getElementById('plant-alt-card');
  const altList = document.getElementById('plant-alt-list');
  
  // Results Elements
  const emptyState = document.getElementById('plant-result-empty-state');
  const contentArea = document.getElementById('plant-result-content');
  const reportPlantName = document.getElementById('report-plant-name');
  const reportScientificName = document.getElementById('report-scientific-name');
  const reportConfidenceBadge = document.getElementById('report-confidence-badge');
  const reportHealthScore = document.getElementById('report-health-score');
  const reportHealthCondition = document.getElementById('report-health-condition');
  const reportDetectedDiseases = document.getElementById('report-detected-diseases');
  const reportSummary = document.getElementById('report-summary');
  const reportCauses = document.getElementById('report-causes');
  const reportTreatment = document.getElementById('report-treatment-recommendations');
  const reportPrevention = document.getElementById('report-prevention');
  const reportSeverityLevel = document.getElementById('report-severity-level');
  
  if (!dropZone || !fileInput) return;

  const setPreview = (file) => {
    if (!file) {
      selectedPlantFile = null;
      previewContainer.classList.add('hidden');
      dropZone.classList.remove('hidden');
      btnSubmit.disabled = true;
      return;
    }
    
    selectedPlantFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      previewContainer.classList.remove('hidden');
      dropZone.classList.add('hidden');
      btnSubmit.disabled = false;
    };
    reader.readAsDataURL(file);
  };

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) setPreview(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) setPreview(e.dataTransfer.files[0]);
  });

  btnRemovePreview.addEventListener('click', () => setPreview(null));
  btnClear.addEventListener('click', () => {
    setPreview(null);
    emptyState.classList.remove('hidden');
    contentArea.classList.add('hidden');
    altCard.classList.add('hidden');
    const diagImgCard = document.getElementById('plant-diagnosed-image-card');
    if (diagImgCard) diagImgCard.classList.add('hidden');
  });

  btnSubmit.addEventListener('click', async () => {
    if (!selectedPlantFile) return;
    
    // 1. Show Upload Loading State
    loadingOverlay.classList.remove('hidden');
    btnSubmit.disabled = true;
    loadingText.textContent = "Uploading & Identifying species...";
    
    const formData = new FormData();
    formData.append('file', selectedPlantFile);
    
    try {
      // Step A: Upload plant image and get species identification
      const uploadRes = await apiRequest('/plant/upload-plant', {
        method: 'POST',
        body: formData
      });
      
      // Render alternatives
      if (uploadRes.alternatives && uploadRes.alternatives.length) {
        altList.innerHTML = uploadRes.alternatives.map(alt => `
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-dim); padding: 8px 12px; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-leaf text-yellow-500"></i>
            <span>${alt}</span>
          </div>
        `).join('');
        altCard.classList.remove('hidden');
      } else {
        altCard.classList.add('hidden');
      }

      // Step B: Health Pathology analysis via OpenAI Vision
      loadingText.textContent = "Analyzing health pathologically...";
      const analyzeRes = await apiRequest('/plant/analyze-plant', {
        method: 'POST',
        body: JSON.stringify({
          upload_id: uploadRes.upload_id,
          plant_name: uploadRes.plant_name,
          scientific_name: uploadRes.scientific_name,
          confidence: uploadRes.confidence
        })
      });

      analyzeRes.image_path = uploadRes.image_path;
      renderPlantAnalysisReport(analyzeRes);
      showToast("Diagnostic analysis completed!");
      loadPlantHistory();
      
    } catch (err) {
      showToast(err.message || "Diagnostic failed", true);
    } finally {
      loadingOverlay.classList.add('hidden');
      btnSubmit.disabled = false;
    }
  });

  // Render individual analysis diagnostic data onto page cards
  function renderPlantAnalysisReport(data) {
    emptyState.classList.add('hidden');
    contentArea.classList.remove('hidden');
    
    const imgEl = document.getElementById('report-plant-image');
    const diagImgCard = document.getElementById('plant-diagnosed-image-card');
    if (imgEl && data.image_path) {
      imgEl.src = data.image_path;
      if (diagImgCard) diagImgCard.classList.remove('hidden');
    } else {
      if (diagImgCard) diagImgCard.classList.add('hidden');
    }
    
    reportPlantName.textContent = data.plant_name;
    reportScientificName.textContent = data.scientific_name || "Unknown Scientific Name";
    
    const confPct = Math.round((data.confidence || 1.0) * 100);
    reportConfidenceBadge.textContent = `${confPct}% Confidence`;
    
    const score = Math.round(data.health_score || 100);
    reportHealthScore.textContent = `${score}/100`;
    reportHealthCondition.textContent = data.condition || "Healthy";
    
    // Style health condition badge color class dynamically
    reportHealthCondition.className = "badge";
    const cond = (data.condition || "").toLowerCase();
    if (cond.includes('unhealthy')) {
      reportHealthCondition.classList.add('badge-yellow');
    } else if (cond.includes('diseased') || cond.includes('severe')) {
      reportHealthCondition.classList.add('badge-red');
    } else {
      reportHealthCondition.classList.add('badge-green');
    }
    
    // Split issues by comma and render as tags
    const diseases = (data.disease_detected || "None").split(',').map(d => d.trim()).filter(Boolean);
    reportDetectedDiseases.innerHTML = diseases.map(d => {
      const isOk = d.toLowerCase() === 'none';
      return `<span class="badge ${isOk ? 'badge-green' : 'badge-yellow'}"><i class="fa-solid ${isOk ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${d}</span>`;
    }).join('');
    
    // Parse recommendation details object safely
    let rec = {};
    try {
      rec = typeof data.recommendations === 'string' ? JSON.parse(data.recommendations) : data.recommendations;
    } catch (e) {
      rec = { summary: data.recommendations || "" };
    }
    
    reportSummary.textContent = rec.summary || "No diagnostic pathology notes provided.";
    reportCauses.textContent = rec.causes || "N/A";
    reportPrevention.textContent = rec.prevention || "N/A";
    
    const severity = (rec.severity || "Low").toUpperCase();
    reportSeverityLevel.textContent = severity;
    reportSeverityLevel.style.color = severity === 'HIGH' ? 'var(--red-400)' : (severity === 'MEDIUM' ? 'var(--yellow-500)' : 'var(--emerald-400)');
    
    // Treatment checklist items split by semicolon
    const treatments = (rec.treatment || "No treatment needed.").split(';').map(t => t.trim()).filter(Boolean);
    reportTreatment.innerHTML = treatments.map(t => `
      <div style="display: flex; align-items: start; gap: 8px; font-size: 0.85rem;">
        <i class="fa-solid fa-square-check text-teal-400" style="margin-top: 3px;"></i>
        <span>${t}</span>
      </div>
    `).join('');
  }

  // Reload history logs on click
  document.getElementById('btn-refresh-plant-history').addEventListener('click', loadPlantHistory);
  
  // Expose function to trigger report renders from table rows click actions
  window.viewPlantReportDetail = async (analysisId) => {
    try {
      const report = await apiRequest(`/plant/analysis/${analysisId}`);
      renderPlantAnalysisReport(report);
      
      // Auto scroll viewport up to view results
      document.getElementById('plant-diagnostic-result-card').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      showToast("Failed to fetch report details", true);
    }
  };
}

async function loadPlantHistory() {
  const tableBody = document.getElementById('plant-history-list-body');
  if (!tableBody) return;
  
  try {
    const list = await apiRequest('/plant/history');
    if (!list || !list.length) {
      tableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7" class="text-center text-muted" style="padding: 24px;">No diagnostic history available.</td>
        </tr>`;
      return;
    }
    
    tableBody.innerHTML = list.map(item => {
      // Parse dates nicely
      const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : "—";
      const confVal = Math.round((item.confidence || 1.0) * 100);
      const scoreVal = Math.round(item.health_score || 100);
      
      // Fetch dynamic badge color
      let badgeColor = "badge-green";
      const cond = (item.condition || "").toLowerCase();
      if (cond.includes('unhealthy')) badgeColor = "badge-yellow";
      if (cond.includes('diseased') || cond.includes('severe')) badgeColor = "badge-red";
      
      return `
        <tr>
          <td>
            <img src="${item.image_path}" alt="Diagnosed" style="width: 45px; height: 45px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-dim);">
          </td>
          <td>
            <div class="font-bold">${item.plant_name}</div>
            <div style="font-size: 0.725rem; font-style: italic; color: var(--text-muted);">${item.scientific_name || ""}</div>
          </td>
          <td>${confVal}%</td>
          <td>
            <span class="badge ${badgeColor}">${item.condition} (${scoreVal}/100)</span>
          </td>
          <td>
            <div style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.disease_detected}">
              ${item.disease_detected}
            </div>
          </td>
          <td class="text-secondary">${dateStr}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="viewPlantReportDetail(${item.id})">
              <i class="fa-solid fa-eye"></i> View
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn("Failed to load history list:", err);
  }
}

// Bind custom initialization hook
document.addEventListener('DOMContentLoaded', () => {
  initPlantHealthUI();
  
  // Load initial history when Plant Health tab is shown
  const tabBtn = document.querySelector('.sidebar-nav .nav-item[data-target="view-plant-health"]');
  if (tabBtn) {
    tabBtn.addEventListener('click', loadPlantHistory);
  }
});

