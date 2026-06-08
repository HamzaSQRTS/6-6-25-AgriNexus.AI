// cities.js — searchable city/region dropdown component.
// Loads data/regions.json, renders a custom dropdown with a built-in search
// input, persists the user's last choice in localStorage, and fires a
// `cityChange` CustomEvent on the document whenever the selection changes.

const STORAGE_KEY = 'agrinexus_selected_city';

let _regions = null;
let _selectedId = null;
let _onChange = null;

/** Load region metadata. */
async function loadRegions() {
  if (_regions) return _regions;
  try {
    const res = await fetch('data/regions.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _regions = await res.json();
  } catch (e) {
    console.error('[cities] failed to load regions.json', e);
    _regions = [];
  }
  return _regions;
}

/** Read the persisted city, or pick the first region. */
function readPersisted(regions) {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && regions.some((r) => r.id === id)) return id;

    // Default to the logged-in user's city if nothing is persisted yet
    const userStr = localStorage.getItem('agrinexus_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user && user.city) {
        const found = regions.find(r => r.name.toLowerCase() === user.city.toLowerCase() || r.id.toLowerCase() === user.city.toLowerCase());
        if (found) return found.id;
      }
    }
  } catch (e) { /* localStorage may be disabled */ }
  return regions[0]?.id || null;
}

/** Initialise the dropdown into a host element.
 *  onChange: (regionObject) => void */
export async function initCityDropdown(host, onChange) {
  _onChange = onChange;
  const regions = await loadRegions();
  if (!regions.length) {
    host.innerHTML = '<div class="text-muted text-sm">No regions available.</div>';
    return;
  }
  _selectedId = readPersisted(regions);

  host.innerHTML = `
    <div class="city-dropdown" id="city-dropdown">
      <button class="city-trigger" id="city-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <i class="fa-solid fa-location-dot text-emerald-400"></i>
        <span class="city-trigger-label" id="city-trigger-label"></span>
        <i class="fa-solid fa-chevron-down city-chevron"></i>
      </button>
      <div class="city-panel" id="city-panel" role="listbox" hidden>
        <div class="city-search-wrap">
          <i class="fa-solid fa-magnifying-glass city-search-icon"></i>
          <input type="text" class="city-search" id="city-search" placeholder="Search city, country, or climate..." />
        </div>
        <ul class="city-list" id="city-list" role="presentation"></ul>
        <div class="city-empty hidden" id="city-empty">No matches.</div>
      </div>
    </div>
  `;

  const trigger = host.querySelector('#city-trigger');
  const panel   = host.querySelector('#city-panel');
  const search  = host.querySelector('#city-search');
  const list    = host.querySelector('#city-list');
  const empty   = host.querySelector('#city-empty');
  const label   = host.querySelector('#city-trigger-label');

  const renderLabel = (id) => {
    const r = regions.find((x) => x.id === id);
    if (!r) { label.textContent = 'Select a city'; return; }
    label.innerHTML = `<strong>${r.name}</strong> <span class="text-muted text-sm">— ${r.country} · ${r.climate_band}</span>`;
  };

  const renderList = (filter = '') => {
    const f = filter.trim().toLowerCase();
    const filtered = regions.filter((r) => {
      if (!f) return true;
      return (r.name + ' ' + r.country + ' ' + r.climate_band).toLowerCase().includes(f);
    });
    list.innerHTML = filtered.map((r) => `
      <li class="city-item ${r.id === _selectedId ? 'is-selected' : ''}" data-id="${r.id}" role="option" aria-selected="${r.id === _selectedId}">
        <i class="fa-solid fa-map-pin city-item-icon"></i>
        <div class="city-item-text">
          <div class="city-item-name">${r.name}</div>
          <div class="city-item-sub">${r.country} · ${r.climate_band}</div>
        </div>
      </li>
    `).join('');
    empty.classList.toggle('hidden', filtered.length > 0);
  };

  const openPanel = () => {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    host.querySelector('.city-dropdown').classList.add('is-open');
    search.value = '';
    renderList('');
    setTimeout(() => search.focus(), 30);
  };
  const closePanel = () => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    host.querySelector('.city-dropdown').classList.remove('is-open');
  };

  trigger.addEventListener('click', () => {
    if (panel.hidden) openPanel(); else closePanel();
  });
  document.addEventListener('click', (e) => {
    if (!host.contains(e.target)) closePanel();
  });
  search.addEventListener('input', () => renderList(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('.city-item');
    if (!li) return;
    const id = li.dataset.id;
    if (id) selectCity(id);
    closePanel();
  });

  renderLabel(_selectedId);
  renderList();

  // Fire the initial change so downstream panels populate on load.
  const initial = regions.find((r) => r.id === _selectedId);
  if (initial) {
    document.dispatchEvent(new CustomEvent('cityChange', { detail: initial }));
    if (typeof _onChange === 'function') _onChange(initial);
  }
}

/** Programmatically change the selected city (e.g. from a quick-pick button). */
export async function selectCity(id) {
  const regions = await loadRegions();
  const r = regions.find((x) => x.id === id);
  if (!r) return;
  _selectedId = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* ignore */ }
  document.dispatchEvent(new CustomEvent('cityChange', { detail: r }));
  if (typeof _onChange === 'function') _onChange(r);
  // refresh the trigger label & list highlight
  const label = document.getElementById('city-trigger-label');
  if (label) {
    label.innerHTML = `<strong>${r.name}</strong> <span class="text-muted text-sm">— ${r.country} · ${r.climate_band}</span>`;
  }
  document.querySelectorAll('.city-item').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.id === id);
  });
}

export async function getCurrentCity() {
  const regions = await loadRegions();
  return regions.find((r) => r.id === _selectedId) || regions[0] || null;
}

export async function getAllRegions() {
  return loadRegions();
}
