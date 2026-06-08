// frontend/src/app/farmer/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser, logout, apiRequest } from '@/lib/api';

// Recharts for visualization
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#fbbf24', '#f87171', '#8b5cf6'];

export default function FarmerDashboard() {
  const router = useRouter();
  const [activeView, setActiveView] = useState('view-analytics');
  const [user, setUser] = useState(null);

  const [files, setFiles] = useState([]);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [localWeather, setLocalWeather] = useState(null);
  const [weatherError, setWeatherError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [selectedReportIdx, setSelectedReportIdx] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [attachedReport, setAttachedReport] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryOverlay, setShowHistoryOverlay] = useState(false);

  useEffect(() => {
    setSelectedReportIdx(0);
  }, [analytics]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await apiRequest('/chat/history');
      setHistoryList(data || []);
    } catch (err) {
      console.warn('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const toggleHistoryOverlay = () => {
    const nextVal = !showHistoryOverlay;
    setShowHistoryOverlay(nextVal);
    if (nextVal) {
      loadHistory();
    }
  };

  const handleChatFileInput = async (e) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    for (const file of Array.from(selectedFiles)) {
      const tempId = 'upload-' + Date.now();
      setChatMessages(prev => [
        ...prev,
        { id: tempId, sender: 'ai', html: `<i class="fa-solid fa-circle-notch fa-spin text-teal-400"></i> Uploading and analyzing document: <strong>${file.name}</strong>...` }
      ]);

      const fd = new FormData();
      fd.append('file', file);
      try {
        const response = await apiRequest('/upload/file', { method: 'POST', body: fd });
        setChatMessages(prev => prev.map(m => m.id === tempId ? {
          ...m,
          html: `✅ <strong>${file.name}</strong> has been uploaded and processed successfully! I have analyzed its contents and added it to my knowledge base. You can now ask questions about it.`
        } : m));
        setUploadedDocs(prev => {
          const filtered = prev.filter(d => d.filename !== file.name);
          return [
            ...filtered,
            { filename: file.name, text: response.metadata?.text || "", checked: true }
          ];
        });
      } catch (err) {
        setChatMessages(prev => prev.map(m => m.id === tempId ? {
          ...m,
          html: `❌ Failed to process <strong>${file.name}</strong>. Error: ${err.message || String(err)}`
        } : m));
      }
    }

    try {
      const data = await apiRequest('/farmer/analytics');
      setAnalytics(data);
    } catch (err) {
      console.warn('Failed to refresh analytics:', err);
    }
  };

  // Chat State
  const [chatMessages, setChatMessages] = useState([
    { id: '1', sender: 'ai', html: 'Hello! I am your AgriNexus AI Advisor. I can analyze soil reports, diagnose plant diseases from images, and recommend precision fertilizer schedules. How can I assist you today?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatHistoryRef = useRef(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);

    let cancelled = false;
    (async () => {
      try {
        const fullUser = await apiRequest('/auth/me');
        if (!cancelled && fullUser) {
          const updatedUser = {
            ...currentUser,
            name: fullUser.full_name,
            email: fullUser.email,
            role: fullUser.role,
            city: fullUser.city,
            acres: fullUser.acres
          };
          setUser(updatedUser);
          localStorage.setItem('agrinexus_user', JSON.stringify(updatedUser));
        }
      } catch (e) {
        if (!cancelled && e?.status === 401) {
          logout();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!user || !user.city) return;
    (async () => {
      try {
        setWeatherError('');
        const weather = await apiRequest(`/weather?city=${encodeURIComponent(user.city)}`);
        setLocalWeather(weather);
      } catch (err) {
        console.warn('Dashboard weather load failed:', err);
        setWeatherError('Weather details unavailable.');
      }
    })();
  }, [user?.city]);

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatMessages, activeView]);

  const uploadsToFileRows = (recent) =>
    (recent || []).map((u, i) => ({
      id: `srv-${u.filename}-${i}`,
      name: u.filename || 'unknown',
      size: '—',
      date: u.timestamp
        ? new Date(u.timestamp).toLocaleDateString()
        : new Date().toLocaleDateString(),
      status: 'Processed',
      report_type: u.report_type || '—',
      confidence: u.confidence ? `${(u.confidence * 100).toFixed(0)}%` : '—',
    }));

  const refreshAnalytics = useCallback(async () => {
    try {
      const a = await apiRequest('/farmer/analytics');
      setAnalytics(a);
      if (a.recent_uploads?.length) {
        setFiles(uploadsToFileRows(a.recent_uploads));
      }
    } catch {
      setAnalytics({
        upload_count: 0,
        summary: null,
        charts: null,
        recent_uploads: [],
      });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshAnalytics();
  }, [user, refreshAnalytics]);

  const showToast = (message, isError = false) => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : 'success'}`;
    const icon = isError
      ? '<i class="fa-solid fa-circle-exclamation" style="color: var(--red-500); font-size: 1.25rem;"></i>'
      : '<i class="fa-solid fa-circle-check" style="color: var(--emerald-400); font-size: 1.25rem;"></i>';
    toast.innerHTML = `${icon}<div>${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  };

  const submitQuery = async (queryText, displayUserText = null, activeDocs = []) => {
    const userMsgId = Date.now().toString();
    const newMessages = [...chatMessages, { id: userMsgId, sender: 'user', html: displayUserText || queryText }];
    setChatMessages(newMessages);

    const aiMsgId = (Date.now() + 1).toString();
    setChatMessages([...newMessages, { id: aiMsgId, sender: 'ai', html: '<i class="fa-solid fa-ellipsis fa-bounce"></i>' }]);

    try {
      const response = await apiRequest('/chat/query', {
        method: 'POST',
        body: JSON.stringify({
          query: queryText,
          active_docs: activeDocs
        })
      });

      const replyHtml = `
        <div style="margin-bottom: 8px;"><strong>Analysis:</strong> ${response.diagnosis} <span class="badge badge-green" style="font-size:0.7rem; padding: 2px 6px;">${(response.confidence * 100).toFixed(0)}% Confidence</span></div>
        <div style="margin-bottom: 8px;"><strong>Recommendations:</strong>
          <ul style="margin-left: 20px; margin-top: 4px;">
            ${(response.recommendations || []).map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          <strong>Citations:</strong> ${(response.citations || []).join(', ')}
        </div>
      `;
      setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, html: replyHtml } : m));
    } catch (err) {
      setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, html: `Connection Error: ${err.message}` } : m));
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    let sentMsg = chatInput;
    let displayMsg = chatInput;

    if (attachedReport) {
      const report = attachedReport;
      const filename = report.filename || "unknown report";
      let reportDetails = "";

      if (report.report_type === "geotechnical_soil") {
        const raw = report.raw_json || {};
        reportDetails = `Geotechnical Soil Metrics:\n- Gravel: ${raw.gravel?.value || "—"}%\n- Sand: ${raw.sand?.value || "—"}%\n- Silt/Clay: ${raw.silt_clay?.value || "—"}%\n- Moisture: ${raw.moisture?.value || "—"}%\n- Dry Density: ${raw.dry_density?.value || "—"} g/cc\n- CBR: ${raw.cbr?.value || "—"}%\n- Liquid Limit: ${raw.liquid_limit?.value || "—"}%\n- Plastic Limit: ${raw.plastic_limit?.value || "—"}%\n- Free Swell: ${raw.free_swell?.value || "—"}%`;
      } else if (report.report_type === "agriculture_soil") {
        const raw = report.raw_json || {};
        reportDetails = `Agricultural Soil Metrics:\n- Nitrogen (N): ${raw.nitrogen?.value || "—"}\n- Phosphorus (P): ${raw.phosphorus?.value || "—"}\n- Potassium (K): ${raw.potassium?.value || "—"}\n- pH: ${raw.ph?.value || "—"}`;
      } else if (report.report_type === "weather") {
        const forecast = report.charts?.weather_forecast || [];
        const forecastLines = forecast.map(d => `- ${d.day}: ${d.condition} (High: ${d.High}°F, Low: ${d.Low}°F)`).join("\n");
        reportDetails = `Weather Forecast:\n${forecastLines}`;
      } else {
        reportDetails = `Summary: ${report.ai_summary}`;
      }

      sentMsg = `[Attached Context Document: ${filename}]\n${reportDetails}\n\nUser Question: ${chatInput}`;
      displayMsg = `<div class="attachment-bubble-tag mb-2" style="font-size: 0.8rem; background: var(--teal-950/40); border: 1px solid var(--teal-500/20); padding: 4px 8px; border-radius: 6px; color: var(--teal-400); display: inline-flex; items-center: center; gap: 6px;"><i class="fa-solid fa-file-invoice"></i> Ref: ${filename}</div>\n<div>${chatInput}</div>`;
      setAttachedReport(null);
    }

    const checkedDocs = uploadedDocs.filter(d => d.checked);
    const activeDocsPayload = checkedDocs.map(d => ({
      filename: d.filename,
      text: d.text
    }));

    setChatInput('');
    await submitQuery(sentMsg, displayMsg, activeDocsPayload);
  };

  const handleContinueChatWithAnalytics = (report) => {
    if (!report) return;
    setAttachedReport(report);
    setActiveView('view-chat');
  };

  const handleSuggestion = (text) => setChatInput(text);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  };

  const addFiles = async (newFiles) => {
    const arr = Array.from(newFiles);
    if (!arr.length) return;
    setUploadBusy(true);
    try {
      for (const f of arr) {
        const fd = new FormData();
        fd.append('file', f);
        try {
          await apiRequest('/upload/file', { method: 'POST', body: fd });
          showToast(`${f.name} processed successfully.`);
        } catch (err) {
          showToast(err.message || 'Upload failed', true);
        }
      }
      await refreshAnalytics();
    } finally {
      setUploadBusy(false);
    }
  };

  const renderWeatherForecast = (forecast) => {
    if (!forecast || forecast.length === 0) return null;

    const getWeatherIcon = (cond) => {
      const c = cond.toLowerCase();
      if (c.includes('sunny') || c.includes('clear')) return 'fa-solid fa-sun';
      if (c.includes('scattered') || c.includes('passing') || c.includes('cloud')) return 'fa-solid fa-cloud-sun';
      if (c.includes('rain') || c.includes('shower')) return 'fa-solid fa-cloud-showers-heavy';
      return 'fa-solid fa-cloud';
    };

    const getWeatherIconColor = (cond) => {
      const c = cond.toLowerCase();
      if (c.includes('sunny') || c.includes('clear')) return '#f59e0b'; // warm amber
      if (c.includes('scattered') || c.includes('passing') || c.includes('cloud')) return 'var(--teal-400)';
      if (c.includes('rain') || c.includes('shower')) return '#3b82f6'; // clear blue
      return '#94a3b8';
    };

    return (
      <div className="animate-slide-down" style={{
        width: '100%',
        background: 'rgba(24, 24, 27, 0.7)',
        padding: '1.75rem',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: '2rem',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)'
      }}>
        <div className="flex items-center" style={{ gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{
            background: 'rgba(20, 184, 166, 0.15)',
            color: 'var(--teal-400)',
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(20, 184, 166, 0.25)',
            fontSize: '1.1rem'
          }}><i className="fa-solid fa-cloud-sun"></i></div>
          <h4 className="font-bold text-lg" style={{ color: 'var(--teal-400)', margin: 0, fontSize: '1.15rem', letterSpacing: '0.02em' }}>7-Day Weather Forecast</h4>
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.875rem',
          justifyContent: 'flex-start'
        }}>
          {forecast.map((day, idx) => {
            const iconColor = getWeatherIconColor(day.condition);
            return (
              <div key={idx} style={{
                flex: '1 1 120px',
                minWidth: '110px',
                maxWidth: '140px',
                padding: '1.25rem 1rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.4)';
                  e.currentTarget.style.background = 'rgba(20, 184, 166, 0.04)';
                  e.currentTarget.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}>
                <span style={{ fontSize: '0.725rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{day.day}</span>
                <div style={{
                  margin: '0.25rem 0',
                  fontSize: '1.75rem',
                  color: iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '42px'
                }}>
                  <i className={getWeatherIcon(day.condition)}></i>
                </div>
                <span className="truncate" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '100%', fontWeight: '500' }} title={day.condition}>{day.condition}</span>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  marginTop: '0.25rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.02)',
                  width: '100%'
                }}>
                  <span style={{ color: 'var(--teal-400)' }}>{day.High}°</span>
                  <span style={{ color: 'var(--text-muted)' }}>{day.Low}°</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderChartSection = (data, type, title, iconClass, color) => {
    const hasData = data && data.length > 0 && (type === 'bar_multi' ? data.some(d => d.High > 0) : data.some(d => d.value !== null && d.value > 0));
    if (!hasData) {
      return (
        <div className="chart-card">
          <div className="chart-header">
            <h4 className="chart-title"><i className={iconClass}></i> {title}</h4>
          </div>
          <div className="p-8 text-center text-muted text-sm">Data unavailable for this section</div>
        </div>
      );
    }

    const maxVal = type === 'bar_multi'
      ? Math.max(...data.map(d => Math.max(d.High || 0, d.Low || 0)))
      : Math.max(...data.map(d => d.value || 0));
    const domain = [0, Math.ceil(maxVal * 1.2) || 10];

    return (
      <div className="chart-card animate-fade-in">
        <div className="chart-header">
          <h4 className="chart-title"><i className={iconClass}></i> {title}</h4>
        </div>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} domain={domain} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: color }}
                />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            ) : type === 'bar_multi' ? (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} domain={domain} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="High" fill={color[0]} radius={[4, 4, 0, 0]} barSize={15} name="High Temp (°F)" />
                <Bar dataKey="Low" fill={color[1]} radius={[4, 4, 0, 0]} barSize={15} name="Low Temp (°F)" />
              </BarChart>
            ) : type === 'pie' ? (
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={1000}
                >
                  {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            ) : null}
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderPhSection = (phValue) => {
    if (phValue === undefined || phValue === null) {
      return (
        <div className="chart-card animate-fade-in" style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '350px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-dim)',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <div className="chart-header">
            <h4 className="chart-title"><i className="fa-solid fa-vial text-teal-400" style={{ marginRight: '0.5rem' }}></i> Soil pH Analysis</h4>
          </div>
          <div className="p-8 text-center text-muted text-sm" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            pH data unavailable for this report
          </div>
        </div>
      );
    }

    let status = "Neutral";
    let color = "#2dd4bf"; // teal
    let desc = "Ideal for most crops.";

    if (phValue < 5.5) {
      status = "Strongly Acidic";
      color = "#f87171"; // red
      desc = "Highly acidic. Lime application recommended to raise pH.";
    } else if (phValue < 6.5) {
      status = "Slightly Acidic";
      color = "#fbbf24"; // yellow
      desc = "Slightly acidic. Suitable for blueberries and potatoes.";
    } else if (phValue > 7.5) {
      status = "Alkaline";
      color = "#3b82f6"; // blue
      desc = "Alkaline soil. Sulfur application may help lower pH.";
    }

    return (
      <div className="chart-card animate-fade-in" style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '350px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-dim)',
        borderRadius: '16px',
        padding: '1.5rem',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)'
      }}>
        <div className="chart-header" style={{ marginBottom: '1.5rem' }}>
          <h4 className="chart-title" style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
            <i className="fa-solid fa-vial text-teal-400" style={{ marginRight: '0.5rem' }}></i> Soil pH Analysis
          </h4>
        </div>

        <div className="flex flex-col items-center justify-center" style={{ flex: 1, gap: '1rem', margin: '1rem 0', flexDirection: 'column', display: 'flex' }}>
          <div style={{
            position: 'relative',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            border: `6px solid rgba(255, 255, 255, 0.05)`,
            borderTopColor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 20px ${color}15`
          }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '2.25rem', fontWeight: '800', color: '#ffffff', fontFamily: 'var(--font-display)', display: 'block', lineHeight: '1.1' }}>{phValue}</span>
              <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>pH Level</span>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: '700',
              color: color,
              background: `${color}15`,
              padding: '4px 12px',
              borderRadius: '99px',
              border: `1px solid ${color}30`,
              display: 'inline-block'
            }}>{status}</span>
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 0.5rem 0', lineHeight: '1.4' }}>
          {desc}
        </p>
      </div>
    );
  };

  if (!user) return null;
  const initial = user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();

  return (
    <div className="dashboard-layout">
      <div id="toast-container"></div>

      <aside className="sidebar">
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo">
            <div className="sidebar-logo-icon" style={{ color: 'var(--teal-400)' }}><i className="fa-solid fa-leaf"></i></div>
            <div className="sidebar-logo-text">AgriNexus<span>.Ai</span></div>
          </Link>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${activeView === 'view-analytics' ? 'active' : ''}`} onClick={() => setActiveView('view-analytics')}>
            <i className="fa-solid fa-chart-pie nav-icon"></i> Dashboard
          </button>
          <button className={`nav-item ${activeView === 'view-chat' ? 'active' : ''}`} onClick={() => setActiveView('view-chat')}>
            <i className="fa-solid fa-message nav-icon"></i> AI Advisory
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar" style={{ background: 'var(--teal-500)' }}>{initial}</div>
            <div className="user-info">
              <div className="user-name truncate">{user.name || user.email}</div>
              <div className="user-role">Farmer Account</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign Out">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            {activeView === 'view-analytics' && <><i className="fa-solid fa-chart-pie text-emerald-400 mr-2"></i> Dashboard</>}
            {activeView === 'view-chat' && <><i className="fa-solid fa-message text-emerald-400 mr-2"></i> AI Advisory</>}
          </div>
        </header>

        <div className="content-area">
          {activeView === 'view-analytics' && (() => {
            const activeReport = analytics?.reports && analytics.reports[selectedReportIdx] ? analytics.reports[selectedReportIdx] : null;
            return (
              <section className="view-section active animate-fade-in">
                {/* Dashboard Welcome Greeting Header */}
                <div style={{ marginBottom: '1.5rem', marginTop: '0.5rem' }}>
                  <h2 style={{ fontSize: '2.85rem', fontWeight: '850', color: '#fff', letterSpacing: '-0.03em', margin: 0, lineHeight: '1.15' }}>
                    Welcome back, <span style={{ color: 'var(--teal-400)' }}>{user.name || user.email}</span>!
                  </h2>
                  <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontWeight: 500 }}>
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>

                {/* Weather Shelf Panel */}
                <div className="weather-shelf-panel" style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-dim)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  marginBottom: '1.75rem',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1.5rem'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Live Local Weather</h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>Current conditions at your registered location</p>
                  </div>

                  <div className="weather-widget-card" style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-dim)',
                    borderRadius: '12px',
                    padding: '0.75rem 1.25rem',
                    minWidth: '300px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.5rem',
                    marginLeft: 'auto'
                  }}>
                    <div className="weather-widget-main" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderRight: '1px solid var(--border-dim)', paddingRight: '1.25rem' }}>
                      <div className="weather-widget-icon" style={{ display: 'flex', alignItems: 'center', justify- content: 'center', width: '48px', height: '48px' }}>
                      {localWeather ? (
                        <img src={`https://openweathermap.org/img/wn/${localWeather.icon}@2x.png`} alt="icon" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                      ) : (
                        <i className="fa-solid fa-circle-notch fa-spin" style={{ color: 'var(--teal-400)', fontSize: '1.5rem' }}></i>
                      )}
                    </div>
                    <div className="weather-widget-temp-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div>
                        <span className="weather-widget-temp" style={{ fontSize: '1.75rem', fontWeight: 850, color: '#fff', lineHeight: 1 }}>{localWeather ? Math.round(localWeather.temperature) : '--'}</span>
                        <span className="weather-widget-unit" style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--teal-400)', verticalAlign: 'super' }}>°C</span>
                      </div>
                      <span className="weather-widget-desc" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{localWeather ? `${localWeather.condition} (${localWeather.description})` : (weatherError || 'Loading weather...')}</span>
                    </div>
                  </div>
                  <div className="weather-widget-details" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div className="weather-widget-location" style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>
                      <i className="fa-solid fa-location-dot" style={{ color: 'var(--teal-400)', marginRight: '4px' }}></i>
                      <span>{localWeather ? `${localWeather.city}, ${localWeather.country || 'PK'}` : (user.city || 'No location configured')}</span>
                    </div>
                    <div className="weather-widget-stats" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span><i className="fa-solid fa-droplet" style={{ color: '#60a5fa', marginRight: '4px' }}></i>{localWeather ? localWeather.humidity : '--'}%</span>
                      <span><i className="fa-solid fa-wind" style={{ color: '#94a3b8', marginRight: '4px' }}></i>{localWeather ? localWeather.windSpeed : '--'} m/s</span>
                    </div>
                  </div>
                </div>
              </div>

                {/* Jump To Shelf Panel */ }
                <div className="jump-to-shelf" style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-dim)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  marginBottom: '2rem',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
                }}>
                  <div className="jump-to-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--teal-400)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <i className="fa-solid fa-arrow-pointer"></i> Jump To:
                  </div>
                  <div className="jump-to-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                    <div className="jump-to-card" onClick={() => setActiveView('view-chat')} style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-dim)',
                      borderRadius: '12px',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(20, 184, 166, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.3)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.borderColor = 'var(--border-dim)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}>
                      <div className="jump-to-card-title" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <i className="fa-solid fa-message text-teal-400"></i> AI Advisory
                      </div>
                      <div className="jump-to-card-desc" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        Ask AgriNexus AI about weather updates, soil quality, or crop tips.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-bold">Dynamic Farm Intelligence</h3>
                    <p className="text-secondary text-sm">Based on <strong>{analytics?.upload_count || 0}</strong> documents. Active Report: <span className="badge badge-blue ml-2">{activeReport ? activeReport.report_type.replace('_', ' ') : (analytics?.summary?.latest_report_type?.replace('_', ' ') || 'None')}</span></p>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowRawJson(!showRawJson)}>
                    <i className={`fa-solid ${showRawJson ? 'fa-chart-column' : 'fa-code'} mr-2`}></i>
                    {showRawJson ? 'Show Visuals' : 'View Raw JSON'}
                  </button>
                </div>

            {/* REPORT SELECTION TABS */ }
            {
              analytics?.reports && analytics.reports.length > 1 && (
                <div className="chrome-tabs-container">
                  {analytics.reports.map((rep, idx) => {
                    const isActive = selectedReportIdx === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedReportIdx(idx)}
                        className={`chrome-tab ${isActive ? 'active' : ''}`}
                      >
                        <div className="chrome-tab-icon">
                          <i className={`fa-solid ${rep.report_type === 'weather' ? 'fa-cloud-sun' :
                              rep.report_type === 'geotechnical_soil' ? 'fa-mountain-sun' : 'fa-seedling'
                            }`}></i>
                        </div>
                        <div className="chrome-tab-details">
                          <span className="chrome-tab-filename">{rep.filename}</span>
                          <span className="chrome-tab-type">
                            {rep.report_type.replace('_', ' ')}
                          </span>
                        </div>
                        {isActive && (
                          <span className="chrome-tab-status"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            }

            {
              showRawJson ? (
                <div className="bg-surface-elevated p-6 rounded-xl border border-muted/20 animate-slide-up">
                  <pre className="text-xs overflow-auto max-h-[600px] text-teal-400 font-mono">
                    {JSON.stringify(analytics, null, 2)}
                  </pre>
                </div>
              ) : (
                <>
                  {/* NEATER AI CONTEXTUAL SUMMARY */}
                  <div className="animate-slide-down" style={{
                    background: 'rgba(20, 184, 166, 0.03)',
                    border: '1px solid rgba(20, 184, 166, 0.25)',
                    padding: '1.75rem',
                    borderRadius: '16px',
                    marginBottom: '2rem',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(10px)'
                  }}>
                    <div className="flex items-center" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{
                        background: 'rgba(20, 184, 166, 0.15)',
                        color: 'var(--teal-400)',
                        padding: '0.625rem',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(20, 184, 166, 0.2)'
                      }}><i className="fa-solid fa-wand-magic-sparkles"></i></div>
                      <h4 className="font-bold text-lg" style={{ color: 'var(--teal-400)', margin: 0 }}>AI Farm Intelligence ({activeReport?.filename || 'Latest'})</h4>
                    </div>
                    <p style={{
                      fontSize: '0.925rem',
                      lineHeight: '1.65',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-line',
                      borderLeft: '3px solid rgba(20, 184, 166, 0.3)',
                      paddingLeft: '1.25rem',
                      margin: '0.75rem 0 1.5rem 0'
                    }}>
                      {(activeReport ? activeReport.ai_summary : analytics?.summary?.latest_ai_summary) || "Upload farm reports to generate AI insights."}
                    </p>
                    {((activeReport || analytics?.reports?.[selectedReportIdx])) && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{
                          color: 'var(--teal-400)',
                          border: '1px solid rgba(20, 184, 166, 0.3)',
                          background: 'rgba(20, 184, 166, 0.05)',
                          padding: '0.625rem 1.25rem',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(20, 184, 166, 0.12)';
                          e.currentTarget.style.borderColor = 'var(--teal-400)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(20, 184, 166, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(20, 184, 166, 0.05)';
                          e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.3)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        onClick={() => handleContinueChatWithAnalytics(activeReport || analytics.reports[selectedReportIdx])}
                      >
                        <i className="fa-solid fa-comments"></i>
                        Continue detailed chat with chatbot regarding the analytics
                      </button>
                    )}
                  </div>

                  <div className="charts-grid">
                    {activeReport?.report_type === 'weather' && (
                      <>
                        {renderWeatherForecast(activeReport.charts?.weather_forecast)}
                        {renderChartSection(activeReport.charts?.weather_forecast_chart, 'bar_multi', 'Weekly Temperature Trend', 'fa-solid fa-temperature-half text-teal-400', ['#2dd4bf', '#38bdf8'])}
                      </>
                    )}
                    {activeReport?.report_type === 'geotechnical_soil' && (
                      <>
                        {renderChartSection(activeReport.charts?.geotechnical_bar, 'bar', 'Physical Analysis', 'fa-solid fa-mountain-sun text-blue-400', '#3b82f6')}
                        {renderChartSection(activeReport.charts?.geotechnical_composition, 'pie', 'Grain Size Analysis', 'fa-solid fa-chart-pie text-emerald-400')}
                        {renderChartSection(activeReport.charts?.geotechnical_limits, 'bar', 'Atterberg Limits', 'fa-solid fa-vial text-yellow-400', '#fbbf24')}
                      </>
                    )}
                    {activeReport?.report_type === 'agriculture_soil' && (
                      <>
                        {renderChartSection(activeReport.charts?.agriculture_soil, 'bar', 'Soil Nutrient Profile', 'fa-solid fa-seedling text-emerald-400', '#10b981')}
                        {renderPhSection(activeReport.raw_json?.ph?.value)}
                      </>
                    )}
                    {!activeReport && (
                      <>
                        {renderChartSection(null, 'bar', 'Soil Nutrient Profile', 'fa-solid fa-seedling text-emerald-400', '#10b981')}
                        {renderPhSection(null)}
                      </>
                    )}
                  </div>
                </>
              )
            }
              </section>
        );
          })()}

        {activeView === 'view-chat' && (
          <section className="view-section active animate-fade-in">
            <div className="chat-container">
              {/* Slide-in Query History Overlay inside Chat */}
              <div className={`chat-history-overlay ${showHistoryOverlay ? '' : 'hidden'}`}>
                <div className="overlay-header">
                  <h4><i className="fa-solid fa-clock-rotate-left mr-2"></i> Query History</h4>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowHistoryOverlay(false)}>
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
                <div className="overlay-list">
                  {historyLoading ? (
                    <div className="text-center text-muted" style={{ padding: '20px' }}>
                      <i className="fa-solid fa-circle-notch fa-spin text-teal-400"></i> Loading queries...
                    </div>
                  ) : historyList.length === 0 ? (
                    <div className="text-center text-muted" style={{ padding: '20px' }}>
                      No query history yet.
                    </div>
                  ) : (
                    historyList.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className="overlay-item"
                        onClick={() => {
                          setChatInput(item.query || '');
                          setShowHistoryOverlay(false);
                        }}
                      >
                        <div className="item-query">{item.query}</div>
                        <div className="item-date">{item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="chat-history" ref={chatHistoryRef}>
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`chat-msg ${msg.sender} animate-slide-down`}>
                    <div className="chat-avatar" style={msg.sender === 'user' ? { background: 'var(--bg-surface-elevated)' } : { background: 'rgba(20, 184, 166, 0.08)', border: msg.sender === 'ai' ? '1px solid rgba(20, 184, 166, 0.2)' : 'none', color: 'var(--teal-400)' }}>
                      {msg.sender === 'ai' ? (
                        <svg viewBox="0 0 24 24" fill="none" style={{ width: '22px', height: '22px' }}>
                          <defs>
                            <linearGradient id="aiGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#2dd4bf" />
                              <stop offset="100%" stopColor="#10b981" />
                            </linearGradient>
                          </defs>
                          {/* Outer tech network ring */}
                          <circle cx="12" cy="12" r="10" stroke="url(#aiGlowGrad)" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
                          {/* Leaf body */}
                          <path d="M12 4c0 0-5 3.5-5 8.5s3.5 5 5 5 5-0.5 5-5-5-8.5-5-8.5z" fill="url(#aiGlowGrad)" fillOpacity="0.12" stroke="url(#aiGlowGrad)" strokeWidth="1.5" />
                          {/* Center main stem */}
                          <path d="M12 5.5v11.5" stroke="url(#aiGlowGrad)" strokeWidth="1" strokeLinecap="round" />
                          {/* Tech nodes linking from leaf stem */}
                          <circle cx="12" cy="8.5" r="1.5" fill="#2dd4bf" />
                          <circle cx="9.5" cy="11" r="1.2" fill="#10b981" />
                          <circle cx="14.5" cy="12.5" r="1.2" fill="#2dd4bf" />
                        </svg>
                      ) : (
                        <i className="fa-solid fa-user"></i>
                      )}
                    </div>
                    <div className="chat-bubble" dangerouslySetInnerHTML={{ __html: msg.html }}></div>
                  </div>
                ))}
              </div>
              <div className="chat-input-area">
                {attachedReport && (
                  <div className="flex items-center justify-between animate-fade-in" style={{
                    background: 'rgba(20, 184, 166, 0.05)',
                    border: '1px solid rgba(20, 184, 166, 0.2)',
                    padding: '0.625rem 1rem',
                    borderRadius: '12px',
                    marginBottom: '0.875rem',
                    fontSize: '0.85rem',
                    color: 'var(--teal-400)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                  }}>
                    <div className="flex items-center" style={{ gap: '0.75rem' }}>
                      <div style={{
                        background: 'rgba(20, 184, 166, 0.1)',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(20, 184, 166, 0.15)'
                      }}>
                        <i className="fa-solid fa-file-invoice" style={{ color: 'var(--teal-400)' }}></i>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.2' }}>Referenced Report</span>
                        <strong style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.9rem' }}>{attachedReport.filename}</strong>
                        <span style={{ marginLeft: '8px', fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(20, 184, 166, 0.15)', borderRadius: '4px', textTransform: 'capitalize', color: 'var(--teal-400)', fontWeight: '500' }}>
                          {attachedReport.report_type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <button type="button" style={{
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      transition: 'color 0.2s',
                      fontSize: '1.1rem',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--red-500)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      onClick={() => setAttachedReport(null)}>
                      <i className="fa-solid fa-circle-xmark"></i>
                    </button>
                  </div>
                )}
                {uploadedDocs.length > 0 && (
                  <div id="chat-document-shelf" className="chat-document-shelf" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '8px' }}>
                    {uploadedDocs.map((doc, idx) => (
                      <div key={idx} className="doc-pill animate-fade-in" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(20, 184, 166, 0.08)', border: '1px solid rgba(20, 184, 166, 0.2)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--teal-400)' }}>
                        <input
                          type="checkbox"
                          className="doc-checkbox"
                          checked={doc.checked}
                          style={{ cursor: 'pointer' }}
                          onChange={(e) => {
                            const checkedVal = e.target.checked;
                            setUploadedDocs(prev => prev.map((d, i) => i === idx ? { ...d, checked: checkedVal } : d));
                          }}
                        />
                        <span><i className="fa-solid fa-file-invoice"></i> {doc.filename}</span>
                        <button
                          type="button"
                          className="doc-delete-btn"
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', marginLeft: '4px' }}
                          onClick={() => {
                            setUploadedDocs(prev => prev.filter((_, i) => i !== idx));
                          }}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <form className="chat-form" onSubmit={handleChatSubmit}>
                  <button type="button" className="btn-icon text-muted" title="View Query History" onClick={toggleHistoryOverlay} style={{ background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-clock-rotate-left"></i>
                  </button>
                  <button type="button" className="btn-icon text-muted" title="Attach file to chat" onClick={() => document.getElementById('chat-file-input').click()} style={{ background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-paperclip"></i>
                  </button>
                  <input type="file" id="chat-file-input" className="hidden" accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png" onChange={handleChatFileInput} />
                  <textarea className="chat-input" placeholder="Ask about crops, diseases, or soil..." rows="1" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(e); } }}></textarea>
                  <button type="submit" className="btn btn-primary btn-icon"><i className="fa-solid fa-paper-plane"></i></button>
                </form>
              </div>
            </div>
          </section>
        )}
    </div>
      </main >
    </div >
  );
}
