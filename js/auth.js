// auth.js
import { apiRequest, showToast } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  // Tab Switching
  const tabs = document.querySelectorAll('.auth-tab');
  const panels = document.querySelectorAll('.auth-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      // Add active to clicked
      tab.classList.add('active');
      const targetId = `${tab.dataset.target}-form`;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Role Selection (Login)
  const loginRoleOptions = document.querySelectorAll('#login-form .role-option');
  loginRoleOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      loginRoleOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      input.checked = true;

      const emailInput = document.getElementById('login-email');
      const passwordInput = document.getElementById('login-password');
      if (input.value === 'admin') {
        emailInput.value = 'admin@agrinexus.com';
        passwordInput.value = 'admin123';
      } else {
        emailInput.value = 'farmer@example.com';
        passwordInput.value = 'password';
      }
    });
  });

  // Prefill default farmer credentials on load
  const initialEmail = document.getElementById('login-email');
  const initialPassword = document.getElementById('login-password');
  if (initialEmail && !initialEmail.value) {
    initialEmail.value = 'farmer@example.com';
    initialPassword.value = 'password';
  }



  // Login Form Submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const role = document.querySelector('#login-form input[name="login-role"]:checked').value;
      const btn = document.getElementById('btn-login');
      const errorDiv = document.getElementById('auth-error');

      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';
        errorDiv.textContent = '';

        // FastAPI OAuth2PasswordRequestForm requires form data
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const data = await apiRequest('/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        });

        if (data.access_token) {
          localStorage.setItem('agrinexus_token', data.access_token);
          // Store basic user info
          localStorage.setItem('agrinexus_user', JSON.stringify({ email, role }));
          showToast('Login successful!');

          setTimeout(() => {
            window.location.href = role === 'admin' ? 'admin.html' : 'farmer.html';
          }, 1000);
        }
      } catch (error) {
        errorDiv.textContent = error.message;
        showToast(error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Access Dashboard</span><i class="fa-solid fa-arrow-right"></i>';
      }
    });
  }

  // Register Form Submission
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('reg-name').value;
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      const city = document.getElementById('reg-city').value.trim();
      const acresVal = document.getElementById('reg-acres').value;
      const acres = acresVal ? parseFloat(acresVal) : null;
      const role = 'farmer';
      const btn = document.getElementById('btn-register');
      const errorDiv = document.getElementById('auth-error');

      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating...';
        errorDiv.textContent = '';

        const data = await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: email,
            password: password,
            full_name: name,
            role: role,
            city: city,
            acres: acres
          })
        });

        showToast('Account created! Please log in.');

        // Switch to login tab
        setTimeout(() => {
          document.querySelector('.auth-tab[data-target="login"]').click();
          document.getElementById('login-email').value = email;
        }, 1500);

      } catch (error) {
        errorDiv.textContent = error.message;
        showToast(error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Create Account</span><i class="fa-solid fa-user-plus"></i>';
      }
    });
  }

  // Initialize registration city dropdown
  const initRegisterCityDropdown = async () => {
    const host = document.getElementById('reg-city-dropdown-host');
    const hiddenInput = document.getElementById('reg-city');
    if (!host || !hiddenInput) return;

    let regions = [];
    try {
      const res = await fetch('data/regions.json');
      if (res.ok) {
        regions = await res.json();
      } else {
        const res2 = await fetch('/data/regions.json');
        if (res2.ok) regions = await res2.json();
      }
    } catch (e) {
      try {
        const res2 = await fetch('/data/regions.json');
        if (res2.ok) regions = await res2.json();
      } catch (err) {
        console.warn('Failed to load regions.json in login', err);
      }
    }

    if (!regions.length) {
      host.innerHTML = '<div class="text-muted text-sm" style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0;">No regions available.</div>';
      return;
    }

    let selectedId = regions[0].id;
    hiddenInput.value = regions[0].name; // Send city name to signup api

    host.innerHTML = `
      <div class="city-dropdown" id="reg-city-dropdown">
        <button class="form-input city-trigger" id="reg-city-trigger" type="button" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; text-align: left;" aria-haspopup="listbox" aria-expanded="false">
          <span style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <i class="fa-solid fa-location-dot text-emerald-400"></i>
            <span class="city-trigger-label" id="reg-city-trigger-label" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></span>
          </span>
          <i class="fa-solid fa-chevron-down city-chevron" style="font-size: 0.8rem; margin-left: 8px;"></i>
        </button>
        <div class="city-panel" id="reg-city-panel" role="listbox" hidden>
          <div class="city-search-wrap">
            <i class="fa-solid fa-magnifying-glass city-search-icon"></i>
            <input type="text" class="city-search" id="reg-city-search" placeholder="Search city, country, or climate..." />
          </div>
          <ul class="city-list" id="reg-city-list" role="presentation"></ul>
          <div class="city-empty hidden" id="reg-city-empty">No matches.</div>
        </div>
      </div>
    `;

    const trigger = host.querySelector('#reg-city-trigger');
    const panel   = host.querySelector('#reg-city-panel');
    const search  = host.querySelector('#reg-city-search');
    const list    = host.querySelector('#reg-city-list');
    const empty   = host.querySelector('#reg-city-empty');
    const label   = host.querySelector('#reg-city-trigger-label');

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
        <li class="city-item ${r.id === selectedId ? 'is-selected' : ''}" data-id="${r.id}" data-name="${r.name}" role="option" aria-selected="${r.id === selectedId}">
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
      const name = li.dataset.name;
      if (id && name) {
        selectedId = id;
        hiddenInput.value = name;
        renderLabel(selectedId);
        renderList();
      }
      closePanel();
    });

    renderLabel(selectedId);
    renderList();
  };
  initRegisterCityDropdown();
});
