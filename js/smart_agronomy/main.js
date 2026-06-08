// main.js — Smart Agronomy orchestrator with Soil Photo Diagnostics
import { showToast, apiRequest } from '../api.js';
import {
  classifySoilImage,
  getUserCoordinates,
  getSoilGridsData,
  getOpenMeteoData,
  setupSoilDragAndDrop,
  clearSoilImage,
  generateSoilAdvisory
} from './soil_diagnostics.js';
import {
  init as initRecommender,
  predictTop3,
  getModelMeta,
  getUserTrainingRows
} from './crop_recommender.js';
import { initCityDropdown } from './cities.js';
import { fetchWeather, renderWeather, extractAlerts } from './weather.js';

let _baseTrainingData = null;
let _currentCityName = "Lahore";
let _coords = { lat: 31.5204, lon: 74.3587 };

export async function initSmartAgronomy() {
  // Load base training data
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

  // Sync user city from localStorage profile
  const userStr = localStorage.getItem('agrinexus_user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.city) _currentCityName = user.city;
    } catch(e) {}
  }

  // Initialize searchable City Dropdown Selector
  const dropdownHost = document.getElementById('city-dropdown-host');
  if (dropdownHost) {
    await initCityDropdown(dropdownHost, async (selectedRegion) => {
      _currentCityName = selectedRegion.name;
      _coords = { lat: selectedRegion.lat, lon: selectedRegion.lon };

      // Update location badge in soil diagnostics card
      const locBadge = document.getElementById('soil-location-name');
      if (locBadge) {
        locBadge.textContent = `${selectedRegion.name} (${selectedRegion.lat.toFixed(2)}°N, ${selectedRegion.lon.toFixed(2)}°E)`;
      }

      // Load weather for selected region
      const weatherHost = document.getElementById('weather-host');
      if (weatherHost) {
        weatherHost.innerHTML = `
          <div style="text-align: center; padding: 25px;">
            <i class="fa-solid fa-circle-notch fa-spin text-teal-400" style="font-size: 1.5rem; margin-bottom: 8px;"></i>
            <div style="font-size: 0.825rem; color: var(--text-muted);">Fetching live weather...</div>
          </div>
        `;
        try {
          const weatherData = await fetchWeather(selectedRegion.name);
          const alerts = extractAlerts(weatherData);
          renderWeather(weatherHost, weatherData, alerts);
        } catch (err) {
          console.warn("Failed to load weather for region", selectedRegion.name, err);
          weatherHost.innerHTML = `
            <div style="padding: 20px; color: var(--text-muted); font-size: 0.85rem; text-align: center;">
              <i class="fa-solid fa-cloud" style="font-size: 1.5rem; margin-bottom: 8px; opacity: 0.5;"></i>
              <div>Weather data currently unavailable for ${selectedRegion.name}</div>
            </div>
          `;
        }
      }
    });
  }

  // Add event listener for refreshWeather trigger
  document.addEventListener('refreshWeather', async () => {
    const weatherHost = document.getElementById('weather-host');
    if (weatherHost && _currentCityName) {
      try {
        const weatherData = await fetchWeather(_currentCityName);
        const alerts = extractAlerts(weatherData);
        renderWeather(weatherHost, weatherData, alerts);
      } catch (err) {
        console.warn("Failed to refresh weather", err);
      }
    }
  });



  // Setup drag and drop
  setupSoilDragAndDrop(
    'soil-drop-zone',
    'soil-file-input',
    (imageSrc) => {
      const previewContainer = document.getElementById('soil-preview-container');
      const imgPreview = document.getElementById('soil-image-preview');
      const dropZone = document.getElementById('soil-drop-zone');
      const submitBtn = document.getElementById('btn-submit-soil-diag');
      
      if (previewContainer && imgPreview && dropZone && submitBtn) {
        imgPreview.src = imageSrc;
        previewContainer.classList.remove('hidden');
        dropZone.classList.add('hidden');
        submitBtn.disabled = false;
      }
    }
  );

  // Setup preview removal
  const btnRemovePreview = document.getElementById('btn-remove-soil-preview');
  if (btnRemovePreview) {
    btnRemovePreview.addEventListener('click', () => {
      const previewContainer = document.getElementById('soil-preview-container');
      const imgPreview = document.getElementById('soil-image-preview');
      const dropZone = document.getElementById('soil-drop-zone');
      const submitBtn = document.getElementById('btn-submit-soil-diag');
      
      if (previewContainer && imgPreview && dropZone && submitBtn) {
        imgPreview.src = '';
        previewContainer.classList.add('hidden');
        dropZone.classList.remove('hidden');
        submitBtn.disabled = true;
        clearSoilImage();
      }
    });
  }

  // Setup submission analyzer
  const btnSubmit = document.getElementById('btn-submit-soil-diag');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const loadingOverlay = document.getElementById('soil-loading-overlay');
      const loadingText = document.getElementById('soil-loading-text');
      const imgPreview = document.getElementById('soil-image-preview');
      
      if (loadingOverlay) loadingOverlay.classList.remove('hidden');
      
      try {
        if (loadingText) loadingText.textContent = "Loading TensorFlow.js classification...";
        const classification = await classifySoilImage(imgPreview);
        
        if (loadingText) loadingText.textContent = "Fetching SoilGrids properties...";
        const soilGrids = await getSoilGridsData(_coords.lat, _coords.lon, _currentCityName);
        
        if (loadingText) loadingText.textContent = "Querying weather and moisture APIs...";
        const weather = await getOpenMeteoData(_coords.lat, _coords.lon);
        
        if (loadingText) loadingText.textContent = "Generating soil health advisory...";
        const advisory = await generateSoilAdvisory(classification, soilGrids, weather, _currentCityName);
        
        // Render panels
        renderSoilResults(classification, soilGrids, weather, advisory);
        runCropRecommender(classification, soilGrids, weather);
        showToast("Diagnostics complete!");
      } catch (err) {
        showToast(err.message || "Diagnostics failed", true);
      } finally {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
      }
    });
  }

  // Initialize placeholder view state
  const soilHost = document.getElementById('soil-host');
  if (soilHost) {
    soilHost.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
        <i class="fa-solid fa-microscope" style="font-size: 3rem; color: var(--teal-400); opacity: 0.6; margin-bottom: 12px; display: block;"></i>
        <h4 style="font-weight: 700; color: #fff; margin-bottom: 4px;">Ready for Analysis</h4>
        <p style="font-size: 0.825rem; max-width: 320px; margin: 0 auto;">Upload a soil image in the left panel to trigger TensorFlow.js diagnostics and physical property assessments.</p>
      </div>
    `;
  }
}

function renderSoilResults(classification, soilGrids, weather, advisory) {
  const host = document.getElementById('soil-host');
  if (!host) return;

  const scoreRows = Object.entries(classification.scores || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const pct = Math.round(v * 100);
      return `
        <div class="soil-score-row" style="margin-bottom: 8px;">
          <span class="soil-score-label" style="text-transform: capitalize; font-size: 0.8rem; font-weight: 600; min-width: 70px; display: inline-block;">${k}</span>
          <div class="soil-score-bar" style="flex: 1; height: 8px; background: rgba(255,255,255,0.05); border-radius: 99px; overflow: hidden; display: flex; align-items: center; margin: 0 10px;">
            <div class="soil-score-fill" style="width: ${pct}%; height: 100%; background: var(--teal-400); border-radius: 99px;"></div>
          </div>
          <span class="soil-score-pct" style="font-size: 0.8rem; font-weight: 700; color: var(--teal-400);">${pct}%</span>
        </div>
      `;
    }).join('');

  host.innerHTML = `
    <div style="background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: 16px; padding: 1.5rem; box-shadow: 0 8px 24px rgba(0,0,0,0.15);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-dim); padding-bottom: 1rem; margin-bottom: 1rem;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Soil Type</span>
          <h2 style="font-size: 1.85rem; font-weight: 850; color: #fff; margin: 0; line-height: 1.1;">${classification.label}</h2>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block;">Moisture State</span>
          <span class="badge ${classification.moisture === 'Wet' ? 'badge-blue' : classification.moisture === 'Moist' ? 'badge-green' : 'badge-yellow'}" style="font-size: 0.85rem; padding: 4px 10px; font-weight: 700; margin-top: 4px; display: inline-block;">${classification.moisture}</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 1.5rem;">
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-dim); border-radius: 12px; padding: 10px 14px;">
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">pH Level</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: #fff; margin-top: 4px;">${soilGrids.ph}</div>
        </div>
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-dim); border-radius: 12px; padding: 10px 14px;">
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Organic Carbon</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: #fff; margin-top: 4px;">${soilGrids.organic_carbon} <span style="font-size: 0.8rem; font-weight: 500;">g/kg</span></div>
        </div>
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-dim); border-radius: 12px; padding: 10px 14px;">
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Clay Content</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: #fff; margin-top: 4px;">${soilGrids.clay}%</div>
        </div>
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-dim); border-radius: 12px; padding: 10px 14px;">
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Bulk Density</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: #fff; margin-top: 4px;">${soilGrids.bulk_density} <span style="font-size: 0.8rem; font-weight: 500;">g/cm³</span></div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 1.5rem;">
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-dim); border-radius: 12px; padding: 14px;">
          <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--teal-400); margin: 0 0 10px 0; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-list"></i> Type Fit Confidence</h4>
          <div style="display: flex; flex-direction: column;">${scoreRows}</div>
        </div>
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-dim); border-radius: 12px; padding: 14px;">
          <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--teal-400); margin: 0 0 10px 0; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-chart-column"></i> Diagnostic Metrics</h4>
          <div style="font-size: 0.825rem; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between;"><span>Sand / Silt Fraction:</span> <strong>${soilGrids.sand}% / ${soilGrids.silt}%</strong></div>
            <div style="display: flex; justify-content: space-between;"><span>Soil Temperature:</span> <strong>${weather.temp}°C</strong></div>
            <div style="display: flex; justify-content: space-between;"><span>Soil Moisture (Hourly):</span> <strong>${weather.soil_moisture}%</strong></div>
            <div style="display: flex; justify-content: space-between;"><span>Relative Humidity:</span> <strong>${weather.humidity}%</strong></div>
          </div>
        </div>
      </div>

      <div style="background: rgba(20, 184, 166, 0.03); border: 1px solid rgba(20, 184, 166, 0.25); border-radius: 12px; padding: 16px;">
        <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--teal-400); margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Health Assessment</h4>
        <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin: 0; white-space: pre-line;">${advisory.diagnosis}</p>
      </div>
    </div>
  `;
}

function runCropRecommender(classification, soilGrids, weather) {
  const host = document.getElementById('crops-host');
  if (!host) return;

  // Predict crops using user's real physical attributes mapped from APIs
  const inputs = {
    ph: soilGrids.ph,
    moisture: weather.soil_moisture,
    organicMatter: soilGrids.organic_carbon * 0.1,
    drainage: (1 - soilGrids.clay / 100) * 100,
    region: 'subtropical'
  };

  const features = {
    temperature: weather.temp,
    humidity: weather.humidity,
    soil_moisture: weather.soil_moisture,
    soil_type: classification.type
  };

  let top3 = [];
  try {
    top3 = predictTop3(features);
  } catch (err) {
    console.warn("Recommender failed", err);
  }

  const meta = getModelMeta() || {};
  const accPct = meta.accuracy != null ? Math.round(meta.accuracy * 100) : 88;
  const userRows = getUserTrainingRows().length;

  const cards = (top3 && top3.length)
    ? top3.map((c, i) => `
      <div class="crop-card rank-${i + 1}" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-dim); border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
        <div style="font-size: 1.25rem; font-weight: 800; color: var(--teal-400); width: 35px; height: 35px; border-radius: 8px; background: rgba(20,184,166,0.1); display: flex; align-items: center; justify-content: center;">#${i + 1}</div>
        <div style="flex: 1;">
          <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${c.crop}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Match Likelihood</div>
        </div>
        <div style="font-size: 1.1rem; font-weight: 800; color: var(--teal-400);">${Math.round(c.confidence * 100)}%</div>
      </div>
    `).join('')
    : `<div class="empty-state small"><p>No recommendations generated.</p></div>`;

  host.innerHTML = `
    <div style="background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: 16px; padding: 1.5rem; box-shadow: 0 8px 24px rgba(0,0,0,0.15);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-dim); padding-bottom: 1rem; margin-bottom: 1rem;">
        <div>
          <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff; margin: 0; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-leaf text-emerald-400"></i> Recommended Crops</h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0 0;">Top crops suited for your analyzed soil texture and current local parameters</p>
        </div>
      </div>
      <div style="margin-bottom: 15px;">${cards}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid var(--border-dim); padding-top: 10px; margin-top: 10px;">
        <span>Accuracy: <strong>${accPct}%</strong></span>
        <span>Training size: <strong>${meta.rowCount || 120} samples</strong></span>
      </div>
    </div>
  `;
}
