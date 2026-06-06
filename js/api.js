// api.js
const PRODUCTION_BACKEND_URL = 'https://your-backend-url.onrender.com'; // Replace this with your deployed backend URL later
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
  ? 'http://localhost:8001/api/v1'
  : `${PRODUCTION_BACKEND_URL}/api/v1`;

// Show a toast notification
export function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : 'success'}`;

  const icon = isError
    ? '<i class="fa-solid fa-circle-exclamation" style="color: var(--red-500); font-size: 1.25rem;"></i>'
    : '<i class="fa-solid fa-circle-check" style="color: var(--emerald-400); font-size: 1.25rem;"></i>';

  toast.innerHTML = `
    ${icon}
    <div>${message}</div>
  `;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Perform an API request
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = localStorage.getItem('agrinexus_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Remove Content-Type if sending FormData (browser sets it with boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.detail || 'An error occurred';
      throw new Error(errorMsg);
    }

    return data;
  } catch (error) {
    console.warn('API Error:', error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

// Auth helpers
export function logout() {
  localStorage.removeItem('agrinexus_token');
  localStorage.removeItem('agrinexus_user');
  window.location.href = 'login.html';
}

export function getCurrentUser() {
  const userStr = localStorage.getItem('agrinexus_user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

// Setup common UI listeners
export function setupCommonUI() {
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  const user = getCurrentUser();
  if (user) {
    const nameDisplay = document.getElementById('user-name-display');
    const initialDisplay = document.getElementById('user-initial');
    if (nameDisplay) nameDisplay.textContent = user.name || user.email;
    if (initialDisplay && (user.name || user.email)) {
      initialDisplay.textContent = (user.name || user.email).charAt(0).toUpperCase();
    }
  }
}
