// frontend/src/app/login/page.js
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('login');
  const [loginRole, setLoginRole] = useState('farmer');
  const [regRole, setRegRole] = useState('farmer');
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [loginEmail, setLoginEmail] = useState('farmer@agrinexus.com');
  const [loginPassword, setLoginPassword] = useState('password');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regAcres, setRegAcres] = useState('');
  const [regions, setRegions] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/data/regions.json');
        if (res.ok) {
          const data = await res.json();
          setRegions(data || []);
          if (data && data.length > 0) {
            setRegCity(data[0].name);
          }
        }
      } catch (err) {
        console.warn('Failed to load regions inside signup page.js', err);
      }
    })();
  }, []);

  const handleRoleChange = (role) => {
    setLoginRole(role);
    if (role === 'admin') {
      setLoginEmail('admin@agrinexus.com');
      setLoginPassword('admin123');
    } else {
      setLoginEmail('farmer@agrinexus.com');
      setLoginPassword('password');
    }
  };

  const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' 
      ? '<i class="fa-solid fa-circle-check" style="color: var(--emerald-400); font-size: 1.25rem;"></i>' 
      : '<i class="fa-solid fa-circle-exclamation" style="color: var(--red-500); font-size: 1.25rem;"></i>';
    toast.innerHTML = `${icon}<div>${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', loginEmail);
      formData.append('password', loginPassword);

      const data = await apiRequest('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });

      if (data.access_token) {
        localStorage.setItem('agrinexus_token', data.access_token);
        localStorage.setItem('agrinexus_user', JSON.stringify({ email: loginEmail, role: loginRole }));
        showToast('Login successful!');
        setTimeout(() => {
          router.push(loginRole === 'admin' ? '/admin' : '/farmer');
        }, 1000);
      }
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          full_name: regName,
          role: regRole,
          city: regCity,
          acres: regAcres ? parseFloat(regAcres) : null
        })
      });

      showToast('Account created! Please log in.');
      setTimeout(() => {
        setActiveTab('login');
        setLoginEmail(regEmail);
      }, 1500);
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg-void)' }}>
      <div className="ambient-glow green"></div>
      <div className="ambient-glow teal"></div>

      <main className="login-page">
        <div className="login-header animate-slide-down">
          <Link href="/" className="auth-logo">
            <div className="auth-logo-icon"><i className="fa-solid fa-leaf"></i></div>
            <div className="auth-logo-text">
              <div className="auth-logo-name">AgriNexus<span>.Ai</span></div>
            </div>
          </Link>
        </div>

        <div className="auth-card">
          <div className="auth-card-inner">
            
            <div className="auth-tabs">
              <button 
                className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`} 
                onClick={() => setActiveTab('login')}
              >
                Login
              </button>
              <button 
                className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`} 
                onClick={() => setActiveTab('register')}
              >
                Register
              </button>
            </div>

            <div className="auth-error">{error}</div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className={`auth-panel ${activeTab === 'login' ? 'active' : ''}`}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="farmer@example.com" 
                  required 
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••" 
                  required 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label className="form-label">Select Role</label>
                <div className="role-selector">
                  <label className={`role-option ${loginRole === 'farmer' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="login-role" 
                      value="farmer" 
                      checked={loginRole === 'farmer'}
                      onChange={() => handleRoleChange('farmer')}
                    />
                    <i className="fa-solid fa-tractor role-icon"></i>
                    <span className="role-label">Farmer</span>
                  </label>
                  <label className={`role-option ${loginRole === 'admin' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="login-role" 
                      value="admin" 
                      checked={loginRole === 'admin'}
                      onChange={() => handleRoleChange('admin')}
                    />
                    <i className="fa-solid fa-shield-halved role-icon"></i>
                    <span className="role-label">Admin</span>
                  </label>
                </div>
              </div>

              <button type="submit" className="auth-submit" style={{ marginTop: '8px' }} disabled={isLoading}>
                {isLoading ? (
                  <><i className="fa-solid fa-circle-notch fa-spin"></i> Authenticating...</>
                ) : (
                  <><span>Access Dashboard</span><i className="fa-solid fa-arrow-right"></i></>
                )}
              </button>
            </form>

            {/* Register Form */}
            <form onSubmit={handleRegister} className={`auth-panel ${activeTab === 'register' ? 'active' : ''}`}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="John Doe" 
                  required 
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="john@example.com" 
                  required 
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Min. 6 characters" 
                  required 
                  minLength="6"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">City / Location</label>
                <select 
                  className="form-input" 
                  style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-dim)', color: '#fff', width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer' }}
                  required 
                  value={regCity}
                  onChange={(e) => setRegCity(e.target.value)}
                >
                  {regions.map((r) => (
                    <option key={r.id} value={r.name} style={{ background: 'var(--bg-surface-elevated)', color: '#fff' }}>
                      {r.name} ({r.country})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginTop: '10px' }}>
                <label className="form-label">Land Size (Acres)</label>
                <select 
                  className="form-input" 
                  style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-dim)', color: '#fff', width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer' }}
                  required 
                  value={regAcres}
                  onChange={(e) => setRegAcres(e.target.value)}
                >
                  <option value="" disabled>Select land size...</option>
                  <option value="1">Less than 1 Acre</option>
                  <option value="5">1 - 5 Acres</option>
                  <option value="10">5 - 10 Acres</option>
                  <option value="20">10 - 20 Acres</option>
                  <option value="50">20 - 50 Acres</option>
                  <option value="100">50+ Acres</option>
                </select>
              </div>

              <button type="submit" className="auth-submit" style={{ marginTop: '8px' }} disabled={isLoading}>
                {isLoading ? (
                  <><i className="fa-solid fa-circle-notch fa-spin"></i> Creating...</>
                ) : (
                  <><span>Create Account</span><i className="fa-solid fa-user-plus"></i></>
                )}
              </button>
            </form>

          </div>
        </div>
      </main>
    </div>
  );
}
