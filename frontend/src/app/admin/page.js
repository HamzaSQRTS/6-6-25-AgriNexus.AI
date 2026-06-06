// frontend/src/app/admin/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser, logout, apiRequest } from '@/lib/api';

// Only load Chart.js on client side
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

export default function AdminDashboard() {
  const router = useRouter();
  const [activeView, setActiveView] = useState('view-dashboard');
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [controlSaving, setControlSaving] = useState(false);
  const [stats, setStats] = useState({
    total_users: '--',
    active_farmers: '--',
    queries_today: '--',
    files_processed: '--'
  });
  const [trends, setTrends] = useState([]);
  const [aiParams, setAiParams] = useState({
    temperature: 0.35,
    retrieval_bounds: 5,
    system_prompt: 'You are a professional agronomist AI assistant.'
  });
  const [paramsSaving, setParamsSaving] = useState(false);
  
  const activityChartRef = useRef(null);
  const activityCanvasRef = useRef(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      router.push('/login');
      return;
    }
    setUser(currentUser);

    let cancelled = false;
    (async () => {
      try {
        const fullUser = await apiRequest('/auth/me');
        if (!cancelled && fullUser) {
          if (fullUser.role !== 'admin') {
            logout();
            return;
          }
          const updatedUser = {
            ...currentUser,
            name: fullUser.full_name,
            email: fullUser.email,
            role: fullUser.role
          };
          setUser(updatedUser);
          localStorage.setItem('agrinexus_user', JSON.stringify(updatedUser));
        }
      } catch (e) {
        if (!cancelled && (e?.status === 401 || e?.status === 403)) {
          logout();
        }
      }
    })();

    setUsers([
      { id: 1, name: 'Alice Farmer', email: 'alice@example.com', role: 'farmer', date: '2026-05-10', status: 'Active' },
      { id: 2, name: 'Bob Admin', email: 'bob@agrinexus.ai', role: 'admin', date: '2026-05-01', status: 'Active' },
      { id: 3, name: 'Charlie Green', email: 'charlie@farm.com', role: 'farmer', date: '2026-05-12', status: 'Pending' }
    ]);

    const loadStatus = async () => {
      setStatusLoading(true);
      try {
        const data = await apiRequest('/admin/status');
        if (!cancelled) setSystemStatus(data);
      } catch (e) {
        if (!cancelled) console.warn('Admin status:', e);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    };

    const loadAnalytics = async () => {
      try {
        const data = await apiRequest('/analytics/system');
        if (!cancelled) {
          setStats(data.summary);
          setTrends(data.trends || []);
          setUsers(data.users || []);
        }
      } catch (e) {
        if (!cancelled) console.warn('Admin analytics:', e);
      }
    };

    const loadAiParams = async () => {
      try {
        const data = await apiRequest('/admin/ai-params');
        if (!cancelled) setAiParams(data);
      } catch (e) {
        if (!cancelled) console.warn('AI Params load:', e);
      }
    };

    loadStatus();
    loadAnalytics();
    loadAiParams();
    const interval = setInterval(() => {
      loadStatus();
      loadAnalytics();
      loadAiParams();
    }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [router]);

  const toggleChatApi = async () => {
    if (!systemStatus) return;
    setControlSaving(true);
    try {
      const next = !systemStatus.api_control?.chat_api_enabled;
      const data = await apiRequest('/admin/api-control', {
        method: 'POST',
        body: JSON.stringify({ chat_api_enabled: next }),
      });
      setSystemStatus(data.status || systemStatus);
    } catch (e) {
      console.warn('API control update failed:', e);
    } finally {
      setControlSaving(false);
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!confirm(`Are you sure you want to remove user "${userName}"?`)) {
      return;
    }
    try {
      await apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
      // Refresh user list and stats
      const data = await apiRequest('/analytics/system');
      setStats(data.summary);
      setTrends(data.trends || []);
      setUsers(data.users || []);
    } catch (e) {
      alert(e.message || 'Failed to remove user');
    }
  };

  const saveAiParams = async (e) => {
    e.preventDefault();
    setParamsSaving(true);
    try {
      await apiRequest('/admin/ai-params', {
        method: 'POST',
        body: JSON.stringify(aiParams)
      });
      alert('AI parameters updated successfully!');
    } catch (e) {
      alert(e.message || 'Failed to update AI parameters');
    } finally {
      setParamsSaving(false);
    }
  };

  useEffect(() => {
    if (activeView === 'view-dashboard') {
      const labels = trends.length > 0 ? trends.map(t => t.day) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const data = trends.length > 0 ? trends.map(t => t.queries) : [0, 0, 0, 0, 0, 0];

      if (activityCanvasRef.current) {
        if (activityChartRef.current) {
          activityChartRef.current.data.labels = labels;
          activityChartRef.current.data.datasets[0].data = data;
          activityChartRef.current.update();
        } else {
          activityChartRef.current = new Chart(activityCanvasRef.current, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: 'Queries Used',
                data: data,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { display: false } },
                x: { grid: { display: false }, border: { display: false } }
              }
            }
          });
        }
      }
    }
  }, [activeView, trends]);

  useEffect(() => {
    return () => {
      if (activityChartRef.current) {
        activityChartRef.current.destroy();
        activityChartRef.current = null;
      }
    };
  }, [activeView]);

  if (!user) return null; // Wait until mounted and user is loaded

  const initial = user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo">
            <div className="sidebar-logo-icon"><i className="fa-solid fa-leaf"></i></div>
            <div className="sidebar-logo-text">AgriNexus<span>.Admin</span></div>
          </Link>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeView === 'view-dashboard' ? 'active' : ''}`} 
            onClick={() => setActiveView('view-dashboard')}
          >
            <i className="fa-solid fa-chart-line nav-icon"></i> System Overview
          </button>
          <button 
            className={`nav-item ${activeView === 'view-users' ? 'active' : ''}`} 
            onClick={() => setActiveView('view-users')}
          >
            <i className="fa-solid fa-users-gear nav-icon"></i> User Management
          </button>
          <button 
            className={`nav-item ${activeView === 'view-settings' ? 'active' : ''}`} 
            onClick={() => setActiveView('view-settings')}
          >
            <i className="fa-solid fa-sliders nav-icon"></i> AI Parameters
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">{initial}</div>
            <div className="user-info">
              <div className="user-name truncate">{user.name || user.email}</div>
              <div className="user-role">Administrator</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign Out">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            {activeView === 'view-dashboard' && <><i className="fa-solid fa-chart-line text-emerald-400"></i> System Overview</>}
            {activeView === 'view-users' && <><i className="fa-solid fa-users-gear text-emerald-400"></i> User Management</>}
            {activeView === 'view-settings' && <><i className="fa-solid fa-sliders text-emerald-400"></i> AI Parameters</>}
          </div>
          <div className="flex items-center gap-3">
            <span className={`badge ${systemStatus?.system_online !== false ? 'badge-green' : 'badge-yellow'}`}>
              <div className={`status-dot ${systemStatus?.system_online !== false ? 'online' : ''}`} style={systemStatus?.system_online === false ? {background:'var(--orange-500)',boxShadow:'none'} : {}}></div>
              {systemStatus?.system_online !== false ? 'System Online' : 'System Degraded'}
            </span>
          </div>
        </header>

        <div className="content-area">
          {/* View: Overview Dashboard */}
          {activeView === 'view-dashboard' && (
            <section className="view-section active">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon green"><i className="fa-solid fa-users"></i></div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.total_users}</div>
                    <div className="stat-label">Total Users</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon blue"><i className="fa-solid fa-tractor"></i></div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.active_farmers}</div>
                    <div className="stat-label">Active Farmers</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon purple"><i className="fa-solid fa-message"></i></div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.queries_today}</div>
                    <div className="stat-label">AI Queries Today</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon orange"><i className="fa-solid fa-file-invoice"></i></div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.files_processed}</div>
                    <div className="stat-label">Files Processed</div>
                  </div>
                </div>
              </div>

              <div className="charts-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="chart-card">
                  <div className="chart-header">
                    <h4 className="chart-title">System Activity (30 Days)</h4>
                  </div>
                  <div className="chart-container-wrapper">
                    <canvas ref={activityCanvasRef}></canvas>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* View: User Management */}
          {activeView === 'view-users' && (
            <section className="view-section active">
              <div className="table-card">
                <div className="table-toolbar">
                  <h4 className="font-bold text-sm">Registered Accounts</h4>
                  <div className="table-search">
                    <i className="fa-solid fa-magnifying-glass search-icon"></i>
                    <input type="text" className="form-input" placeholder="Search by name or email..." />
                  </div>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Joined Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className="user-row-info">
                              <div className="user-row-avatar">{u.name.charAt(0)}</div>
                              <div>
                                <div className="font-bold">{u.name}</div>
                                <div className="text-sm text-muted">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td><span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-green'}`}>{u.role}</span></td>
                          <td className="text-secondary">{u.date}</td>
                          <td>
                            <span className={`badge ${u.status === 'Active' ? 'badge-blue' : 'badge-yellow'}`}>
                              <div className={`status-dot ${u.status === 'Active' ? 'online' : ''}`} style={u.status !== 'Active' ? {background:'var(--orange-500)',boxShadow:'none'} : {}}></div> 
                              {u.status}
                            </span>
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <button className="btn btn-ghost btn-sm" title="Edit User"><i className="fa-solid fa-pen"></i></button>
                              {u.role !== 'admin' && (
                                <button 
                                  className="btn btn-ghost btn-sm text-rose-400 hover:text-rose-500 hover:bg-rose-500/10" 
                                  title="Remove User"
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                >
                                  <i className="fa-solid fa-trash-can"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* View: Settings — API control & system status */}
          {activeView === 'view-settings' && (
            <section className="view-section active">
              {statusLoading && !systemStatus ? (
                <div className="empty-state">
                  <i className="fa-solid fa-spinner fa-spin icon text-muted"></i>
                  <h4>Loading system status…</h4>
                </div>
              ) : systemStatus ? (
                <>
                  <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                    <div className="stat-card">
                      <div className={`stat-icon ${systemStatus.api?.operational ? 'green' : 'orange'}`}><i className="fa-solid fa-server"></i></div>
                      <div className="stat-content">
                        <div className="stat-value" style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>{systemStatus.api?.status || '—'}</div>
                        <div className="stat-label">API Status</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className={`stat-icon ${systemStatus.database?.active ? 'green' : 'orange'}`}><i className="fa-solid fa-database"></i></div>
                      <div className="stat-content">
                        <div className="stat-value" style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>{systemStatus.database?.status || '—'}</div>
                        <div className="stat-label">Database {systemStatus.database?.active ? '(Active)' : '(Inactive)'}</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className={`stat-icon ${systemStatus.api_key?.operational ? 'green' : 'orange'}`}><i className="fa-solid fa-key"></i></div>
                      <div className="stat-content">
                        <div className="stat-value" style={{ fontSize: '1.1rem' }}>{systemStatus.api_key?.operational ? 'OK' : 'Down'}</div>
                        <div className="stat-label">API Key {systemStatus.api_key?.operational ? 'Operational' : 'Not Operational'}</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className={`stat-icon ${systemStatus.chatbot?.working ? 'green' : 'orange'}`}><i className="fa-solid fa-robot"></i></div>
                      <div className="stat-content">
                        <div className="stat-value" style={{ fontSize: '1.1rem' }}>{systemStatus.chatbot?.working ? 'OK' : 'Down'}</div>
                        <div className="stat-label">Chatbot {systemStatus.chatbot?.working ? 'Working' : 'Not Working'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="table-card" style={{ marginBottom: '1.5rem' }}>
                    <div className="table-toolbar">
                      <h4 className="font-bold text-sm">Token limit</h4>
                      <span className={`badge ${systemStatus.token_usage?.limit_reached ? 'badge-yellow' : 'badge-green'}`}>
                        {systemStatus.token_usage?.percent_reached ?? 0}% of daily limit
                      </span>
                    </div>
                    <div style={{ padding: '1rem 1.25rem' }}>
                      <p className="text-sm text-secondary" style={{ marginBottom: '0.75rem' }}>
                        {systemStatus.token_usage?.tokens_used?.toLocaleString()} / {systemStatus.token_usage?.daily_limit?.toLocaleString()} tokens used today
                        ({systemStatus.token_usage?.request_count ?? 0} requests)
                      </p>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, systemStatus.token_usage?.percent_reached ?? 0)}%`,
                          height: '100%',
                          background: systemStatus.token_usage?.limit_reached ? 'var(--orange-500)' : 'var(--emerald-400)',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  </div>

                  <div className="table-card">
                    <div className="table-toolbar">
                      <h4 className="font-bold text-sm">API control</h4>
                      <button
                        className={`btn btn-sm ${systemStatus.api_control?.chat_api_enabled ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={toggleChatApi}
                        disabled={controlSaving}
                      >
                        {controlSaving ? 'Saving…' : systemStatus.api_control?.chat_api_enabled ? 'Disable Chat API' : 'Enable Chat API'}
                      </button>
                    </div>
                    <div style={{ padding: '1rem 1.25rem' }}>
                      <p className="text-sm text-secondary">
                        Chat API is <strong>{systemStatus.api_control?.chat_api_enabled ? 'enabled' : 'disabled'}</strong>.
                        {systemStatus.api_key?.detail && <> API key: {systemStatus.api_key.detail}.</>}
                        {systemStatus.chatbot?.detail && <> Chatbot: {systemStatus.chatbot.detail}.</>}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <i className="fa-solid fa-sliders icon text-muted"></i>
                  <h4>AI Parameters</h4>
                  <p>Could not load system status. Ensure the API is running and you are logged in as admin.</p>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
