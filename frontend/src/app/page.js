// frontend/src/app/page.js
'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef(null);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };
  return (
    <>
      <div className="floating-nav-container">
        <nav className="floating-nav">
          <Link href="/" className="nav-brand">
            <i className="fa-solid fa-leaf nav-brand-icon"></i>
            <span>AgriNexus.Ai</span>
          </Link>
          
          <div className="nav-links">
            <a href="#home" className="active">Home</a>
            <a href="#about">About</a>
            <a href="#features">Features</a>
          </div>
          
          <div className="nav-action">
            <Link href="/login" className="nav-btn">
              Login
            </Link>
          </div>
        </nav>
      </div>

      <section id="home" className="hero-wrapper">
        <div className="hero-content">
          <div className="hero-badge">
            <i className="fa-solid fa-microchip"></i> AI Agriculture Advisor
          </div>
          
          <h1 className="hero-title">
            Transforming Agriculture for a Sustainable World
          </h1>
          
          <p className="hero-subtitle">
            AgriNexus empowers your farm to meet yield goals with precision. Track, verify, and protect every acre, ensuring optimal crop health and safeguarding the environment through innovative, data-driven AI solutions.
          </p>

          <div className="hero-actions">
            <Link href="/login" className="btn-hero btn-hero-dark">Dashboard Login</Link>
          </div>
        </div>
      </section>

      <section id="about" className="content-section">
        <div className="section-container">
          <div className="about-grid">
            <div className="about-text">
              <h2 className="section-title">Cultivating the Future with Agentic AI</h2>
              <p className="section-desc">
                AgriNexus isn't just a data dashboard—it's an autonomous agricultural advisor. By combining cutting-edge retrieval-augmented generation (RAG) with localized farm data, we provide farmers with actionable intelligence to maximize yield while minimizing environmental impact.
              </p>
              <ul className="about-list">
                <li><i className="fa-solid fa-check text-emerald"></i> Analyzes multi-format soil reports instantly.</li>
                <li><i className="fa-solid fa-check text-emerald"></i> Provides highly confident pest control recommendations.</li>
                <li><i className="fa-solid fa-check text-emerald"></i> Ensures supply chain transparency for deforestation-free compliance.</li>
              </ul>
            </div>
            <div className="about-visual">
              <div className="visual-card">
                <video 
                  ref={videoRef}
                  src="/about-video.mp4" 
                  autoPlay 
                  loop 
                  muted={isMuted}
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button 
                  onClick={toggleMute}
                  title={isMuted ? "Unmute video" : "Mute video"}
                  style={{
                    position: 'absolute',
                    bottom: '16px',
                    right: '16px',
                    background: 'rgba(0, 0, 0, 0.6)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    backdropFilter: 'blur(4px)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.8)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="content-section">
        <div className="section-container">
          <div className="section-header text-center">
            <h2 className="section-title">Platform Features</h2>
            <p className="section-desc centered">Everything you need to optimize your fields, centralized in one intelligent platform.</p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon"><i className="fa-solid fa-camera"></i></div>
              <h3 className="feature-title">OCR Disease Detection</h3>
              <p className="feature-desc">Upload images of affected crops and let our AI diagnose blight, rust, and pests with cited confidence scores.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon"><i className="fa-solid fa-file-csv"></i></div>
              <h3 className="feature-title">Data Ingestion</h3>
              <p className="feature-desc">Seamlessly drag-and-drop PDFs, CSVs, and Word docs containing soil tests and yield data for instant parsing.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon"><i className="fa-solid fa-chart-line"></i></div>
              <h3 className="feature-title">Yield Forecasting</h3>
              <p className="feature-desc">Interactive predictive modeling based on historical data, weather patterns, and current soil moisture levels.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="section-container">
          <div className="footer-content">
            <div className="footer-brand">
              <i className="fa-solid fa-leaf text-emerald"></i> AgriNexus.Ai
            </div>
            <div className="footer-copy">&copy; 2026 AgriNexus. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </>
  );
}
