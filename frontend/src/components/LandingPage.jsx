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
  Activity
} from 'lucide-react';

export default function LandingPage({ onSignIn, onLaunchCluster, status }) {
  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', color: '#121212' }}>
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
          <SunburstLogo size={22} color="#121212" />
          <span style={{ fontWeight: 600, fontSize: '17px', letterSpacing: '-0.01em' }}>Quorum</span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '28px', fontSize: '14px', color: '#666664' }}>
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

          <div style={{ width: '1px', height: '18px', backgroundColor: '#EAE6DF', margin: '0 4px' }} />

          <button
            onClick={onSignIn}
            style={{
              fontWeight: 500,
              color: '#121212',
              fontSize: '14px',
              padding: '6px 12px',
              borderRadius: '6px',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F4F4F2')}
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
            color: '#121212',
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
            color: '#666664',
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
          maxWidth: '1200px',
          margin: '52px auto 0',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            backgroundColor: '#0C0C0C',
            borderRadius: '20px 20px 0 0',
            border: '1px solid #242424',
            borderBottom: 'none',
            padding: '48px 36px 0',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 30px 80px -20px rgba(0,0,0,0.3)',
          }}
        >
          {/* Subtle Ambient Grain/Glow */}
          <div
            style={{
              position: 'absolute',
              top: '-150px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '800px',
              height: '350px',
              background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 70%)',
              pointerEvents: 'none',
            }}
          />

          {/* Clean Dashboard Preview Window */}
          <div
            onClick={onLaunchCluster}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px 12px 0 0',
              border: '1px solid #EAE6DF',
              borderBottom: 'none',
              padding: '24px 28px 40px',
              cursor: 'pointer',
              transition: 'transform 0.25s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-4px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {/* Window Topbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '18px',
                borderBottom: '1px solid #F0EDE6',
                marginBottom: '24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <SunburstLogo size={20} color="#121212" />
                <div
                  style={{
                    backgroundColor: '#F7F6F2',
                    border: '1px solid #EAE6DF',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    color: '#8C8C88',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '280px',
                  }}
                >
                  <span>🔍</span>
                  <span>Find anything...</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.08)',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }} />
                  <span>5 Nodes Healthy</span>
                </div>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#121212',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  VK
                </div>
              </div>
            </div>

            {/* Window Content Greeting (matching Screenshot 1: Morning Viktor) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                marginBottom: '24px',
              }}
            >
              <div>
                <h2 className="font-serif" style={{ fontSize: '36px', fontWeight: 400, color: '#121212' }}>
                  Morning Viktor
                </h2>
                <p style={{ fontSize: '13px', color: '#666664' }}>
                  here's a quick look at how things are going across the cluster.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <span style={{ padding: '6px 12px', border: '1px solid #EAE6DF', borderRadius: '6px', color: '#121212', fontWeight: 500 }}>
                  Overview
                </span>
                <span style={{ padding: '6px 12px', color: '#737373' }}>
                  Metrics
                </span>
              </div>
            </div>

            {/* Metric Cards Snippet */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <div style={{ padding: '16px', border: '1px solid #EAE6DF', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', color: '#737373', marginBottom: '4px' }}>Cluster Consensus</div>
                <div style={{ fontSize: '24px', fontWeight: 500, color: '#121212' }}>99.99%</div>
                <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>Raft Term 14 active</div>
              </div>
              <div style={{ padding: '16px', border: '1px solid #EAE6DF', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', color: '#737373', marginBottom: '4px' }}>gRPC Streaming Latency</div>
                <div style={{ fontSize: '24px', fontWeight: 500, color: '#121212' }}>1.2ms</div>
                <div style={{ fontSize: '12px', color: '#737373', marginTop: '4px' }}>p99 &lt; 3.2ms</div>
              </div>
              <div style={{ padding: '16px', border: '1px solid #EAE6DF', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', color: '#737373', marginBottom: '4px' }}>Committed Log Index</div>
                <div style={{ fontSize: '24px', fontWeight: 500, color: '#121212' }}>1,842</div>
                <div style={{ fontSize: '12px', color: '#737373', marginTop: '4px' }}>Zero uncommitted diffs</div>
              </div>
              <div style={{ padding: '16px', border: '1px solid #EAE6DF', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', color: '#737373', marginBottom: '4px' }}>Fencing Lock Leases</div>
                <div style={{ fontSize: '24px', fontWeight: 500, color: '#121212' }}>3 Active</div>
                <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>0 Split-brain violations</div>
              </div>
            </div>
          </div>
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

      {/* 6. Footer matching Midday style */}
      <footer
        style={{
          borderTop: '1px solid #EAE6DF',
          backgroundColor: '#FBFBFA',
          padding: '48px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: '#737373',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SunburstLogo size={18} color="#121212" />
            <span style={{ fontWeight: 600, color: '#121212' }}>Quorum</span>
            <span>— The business stack for modern distributed systems.</span>
          </div>

          <div style={{ display: 'flex', gap: '24px' }}>
            <a href="#privacy">Privacy policy</a>
            <a href="#terms">Terms of service</a>
            <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
