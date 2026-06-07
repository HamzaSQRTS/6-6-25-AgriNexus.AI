// main.js — Smart Agronomy orchestrator.
//
// Wires up the four features so they actually drive each other:
//   city change -> fetch weather -> classify soil -> predict crops -> render
//
//   - City change: handled via a `cityChange` event fired by cities.js
//   - Manual soil input edits: also re-classify + re-predict
//   - "Train Model" button: appends the current sample to the training set
//     and retrains, so the user can fold their own field into the model
//   - "Refresh now" button on the weather panel: re-fetches immediately
//
// All errors are surfaced via the existing showToast helper from api.js.

import { showToast } from '../api.js';
import { initCityDropdown, getAllRegions } from './cities.js';
import {
  fetchWeather, renderWeather, startAutoRefresh,
  extractAlerts
} from './weather.js';
import { classifySoil } from './soil_classifier.js';
import { renderSoilRadar } from './soil_chart.js';
import {
  init as initRecommender, predictTop3,
  addTrainingRow, getModelMeta, getUserTrainingRows
} from './crop_recommender.js';

const REFRESH_INTERVAL_MS = 600000;     // 10 minutes
const DEV_REFRESH_INTERVAL_MS = 30000;  // for local testing; pass ?dev=1

let _baseTrainingData = null;
let _lastWeather = null;
let _lastAlerts  = [];
let _lastSoil    = null;
let _lastRegion  = null;

/** Initialise the Smart Agronomy view. */
export async function initSmartAgronomy() {
  // 1. Load the base training data and bootstrap the ML model.
  try {
    const res = await fetch('data/crop_training_data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _baseTrainingData = await res.json();
  } catch (e) {
    console.error('[agronomy] failed to load crop training data', e);
    showToast('Failed to load crop training data', true);
    return;
  }
  initRecommender(_baseTrainingData);

  // 2. Wire up the city dropdown. Its first invocation will dispatch a
  //    `cityChange` event which we listen to below.
  await initCityDropdown(document.getElementById('city-dropdown-host'));

  // 3. Single listener for city changes (handles both the initial dispatch
  //    from initCityDropdown and any subsequent user selection).
  document.addEventListener('cityChange', async (e) => {
    const region = e.detail;
    if (!region) return;
    _lastRegion = region;
    
    // Write soil inputs from region tendencies
    writeSoilInputsFromRegion(region);
    
    // Fetch weather dynamically for the selected district
    await refreshWeatherFor(region);
    
    // Start/restart auto-refresh for this specific district
    const dev = new URLSearchParams(location.search).get('dev') === '1';
    startAutoRefresh(region.name, dev ? DEV_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS);
    
    // Execute soil and crop recommendations pipeline
    runPipeline();
  });

  // 4. Listen for explicit "refresh now" requests from the weather panel.
  document.addEventListener('refreshWeather', () => {
    if (_lastRegion) refreshWeatherFor(_lastRegion);
  });

  // 5. Wire up the soil input form.
  document.addEventListener('cityChange', () => {
    // Sync ranges on city changes
    const resetBadges = document.getElementById('btn-reset-soil');
    if (resetBadges) resetBadges.dispatchEvent(new Event('click'));
  });
  wireSoilInputs();

  // 6. Quick-pick city buttons (if present).
  document.querySelectorAll('[data-quick-city]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.quickCity;
      import('./cities.js').then((m) => m.selectCity(id));
    });
  });
}

async function refreshWeatherFor(region) {
  const host = document.getElementById('weather-host');
  if (!host) return;
  try {
    const payload = await fetchWeather(region.name);
    _lastWeather = payload;
    _lastAlerts  = extractAlerts(payload);
    renderWeather(host, payload, _lastAlerts);
  } catch (e) {
    _lastWeather = null;
    _lastAlerts  = [];
    renderWeather(host, null, []);
    const msg = (e && e.message) || 'Weather fetch failed';
    showToast(`Weather: ${msg}`, true);
  }
}

async function runPipeline() {
  if (!_lastRegion) return;
  
  // Render district crop statistics (from official Pakistan Crops Area & Production PDF dataset)
  renderDistrictStats(_lastRegion);

  const inputs = readSoilInputs();
  inputs.region = _lastRegion.climate_band;

  // 1. Classify soil.
  let soil;
  try {
    soil = await classifySoil(inputs);
  } catch (e) {
    showToast('Soil classification failed', true);
    return;
  }
  _lastSoil = soil;
  renderSoilPanel(soil);

  // 2. Predict top-3 crops (weather + soil → ML features).
  const features = buildRecommenderFeatures(inputs, soil);
  let top3 = [];
  try {
    top3 = predictTop3(features);
  } catch (e) {
    showToast('Crop recommendation failed', true);
  }
  renderCropsPanel(top3, features, _lastAlerts);
}

function renderDistrictStats(region) {
  const card = document.getElementById('district-stats-card');
  const host = document.getElementById('district-stats-host');
  if (!card || !host) return;

  if (!region || !region.crops_production) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  const rows = Object.entries(region.crops_production).map(([crop, data]) => {
    const area = data.area_ha.toLocaleString();
    const prod = data.prod_tons.toLocaleString();
    return `
      <tr>
        <td class="font-bold text-sm" style="padding: 10px 12px; border-bottom: 1px solid var(--border-dim); text-align: left;">
          <i class="fa-solid fa-seedling text-teal-400 mr-2"></i> ${crop}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-dim); text-align: right; color: var(--text-secondary);">${area} ha</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-dim); text-align: right; color: var(--teal-400); font-weight: 700;">${prod} Tons</td>
      </tr>
    `;
  }).join('');

  host.innerHTML = `
    <div style="font-size: 0.825rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
      Official government crop statistics (Economic Wing, Ministry of National Food Security & Research, Pakistan) for <strong>${region.name} District</strong> (2022-23).
    </div>
    <div style="overflow-x: auto; width: 100%; border: 1px solid var(--border-dim); border-radius: 8px;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: rgba(255, 255, 255, 0.03);">
            <th style="padding: 10px 12px; text-align: left; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Crop Type</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Cultivated Area</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Annual Production</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function buildRecommenderFeatures(soilInputs, soilResult) {
  return {
    temperature:    Number.isFinite(_lastWeather?.temperature) ? _lastWeather.temperature : 25,
    humidity:       Number.isFinite(_lastWeather?.humidity)    ? _lastWeather.humidity    : 60,
    rainfall:       Number.isFinite(_lastWeather?.rainfall)    ? _lastWeather.rainfall    : 80,
    soil_ph:        Number(soilInputs.ph),
    soil_moisture:  Number(soilInputs.moisture),
    organic_matter: Number(soilInputs.organicMatter),
    drainage:       Number(soilInputs.drainage),
    soil_type:      soilResult?.type || 'loamy',
    region:         soilInputs.region || 'subtropical'
  };
}

function renderSoilPanel(soil) {
  const host = document.getElementById('soil-host');
  if (!host) return;
  const props = soil.properties || {};
  const fert  = soil.fertilizer || {};
  const irrig = soil.irrigation || {};
  const confPct = Math.round(soil.confidence * 100);
  const scoreRows = Object.entries(soil.scores || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const max = Math.max(...Object.values(soil.scores)) || 1;
      const pct = Math.round((v / max) * 100);
      return `<div class="soil-score-row">
        <span class="soil-score-label">${k}</span>
        <div class="soil-score-bar"><div class="soil-score-fill" style="width:${pct}%"></div></div>
        <span class="soil-score-pct text-sm text-muted">${pct}%</span>
      </div>`;
    }).join('');

  const conds = _lastRegion?.soil_conditions;
  const rawStatsHtml = conds ? `
    <div class="soil-card" style="grid-column: span 2; background: rgba(20, 184, 166, 0.03); border: 1px solid rgba(20, 184, 166, 0.15); margin-bottom: 1rem;">
      <h4 class="soil-section-title" style="color: var(--teal-400);"><i class="fa-solid fa-circle-info text-teal-400"></i> Government Survey Soil Records</h4>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 0.8rem; line-height: 1.4; text-align: left;">
        <div><strong>Survey pH:</strong> <div style="color: var(--text-secondary); margin-top: 2px;">${conds.ph} (${conds.ph >= 8.0 ? 'Alkaline' : 'Neutral/Acidic'})</div></div>
        <div><strong>Organic Matter:</strong> <div style="color: var(--text-secondary); margin-top: 2px;">${conds.raw_om || conds.organicMatter + '%'}</div></div>
        <div><strong>Moisture State:</strong> <div style="color: var(--text-secondary); margin-top: 2px;">${conds.raw_moisture || 'Moderate'}</div></div>
        <div><strong>Drainage Profile:</strong> <div style="color: var(--text-secondary); margin-top: 2px;">${conds.raw_drainage || 'Well-drained'}</div></div>
      </div>
    </div>
  ` : '';

  host.innerHTML = `
    <div class="soil-header">
      <div>
        <div class="soil-type-label">Detected soil type</div>
        <div class="soil-type-name">${soil.label}</div>
      </div>
      <div class="text-sm text-muted">Based on pH, moisture, organic matter &amp; drainage</div>
    </div>
    <div class="soil-grid">
      ${rawStatsHtml}
      <div class="soil-card">
        <h4 class="soil-section-title"><i class="fa-solid fa-seedling text-emerald-400"></i> Best crops</h4>
        <div class="soil-chips">${(soil.bestCrops || []).map((c) => `<span class="chip chip-green">${c}</span>`).join('')}</div>
      </div>
      <div class="soil-card">
        <h4 class="soil-section-title"><i class="fa-solid fa-flask text-purple-500"></i> Fertilizer guidance</h4>
        <p class="soil-text"><strong>Type:</strong> ${fert.type || '—'}</p>
        <p class="soil-text"><strong>Schedule:</strong> ${fert.schedule || '—'}</p>
        <p class="soil-text text-muted text-sm">${fert.notes || ''}</p>
      </div>
      <div class="soil-card">
        <h4 class="soil-section-title"><i class="fa-solid fa-droplet text-blue-500"></i> Irrigation</h4>
        <p class="soil-text"><strong>Method:</strong> ${irrig.method || '—'}</p>
        <p class="soil-text"><strong>Frequency:</strong> ${irrig.frequency || '—'}</p>
        <p class="soil-text"><strong>Depth:</strong> ${irrig.depth_mm ? irrig.depth_mm + ' mm' : '—'}</p>
      </div>
      <div class="soil-card">
        <h4 class="soil-section-title"><i class="fa-solid fa-mountain text-orange-500"></i> Properties</h4>
        <p class="soil-text"><strong>Texture:</strong> ${props.texture || '—'}</p>
        <p class="soil-text"><strong>Water retention:</strong> ${props.water_retention || '—'}</p>
        <p class="soil-text"><strong>Aeration:</strong> ${props.aeration || '—'}</p>
        <p class="soil-text"><strong>Nutrient holding:</strong> ${props.nutrient_holding || '—'}</p>
      </div>
    </div>
    <div class="soil-charts">
      <div class="chart-card">
        <div class="chart-header"><h4 class="chart-title">Soil profile radar</h4></div>
        <div class="chart-container-wrapper"><canvas id="soilRadar"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h4 class="chart-title">Type fit scores</h4></div>
        <div class="soil-score-list">${scoreRows}</div>
      </div>
    </div>
  `;

  const radarCanvas = document.getElementById('soilRadar');
  if (radarCanvas && soil.compositionRadar) {
    renderSoilRadar(radarCanvas, soil.compositionRadar);
  }
}

function renderCropsPanel(top3, features, alerts) {
  const host = document.getElementById('crops-host');
  if (!host) return;
  const meta = getModelMeta() || {};
  const accPct = meta.accuracy != null ? Math.round(meta.accuracy * 100) : null;
  const trainedAt = meta.trainedAt ? new Date(meta.trainedAt).toLocaleString() : '—';
  const userRows = getUserTrainingRows().length;

  const alertNotes = (alerts || []).map((a) => `<li class="crop-alert-item ${a.level === 'danger' ? 'is-danger' : 'is-warning'}">
    <i class="fa-solid ${a.level === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i> ${a.message}
  </li>`).join('');

  const cards = (top3 && top3.length)
    ? top3.map((c, i) => `
      <div class="crop-card rank-${i + 1}">
        <div class="crop-rank">#${i + 1}</div>
        <div class="crop-name">${c.crop}</div>
        <div class="crop-confidence">
          <div class="crop-conf-bar"><div class="crop-conf-fill" style="width:${Math.round(c.confidence * 100)}%"></div></div>
          <div class="crop-conf-pct">${Math.round(c.confidence * 100)}%</div>
        </div>
      </div>`).join('')
    : `<div class="empty-state small"><i class="fa-solid fa-brain icon text-muted"></i><p>No recommendation available. Train the model first.</p></div>`;

  host.innerHTML = `
    <div class="crops-header">
      <div>
        <h3 class="crops-title"><i class="fa-solid fa-brain text-emerald-400"></i> ML Crop Recommendations</h3>
        <p class="text-muted text-sm">Top 3 crops for the current conditions, ranked by decision-tree confidence.</p>
      </div>
      <div class="crops-meta">
        <span class="badge ${accPct != null && accPct >= 70 ? 'badge-green' : 'badge-yellow'}">
          <i class="fa-solid fa-bullseye"></i>
          Model accuracy: ${accPct != null ? accPct + '%' : '—'}
        </span>
        <span class="badge badge-blue"><i class="fa-solid fa-database"></i> ${meta.rowCount || _baseTrainingData.length} training rows${userRows ? ' (+' + userRows + ' user)' : ''}</span>
        <span class="text-sm text-muted">Trained: ${trainedAt}</span>
        <button class="btn btn-sm btn-primary" id="btn-train-model"><i class="fa-solid fa-rotate"></i> Train Model</button>
      </div>
    </div>
    ${alertNotes ? `<div class="crop-alerts"><ul>${alertNotes}</ul></div>` : ''}
    <div class="crops-grid">${cards}</div>
  `;
  // Re-bind the Train button (innerHTML replacement wipes its handler).
  const btnTrain = document.getElementById('btn-train-model');
  if (btnTrain) btnTrain.addEventListener('click', () => retrainWithCurrentSample());
}

function retrainWithCurrentSample() {
  if (!_lastRegion || !_lastSoil) {
    showToast('Select a city first.', true);
    return;
  }
  // Fold the current (city, soil, weather) point into the training set,
  // labelled with the current top-1 prediction (closed-loop retraining).
  let top1;
  try {
    top1 = (predictTop3(buildRecommenderFeatures(readSoilInputs(), _lastSoil)) || [])[0];
  } catch (e) { /* ignore */ }
  if (!top1) {
    showToast('No prediction available to train on.', true);
    return;
  }
  const newRow = {
    temperature: _lastWeather?.temperature ?? 25,
    humidity:    _lastWeather?.humidity ?? 60,
    rainfall:    _lastWeather?.rainfall ?? 80,
    soil_ph:     readSoilInputs().ph,
    soil_type:   _lastSoil.type,
    region:      _lastRegion.climate_band,
    crop:        top1.crop
  };
  try {
    addTrainingRow(newRow);
    showToast(`Model retrained. New sample labelled as ${top1.crop}.`, false);
  } catch (e) {
    showToast('Retraining failed: ' + (e.message || e), true);
    return;
  }
  // Re-render crops panel with updated accuracy.
  runPipeline();
}

function readSoilInputs() {
  return {
    ph:             Number(document.getElementById('soil-ph')?.value ?? 6.5),
    moisture:       Number(document.getElementById('soil-moisture')?.value ?? 35),
    organicMatter:  Number(document.getElementById('soil-om')?.value ?? 3.0),
    drainage:       Number(document.getElementById('soil-drainage')?.value ?? 50)
  };
}

function writeSoilInputsFromRegion(region) {
  let ph = 6.5, moisture = 40, organicMatter = 3.0, drainage = 50;
  
  if (region.soil_conditions) {
    ph = region.soil_conditions.ph;
    moisture = region.soil_conditions.moisture;
    organicMatter = region.soil_conditions.organicMatter;
    drainage = region.soil_conditions.drainage;
  } else {
    // Sensible defaults from the region's typical soil + climate.
    const defaults = {
      tropical:     { ph: 6.0, moisture: 55, organicMatter: 3.5, drainage: 35 },
      subtropical:  { ph: 6.5, moisture: 40, organicMatter: 3.0, drainage: 50 },
      arid:         { ph: 7.2, moisture: 18, organicMatter: 1.5, drainage: 75 },
      temperate:    { ph: 6.6, moisture: 40, organicMatter: 3.5, drainage: 55 },
      continental:  { ph: 6.8, moisture: 30, organicMatter: 2.5, drainage: 60 },
      mediterranean:{ ph: 7.6, moisture: 25, organicMatter: 2.0, drainage: 70 }
    };
    const d = defaults[region.climate_band] || defaults.subtropical;
    ph = d.ph;
    moisture = d.moisture;
    organicMatter = d.organicMatter;
    drainage = d.drainage;
  }

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('soil-ph', ph);
  set('soil-moisture', moisture);
  set('soil-om', organicMatter);
  set('soil-drainage', drainage);
}

function wireSoilInputs() {
  ['soil-ph','soil-moisture','soil-om','soil-drainage'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (_lastRegion) runPipeline();
    });
  });
  const resetBtn = document.getElementById('btn-reset-soil');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!_lastRegion) return;
      writeSoilInputsFromRegion(_lastRegion);
      runPipeline();
    });
  }
}
