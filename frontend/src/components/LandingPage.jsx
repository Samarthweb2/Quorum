import React, { useState } from 'react';
import SunburstLogo from './SunburstLogo';
import {
  ArrowRight,
  ChevronDown,
  Shield,
  Zap,
  Layers,
  Cpu,
  Lock,
  GitBranch,
  Terminal,
  Activity,
  LayoutGrid,
  Search,
  Plus,
  ArrowUp,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';

export default function LandingPage({ onSignIn, onLaunchCluster, status, theme = 'light', onToggleTheme }) {
  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)', transition: 'background-color 0.2s, color 0.2s' }}>
      {/* 1. Top Announcement Bar */}
      <div className="midday-announcement-bar">
        <span>Quorum v2.4: High-throughput Raft consensus over gRPC streaming.</span>
        <a href="#features">Read the announcement →</a>
      </div>

      {/* 2. Minimalist Header */}
      <header
        style={{
          maxWidth: '1240px',
          margin: '0 auto',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <SunburstLogo size={22} color="var(--text-primary)" />
          <span style={{ fontWeight: 600, fontSize: '17px', letterSpacing: '-0.01em' }}>Quorum</span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '28px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <span>Features</span>
            <ChevronDown size={14} />
          </div>
          <a href="#architecture" style={{ transition: 'color 0.15s' }}>Architecture</a>
          <a href="#benchmarks" style={{ transition: 'color 0.15s' }}>Benchmarks</a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <span>Resources</span>
            <ChevronDown size={14} />
          </div>

          <button
            onClick={onSignIn}
            style={{
              fontWeight: 500,
              color: 'var(--text-primary)',
              fontSize: '14px',
              padding: '6px 12px',
              borderRadius: '6px',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Sign in
          </button>
        </nav>
      </header>

      {/* 3. Hero Section */}
      <section
        style={{
          maxWidth: '980px',
          margin: '40px auto 0',
          padding: '0 24px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Pill Badge */}
        <div className="midday-pill-badge" style={{ marginBottom: '28px', cursor: 'pointer' }} onClick={onSignIn}>
          <span>Quorum Engine v2.4 is live</span>
          <ArrowRight size={13} />
        </div>

        {/* Headline - Editorial Serif */}
        <h1
          className="font-serif"
          style={{
            fontSize: '68px',
            lineHeight: 1.06,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            color: 'var(--text-primary)',
            maxWidth: '860px',
            marginBottom: '20px',
          }}
        >
          Distributed systems engineered with Raft &amp; gRPC
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: '17px',
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            maxWidth: '680px',
            marginBottom: '32px',
          }}
        >
          Sub-millisecond state machine replication, bidirectional gRPC streaming locks,
          and mathematical fencing tokens to eliminate split-brain chaos forever.
        </p>

        {/* CTA Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={onLaunchCluster}
            className="midday-btn-black"
            style={{ padding: '13px 32px', fontSize: '15px' }}
          >
            Start your cluster
          </button>
          <span style={{ fontSize: '13px', color: '#999996' }}>
            100% open source · Production-grade consensus · Zero dependencies
          </span>
        </div>

        {/* Minimal Monochrome Protocol Logo Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '36px',
            marginTop: '36px',
            color: '#A8A8A4',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em' }}>
            <SunburstLogo size={15} color="#A8A8A4" />
            <span>RAFT</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em' }}>
            <Zap size={14} />
            <span>gRPC STREAM</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em' }}>
            <Layers size={14} />
            <span>PROTOBUF v3</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em' }}>
            <Lock size={14} />
            <span>FENCING LEASE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em' }}>
            <Cpu size={14} />
            <span>WAL ENGINE</span>
          </div>
        </div>
      </section>

      {/* 4. Atmospheric Dark Preview Frame (matching Screenshot 1) */}
      <section
        style={{
          width: '100%',
          backgroundColor: '#09090A',
          backgroundImage: 'radial-gradient(ellipse at 50% 12%, #222225 0%, #121214 50%, #060607 100%)',
          marginTop: '64px',
          padding: '64px 24px 0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle Ambient Grain/Light */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '240px',
            background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Clean Dashboard Preview Window matching Screenshot 1 (no thick bezel/box) */}
        <div
          onClick={onLaunchCluster}
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            backgroundColor: '#FFFFFF',
            borderRadius: '12px 12px 0 0',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderBottom: 'none',
            boxShadow: '0 32px 100px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(0,0,0,0.04)',
            display: 'flex',
            cursor: 'pointer',
            transition: 'transform 0.25s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          {/* Left Mini Dock (matching Screenshot 1) */}
          <div
            style={{
              width: '56px',
              borderRight: '1px solid #F0EDE6',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '16px 0',
              gap: '16px',
              backgroundColor: '#FFFFFF',
            }}
          >
            <SunburstLogo size={20} color="#121212" />
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid #EAE6DF',
                backgroundColor: '#F7F6F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#121212',
              }}
            >
              <LayoutGrid size={15} />
            </div>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8C8C88',
              }}
            >
              <Activity size={15} />
            </div>
          </div>

          {/* Right Window Body */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Topbar (matching Screenshot 1) */}
            <div
              style={{
                height: '52px',
                borderBottom: '1px solid #F0EDE6',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#FBFBFA',
                  border: '1px solid #F0EDE6',
                  color: '#8C8C88',
                  fontSize: '13px',
                  width: '240px',
                }}
              >
                <Search size={14} color="#8C8C88" />
                <span>Find anything...</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#1E293B',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  VK
                </div>
              </div>
            </div>

            {/* Window Content */}
            <div style={{ padding: '26px 30px 48px' }}>
              {/* Header Greeting & Controls (matching Screenshot 1) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  marginBottom: '24px',
                }}
              >
                <div>
                  <h2 className="font-serif" style={{ fontSize: '36px', fontWeight: 400, color: '#121212', lineHeight: 1.1 }}>
                    Morning Viktor
                  </h2>
                  <p style={{ fontSize: '13px', color: '#737373', marginTop: '4px' }}>
                    here's a quick look at how things are going across the cluster.
                  </p>
                </div>

                {/* Right controls: grid icon, 1 year dropdown, Overview / Metrics tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <button
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: '1px solid #EAE6DF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#737373',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <LayoutGrid size={13} />
                  </button>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #EAE6DF',
                      color: '#121212',
                      fontWeight: 500,
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <span>1 year</span>
                    <ChevronDown size={12} color="#737373" />
                  </div>

                  <div style={{ display: 'flex', border: '1px solid #EAE6DF', borderRadius: '6px', padding: '2px', backgroundColor: '#FFFFFF' }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        backgroundColor: '#F4F4F2',
                        color: '#121212',
                        fontWeight: 500,
                      }}
                    >
                      Overview
                    </span>
                    <span style={{ padding: '4px 12px', color: '#737373' }}>
                      Metrics
                    </span>
                  </div>
                </div>
              </div>

              {/* Midday AI Command Bar & Cluster Actions */}
              <div
                style={{
                  marginBottom: '20px',
                  padding: '12px 18px',
                  backgroundColor: '#FBFBFA',
                  border: '1px solid #EAE6DF',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#8C8C88', fontSize: '13px' }}>
                  <Sparkles size={15} color="#121212" />
                  <span>How can I help you across the Quorum cluster today?</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#8C8C88' }}>
                  <span style={{ fontSize: '14px', cursor: 'pointer' }}>+</span>
                  <Zap size={13} />
                  <span style={{ fontSize: '13px' }}>@</span>
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      backgroundColor: '#121212',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowUp size={13} />
                  </div>
                </div>
              </div>

              {/* Action Quick Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '22px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', padding: '5px 11px', borderRadius: '6px', border: '1px solid #EAE6DF', backgroundColor: '#FFFFFF', color: '#121212', fontWeight: 500 }}>
                  📄 Replicate Log
                </span>
                <span style={{ fontSize: '12px', padding: '5px 11px', borderRadius: '6px', border: '1px solid #EAE6DF', backgroundColor: '#FFFFFF', color: '#121212', fontWeight: 500 }}>
                  ⚡ Elect Leader
                </span>
                <span style={{ fontSize: '12px', padding: '5px 11px', borderRadius: '6px', border: '1px solid #EAE6DF', backgroundColor: '#FFFFFF', color: '#121212', fontWeight: 500 }}>
                  🛡️ Fencing Lease
                </span>
                <span style={{ fontSize: '12px', padding: '5px 11px', borderRadius: '6px', border: '1px solid #EAE6DF', backgroundColor: '#FFFFFF', color: '#121212', fontWeight: 500 }}>
                  🔍 Inspect State
                </span>
              </div>

              {/* 4 Clean Metric Cards (matching Screenshot 1) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div style={{ padding: '18px', border: '1px solid #EAE6DF', borderRadius: '10px', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '12px', color: '#737373', marginBottom: '6px' }}>Cluster Consensus</div>
                  <div style={{ fontSize: '24px', fontWeight: 500, color: '#121212' }}>99.99%</div>
                  <div style={{ fontSize: '12px', color: '#059669', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#059669' }} />
                    <span>Raft Term 14 active</span>
                  </div>
                </div>

                <div style={{ padding: '18px', border: '1px solid #EAE6DF', borderRadius: '10px', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '12px', color: '#737373', marginBottom: '6px' }}>gRPC Streaming Latency</div>
                  <div style={{ fontSize: '24px', fontWeight: 500, color: '#121212' }}>1.2ms</div>
                  <div style={{ fontSize: '12px', color: '#737373', marginTop: '6px' }}>p99 &lt; 3.2ms</div>
                </div>

                <div style={{ padding: '18px', border: '1px solid #EAE6DF', borderRadius: '10px', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '12px', color: '#737373', marginBottom: '6px' }}>Committed Log Index</div>
                  <div style={{ fontSize: '24px', fontWeight: 500, color: '#121212' }}>1,842</div>
                  <div style={{ fontSize: '12px', color: '#737373', marginTop: '6px' }}>Zero uncommitted diffs</div>
                </div>

                <div style={{ padding: '18px', border: '1px solid #EAE6DF', borderRadius: '10px', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '12px', color: '#737373', marginBottom: '6px' }}>Fencing Lock Leases</div>
                  <div style={{ fontSize: '24px', fontWeight: 500, color: '#121212' }}>3 Active</div>
                  <div style={{ fontSize: '12px', color: '#059669', marginTop: '6px' }}>0 Split-brain violations</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar inside Dark Section (matching Screenshot 1: * Midday / curated by Mobbin) */}
        <div
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            borderTop: '1px solid #222222',
            padding: '16px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#737373',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SunburstLogo size={16} color="#A0A0A0" />
            <span style={{ color: '#FFFFFF', fontWeight: 500 }}>Quorum</span>
          </div>
          <div>curated by Mobbin · Raft &amp; gRPC</div>
        </div>
      </section>

      {/* 5. Features Grid Section */}
      <section id="features" style={{ maxWidth: '1200px', margin: '80px auto', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', color: '#737373', textTransform: 'uppercase' }}>
            ENGINEERED FOR RESILIENCE
          </span>
          <h2 className="font-serif" style={{ fontSize: '44px', fontWeight: 400, marginTop: '8px' }}>
            Built for mission-critical consensus
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          <div className="midday-metric-card">
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#F4F4F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Lock size={20} color="#121212" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Fencing Tokens vs Zombie Workers</h3>
            <p style={{ fontSize: '14px', color: '#666664', lineHeight: 1.6 }}>
              Solves Martin Kleppmann's famous storage race. Monotonically incrementing fencing tokens reject stale writes from paused or delayed GC zombie workers.
            </p>
          </div>

          <div className="midday-metric-card">
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#F4F4F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Zap size={20} color="#121212" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Bidirectional gRPC Streaming</h3>
            <p style={{ fontSize: '14px', color: '#666664', lineHeight: 1.6 }}>
              Push-based promotion queue delivers lock grants immediately when released, eliminating polling latency and reducing consensus overhead to sub-millisecond ranges.
            </p>
          </div>

          <div className="midday-metric-card">
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#F4F4F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <GitBranch size={20} color="#121212" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Self-Healing Raft Topology</h3>
            <p style={{ fontSize: '14px', color: '#666664', lineHeight: 1.6 }}>
              Instant leader elections, randomized heartbeat jitter, and deterministic log catchup allow clusters to survive arbitrary network partitions without data loss.
            </p>
          </div>
        </div>
      </section>

      {/* 6. Footer (exact match to Midday Screenshot / "Last Page") */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-canvas)',
          paddingTop: '64px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
          {/* Top Row: Links and Dark Mode Toggle (matching Screenshot) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '56px',
            }}
          >
            {/* Left: Sunburst and Link Columns */}
            <div style={{ display: 'flex', gap: '64px', alignItems: 'flex-start' }}>
              <div style={{ marginTop: '2px' }}>
                <SunburstLogo size={24} color="var(--text-primary)" />
              </div>

              {/* Column 1 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <a href="#files" style={{ transition: 'color 0.15s' }}>Files</a>
                <a href="#exports" style={{ transition: 'color 0.15s' }}>Exports</a>
                <a href="#assistant" style={{ transition: 'color 0.15s' }}>Assistant</a>
              </div>

              {/* Column 2 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <a href="#sdks" style={{ transition: 'color 0.15s' }}>SDKs</a>
                <a href="#support" style={{ transition: 'color 0.15s' }}>Support</a>
                <a href="#privacy" style={{ transition: 'color 0.15s' }}>Privacy Policy</a>
                <a href="#terms" style={{ transition: 'color 0.15s' }}>Terms of Service</a>
              </div>
            </div>

            {/* Right: Dark / Light Mode Button (exact Screenshot position) */}
            <div>
              <button
                onClick={onToggleTheme}
                aria-label="Toggle dark mode"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card)')}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun size={14} />
                    <span>Light mode</span>
                  </>
                ) : (
                  <>
                    <Moon size={14} />
                    <span>Dark mode</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Status & Copyright Row (matching Screenshot) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '24px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>System status:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Operational</span>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
                  display: 'inline-block',
                }}
              />
            </div>

            <div>
              © 2026 Quorum Labs AB. All rights reserved.
            </div>
          </div>
        </div>

        {/* Colossal Outline Typography: quorum (spanning edge to edge matching Screenshot) */}
        <div
          style={{
            width: '100%',
            overflow: 'hidden',
            lineHeight: 0,
            marginTop: '8px',
            marginBottom: '-14px',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          <svg
            viewBox="0 0 1400 240"
            width="100%"
            height="auto"
            style={{ display: 'block' }}
          >
            <text
              x="50%"
              y="88%"
              textAnchor="middle"
              fill="var(--big-text-fill)"
              stroke="var(--big-text-stroke)"
              strokeWidth="1.5"
              fontFamily="var(--font-sans)"
              fontWeight="500"
              letterSpacing="-0.035em"
              fontSize="270"
            >
              quorum
            </text>
          </svg>
        </div>
      </footer>
    </div>
  );
}
