// admin.js
import { setupCommonUI, apiRequest, showToast } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  setupCommonUI();

  // Sidebar Navigation
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const topbarTitle = document.getElementById('topbar-title');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active from all nav items and views
      navItems.forEach(nav => nav.classList.remove('active'));
      viewSections.forEach(view => view.classList.remove('active'));

      // Add active to clicked item
      item.classList.add('active');
      const targetId = item.dataset.target;
      document.getElementById(targetId).classList.add('active');

      // Update Topbar Title
      topbarTitle.innerHTML = item.innerHTML;
    });
  });

  // Load Analytics
  loadAnalytics();

  // Load Status
  loadStatus();

  // Toggle Chat API Button Handler
  const btnToggleChat = document.getElementById('btn-toggle-chat');
  if (btnToggleChat) {
    btnToggleChat.addEventListener('click', async () => {
      const currentlyEnabled = btnToggleChat.dataset.enabled === 'true';
      btnToggleChat.disabled = true;
      btnToggleChat.textContent = 'Saving...';
      try {
        await apiRequest('/admin/api-control', {
          method: 'POST',
          body: JSON.stringify({ chat_api_enabled: !currentlyEnabled })
        });
        showToast('API control updated', 'success');
        loadStatus();
      } catch (err) {
        showToast(err.message || 'Failed to toggle Chat API', 'error');
      } finally {
        btnToggleChat.disabled = false;
      }
    });
  }

  // Reload status and analytics periodically
  setInterval(() => {
    loadAnalytics();
    loadStatus();
  }, 30000);
});

async function loadAnalytics() {
  try {
    const data = await apiRequest('/analytics/system');
    
    // Update Stats Row
    document.getElementById('stat-total-users').textContent = data.summary.total_users;
    document.getElementById('stat-farmers').textContent = data.summary.active_farmers;
    document.getElementById('stat-queries-today').textContent = data.summary.queries_today;
    document.getElementById('stat-files-processed').textContent = data.summary.files_processed;

    // Render Users Table
    const tableBody = document.getElementById('users-table-body');
    if (tableBody && data.users) {
      tableBody.innerHTML = '';
      data.users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <div class="user-row-info">
              <div class="user-row-avatar">${user.name.charAt(0)}</div>
              <div>
                <div class="font-bold">${user.name}</div>
                <div class="text-sm text-muted">${user.email}</div>
              </div>
            </div>
          </td>
          <td><span class="badge ${user.role === 'admin' ? 'badge-purple' : 'badge-green'}">${user.role}</span></td>
          <td class="text-secondary">${user.date}</td>
          <td>
            <span class="badge ${user.status === 'Active' ? 'badge-blue' : 'badge-yellow'}">
              <div class="status-dot ${user.status === 'Active' ? 'online' : ''}" style="${user.status !== 'Active' ? 'background:var(--orange-500);box-shadow:none;' : ''}"></div> 
              ${user.status}
            </span>
          </td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" title="Edit User"><i class="fa-solid fa-pen"></i></button>
              ${user.role === 'admin' ? '' : '<button class="btn btn-ghost btn-sm btn-delete-user text-rose-400" title="Remove User"><i class="fa-solid fa-trash-can"></i></button>'}
            </div>
          </td>
        `;
        
        const deleteBtn = tr.querySelector('.btn-delete-user');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            if (confirm(`Are you sure you want to remove user "${user.name}"?`)) {
              try {
                await apiRequest(`/admin/users/${user.id}`, { method: 'DELETE' });
                showToast('User removed successfully', 'success');
                loadAnalytics();
              } catch (e) {
                showToast(e.message || 'Failed to remove user', 'error');
              }
            }
          });
        }
        tableBody.appendChild(tr);
      });
    }

    // Render Activity Chart with trends
    const ctxActivity = document.getElementById('activityChart');
    if (ctxActivity) {
      const labels = data.trends && data.trends.length > 0 ? data.trends.map(t => t.day) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const trendData = data.trends && data.trends.length > 0 ? data.trends.map(t => t.queries) : [0, 0, 0, 0, 0, 0];

      if (window.activityChartInstance) {
        window.activityChartInstance.destroy();
      }

      window.activityChartInstance = new Chart(ctxActivity, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Queries Used',
            data: trendData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { display: false } },
            x: { grid: { display: false }, border: { display: false } }
          }
        }
      });
    }
  } catch (error) {
    console.error('Failed to load system analytics:', error);
  }
}

async function loadStatus() {
  try {
    const data = await apiRequest('/admin/status');
    
    // Update API Status Card
    const apiStatus = data.api?.status || '—';
    const apiVal = document.getElementById('val-api-status');
    const apiIcon = document.getElementById('api-status-icon');
    if (apiVal) apiVal.textContent = apiStatus;
    if (apiIcon) {
      apiIcon.className = `stat-icon ${data.api?.operational ? 'green' : 'orange'}`;
    }

    // Update Database Card
    const dbVal = document.getElementById('val-db-status');
    const dbLbl = document.getElementById('lbl-db-status');
    const dbIcon = document.getElementById('db-status-icon');
    if (dbVal) dbVal.textContent = data.database?.status || '—';
    if (dbLbl) dbLbl.textContent = `Database ${data.database?.active ? '(Active)' : '(Inactive)'}`;
    if (dbIcon) {
      dbIcon.className = `stat-icon ${data.database?.active ? 'green' : 'orange'}`;
    }

    // Update API Key Card
    const keyVal = document.getElementById('val-key-status');
    const keyLbl = document.getElementById('lbl-key-status');
    const keyIcon = document.getElementById('key-status-icon');
    if (keyVal) keyVal.textContent = data.api_key?.operational ? 'OK' : 'Down';
    if (keyLbl) keyLbl.textContent = `API Key ${data.api_key?.operational ? 'Operational' : 'Not Operational'}`;
    if (keyIcon) {
      keyIcon.className = `stat-icon ${data.api_key?.operational ? 'green' : 'orange'}`;
    }

    // Update Chatbot Card
    const botVal = document.getElementById('val-bot-status');
    const botLbl = document.getElementById('lbl-bot-status');
    const botIcon = document.getElementById('bot-status-icon');
    if (botVal) botVal.textContent = data.chatbot?.working ? 'OK' : 'Down';
    if (botLbl) botLbl.textContent = `Chatbot ${data.chatbot?.working ? 'Working' : 'Not Working'}`;
    if (botIcon) {
      botIcon.className = `stat-icon ${data.chatbot?.working ? 'green' : 'orange'}`;
    }

    // Update Token Limit Card
    const badgeToken = document.getElementById('badge-token-percent');
    const textToken = document.getElementById('text-token-usage');
    const barToken = document.getElementById('bar-token-usage');
    if (badgeToken) {
      badgeToken.textContent = `${data.token_usage?.percent_reached ?? 0}% of daily limit`;
      badgeToken.className = `badge ${data.token_usage?.limit_reached ? 'badge-yellow' : 'badge-green'}`;
    }
    if (textToken) {
      textToken.textContent = `${data.token_usage?.tokens_used?.toLocaleString()} / ${data.token_usage?.daily_limit?.toLocaleString()} tokens used today (${data.token_usage?.request_count ?? 0} requests)`;
    }
    if (barToken) {
      barToken.style.width = `${Math.min(100, data.token_usage?.percent_reached ?? 0)}%`;
      barToken.style.background = data.token_usage?.limit_reached ? 'var(--orange-500)' : 'var(--emerald-400)';
    }

    // Update API Control Card
    const btnToggleChat = document.getElementById('btn-toggle-chat');
    const textApiControl = document.getElementById('text-api-control');
    const chatEnabled = data.api_control?.chat_api_enabled;

    if (btnToggleChat) {
      btnToggleChat.textContent = chatEnabled ? 'Disable Chat API' : 'Enable Chat API';
      btnToggleChat.className = `btn btn-sm ${chatEnabled ? 'btn-ghost' : 'btn-primary'}`;
      btnToggleChat.dataset.enabled = chatEnabled;
    }
    if (textApiControl) {
      let detailStr = `Chat API is <strong>${chatEnabled ? 'enabled' : 'disabled'}</strong>.`;
      if (data.api_key?.detail) detailStr += ` API key: ${data.api_key.detail}.`;
      if (data.chatbot?.detail) detailStr += ` Chatbot: ${data.chatbot.detail}.`;
      textApiControl.innerHTML = detailStr;
    }

  } catch (err) {
    console.warn('Failed to load admin system status:', err);
  }
}
