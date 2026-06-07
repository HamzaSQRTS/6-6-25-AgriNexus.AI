// weather.js — fetch live weather, auto-refresh, render cards and alerts.

import { apiRequest } from '../api.js';

let _refreshTimer = null;
let _currentCityId = null;

/** Pull weather for `city` from our backend proxy. Returns the normalised payload
 *  or throws with a user-friendly message. */
export async function fetchWeather(city) {
  if (!city) throw new Error('City is required');
  return apiRequest(`/weather?city=${encodeURIComponent(city)}`);
}

/** Derive alerts from a normalised weather payload. */
export function extractAlerts(payload) {
  const alerts = [];
  const t  = Number(payload.temperature);
  const ws = Number(payload.windSpeed);
  const rf = Number(payload.rainfall);

  if (!isNaN(t) && t < 2) {
    alerts.push({ level: 'danger',  type: 'frost',  message: `Frost risk: temperature is ${t.toFixed(1)}°C. Cover sensitive crops and consider frost blankets.` });
  } else if (!isNaN(t) && t > 38) {
    alerts.push({ level: 'danger',  type: 'heat',   message: `Heatwave: ${t.toFixed(1)}°C. Increase irrigation frequency and apply mulch.` });
  } else if (!isNaN(t) && t > 33) {
    alerts.push({ level: 'warning', type: 'heat',   message: `Hot conditions (${t.toFixed(1)}°C). Prefer drought-tolerant varieties and water early morning or late evening.` });
  }
  if (!isNaN(rf) && rf > 15) {
    alerts.push({ level: 'danger',  type: 'rain',   message: `Heavy rain: ${rf.toFixed(1)} mm/h in the last hour. Delay fertilizer application; check field drainage.` });
  } else if (!isNaN(rf) && rf > 5) {
    alerts.push({ level: 'warning', type: 'rain',   message: `Steady rain: ${rf.toFixed(1)} mm/h. Postpone pesticide spraying.` });
  }
  if (!isNaN(ws) && ws > 12) {
    alerts.push({ level: 'danger',  type: 'wind',   message: `Strong wind: ${ws.toFixed(1)} m/s. Stake young plants; postpone spraying.` });
  } else if (!isNaN(ws) && ws > 8) {
    alerts.push({ level: 'warning', type: 'wind',   message: `Gusty wind: ${ws.toFixed(1)} m/s.` });
  }
  return alerts;
}

/** Map the OpenWeatherMap condition string to a Font Awesome icon. */
function conditionIcon(condition) {
  const c = (condition || '').toLowerCase();
  if (c.includes('thunder')) return 'fa-bolt';
  if (c.includes('rain') || c.includes('drizzle')) return 'fa-cloud-showers-heavy';
  if (c.includes('snow'))    return 'fa-snowflake';
  if (c.includes('clear'))   return 'fa-sun';
  if (c.includes('cloud'))   return 'fa-cloud';
  if (c.includes('mist') || c.includes('fog') || c.includes('haze')) return 'fa-smog';
  return 'fa-cloud-sun';
}

/** Render the weather panel (5 stat cards + last-updated timestamp + alerts).
 *  host: HTMLElement, payload: normalised weather object, alerts: array. */
export function renderWeather(host, payload, alerts) {
  if (!host) return;
  if (!payload) {
    host.innerHTML = `<div class="empty-state small"><i class="fa-solid fa-cloud-bolt icon text-muted"></i><p>Weather unavailable.</p></div>`;
    return;
  }
  const iconClass = conditionIcon(payload.condition);
  const updated = new Date((payload.rawTimestamp || Date.now() / 1000) * 1000);

  const alertHtml = (alerts && alerts.length)
    ? `<div class="weather-alerts">${alerts.map((a) => `
        <div class="weather-alert ${a.level === 'danger' ? 'is-danger' : 'is-warning'}">
          <i class="fa-solid ${a.level === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i>
          <span>${a.message}</span>
        </div>`).join('')}</div>`
    : '';

  const card = (icon, value, label) => `
    <div class="weather-card">
      <div class="weather-card-icon"><i class="fa-solid ${icon}"></i></div>
      <div class="weather-card-value">${value}</div>
      <div class="weather-card-label">${label}</div>
    </div>`;

  host.innerHTML = `
    <div class="weather-header">
      <div class="weather-cond">
        <i class="fa-solid ${iconClass} weather-cond-icon"></i>
        <div>
          <div class="weather-cond-text">${payload.condition || '—'}</div>
          <div class="weather-cond-sub text-muted text-sm">${payload.description || ''}</div>
        </div>
      </div>
      <div class="weather-updated text-sm text-muted">
        Last updated: <span id="weather-updated-ts">${updated.toLocaleTimeString()}</span>
        <button class="btn btn-ghost btn-icon btn-refresh" id="btn-refresh-weather" title="Refresh now">
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
      </div>
    </div>
    ${alertHtml}
    <div class="weather-grid">
      ${card('fa-temperature-half',   `${Number(payload.temperature).toFixed(1)}°C`, 'Temperature')}
      ${card('fa-droplet',            `${payload.humidity ?? '—'}%`,               'Humidity')}
      ${card('fa-cloud-rain',         `${Number(payload.rainfall || 0).toFixed(1)} mm`, 'Rainfall (1h)')}
      ${card('fa-wind',               `${Number(payload.windSpeed).toFixed(1)} m/s`, 'Wind')}
      ${card('fa-sun',                `${payload.uvIndex != null ? Number(payload.uvIndex).toFixed(1) : '—'}`, 'UV Index')}
    </div>
  `;

  const refreshBtn = host.querySelector('#btn-refresh-weather');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (_currentCityId) {
        document.dispatchEvent(new CustomEvent('refreshWeather', { detail: { cityId: _currentCityId } }));
      }
    });
  }
}

/** Start (or restart) the auto-refresh loop. */
export function startAutoRefresh(cityId, intervalMs = 600000) {
  stopAutoRefresh();
  _currentCityId = cityId;
  if (!cityId) return;
  _refreshTimer = setInterval(() => {
    document.dispatchEvent(new CustomEvent('refreshWeather', { detail: { cityId } }));
  }, intervalMs);
}

/** Stop the auto-refresh loop. */
export function stopAutoRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
  _currentCityId = null;
}

export const __test = { extractAlerts, conditionIcon };
