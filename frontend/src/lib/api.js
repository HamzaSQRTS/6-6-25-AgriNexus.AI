const API_BASE_URL = 'http://localhost:8004/api/v1';

function httpErrorMessage(data, response) {
  const d = data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join('; ');
  if (d != null) return JSON.stringify(d);
  return `Request failed (${response.status})`;
}

export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('agrinexus_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

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
      const err = new Error(httpErrorMessage(data, response));
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (error) {
    if (error && error.status != null) {
      throw error;
    }

    console.warn('API network error:', error);

    const hint =
      'Cannot reach the API. Confirm FastAPI is running (e.g. uvicorn on port 8000) and NEXT_PUBLIC_API_BASE_URL matches the server.';

    throw new Error(
      error && error.message ? `${error.message}. ${hint}` : hint,
    );
  }
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('agrinexus_token');
    localStorage.removeItem('agrinexus_user');
    window.location.href = '/login';
  }
}

export function getCurrentUser() {
  if (typeof window !== 'undefined') {
    const userStr = localStorage.getItem('agrinexus_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }
  return null;
}
