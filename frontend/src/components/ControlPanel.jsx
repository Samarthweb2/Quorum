import React, { useState } from 'react';
import SunburstLogo from './SunburstLogo';
import TopologyView from './TopologyView';
import LocksView from './LocksView';
import TerminalView from './TerminalView';
import {
  LayoutGrid,
  LineChart,
  List,
  Terminal,
  FileText,
  Lock,
  Network,
  Briefcase,
  Grid,
  Settings,
  Bell,
  Search,
  Plus,
  Zap,
  AtSign,
  Link2,
  ArrowUp,
  FileCode,
  ShieldAlert,
  Shuffle,
  LogOut,
  Sparkles,
} from 'lucide-react';

export default function ControlPanel({
  status,
  userName = 'Sam',
  onSignOut,
  onSimulateZombie,
  onAcquireLock,
  onReleaseLock,
  onKillNode,
  onRestartNode,
  onPartition,
  onHealPartitions,
  onForceElection,
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'topology' | 'locks' | 'terminal' | 'logs' | 'metrics'
  const [promptText, setPromptText] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const leaderId = status?.leader || status?.leader_id || 'node-1';
  const term = status?.term || 14;
  const commitIndex = status?.commit_index || 1842;

  const handlePromptSubmit = (e) => {
    e?.preventDefault();
    if (!promptText.trim()) return;
    const lower = promptText.toLowerCase();
    if (lower.includes('zombie') || lower.includes('test')) {
      setActiveTab('terminal');
      onSimulateZombie();
    } else if (lower.includes('lock')) {
      setActiveTab('locks');
    } else if (lower.includes('node') || lower.includes('topology') || lower.includes('partition')) {
      setActiveTab('topology');
    }
    setPromptText('');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', display: 'flex' }}>
      {/* 1. Left Slim Sidebar Dock (64px wide - exact Screenshot 5) */}
      <aside className="midday-dock">
        {/* Top: Sunburst Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <div
            onClick={() => setActiveTab('overview')}
            style={{ cursor: 'pointer', padding: '6px' }}
            title="Quorum Overview"
          >
            <SunburstLogo size={22} color="#121212" />
          </div>

          {/* Navigation Stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={() => setActiveTab('overview')}
              className={`dock-icon-btn ${activeTab === 'overview' ? 'active' : ''}`}
              title="Overview"
            >
              <LayoutGrid size={18} />
            </button>

            <button
              onClick={() => setActiveTab('metrics')}
              className={`dock-icon-btn ${activeTab === 'metrics' ? 'active' : ''}`}
              title="Metrics & Latency"
            >
              <LineChart size={18} />
            </button>

            <button
              onClick={() => setActiveTab('topology')}
              className={`dock-icon-btn ${activeTab === 'topology' ? 'active' : ''}`}
              title="Cluster Topology"
            >
              <Network size={18} />
            </button>

            <button
              onClick={() => setActiveTab('locks')}
              className={`dock-icon-btn ${activeTab === 'locks' ? 'active' : ''}`}
              title="Distributed Locks"
            >
              <Lock size={18} />
            </button>

            <button
              onClick={() => setActiveTab('terminal')}
              className={`dock-icon-btn ${activeTab === 'terminal' ? 'active' : ''}`}
              title="Kleppmann Terminal"
            >
              <Terminal size={18} />
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`dock-icon-btn ${activeTab === 'logs' ? 'active' : ''}`}
              title="WAL & Raft Logs"
            >
              <FileText size={18} />
            </button>

            <button
              onClick={() => setActiveTab('tools')}
              className={`dock-icon-btn ${activeTab === 'tools' ? 'active' : ''}`}
              title="Tools & Chaos"
            >
              <Briefcase size={18} />
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`dock-icon-btn ${activeTab === 'settings' ? 'active' : ''}`}
              title="Cluster Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Bottom Profile Pill (SL - matching Screenshot 5) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '6px',
              border: '1px solid #EAE6DF',
              backgroundColor: '#F7F6F2',
              color: '#121212',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            SL
          </button>

          {showProfileMenu && (
            <div
              style={{
                position: 'absolute',
                bottom: '44px',
                left: '0',
                width: '180px',
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #EAE6DF',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                padding: '6px',
                zIndex: 100,
              }}
            >
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #F0EDE6', fontSize: '12px' }}>
                <div style={{ fontWeight: 600, color: '#121212' }}>Sam (SLMobbin)</div>
                <div style={{ color: '#737373', fontSize: '11px' }}>sam@mobbin.design</div>
              </div>
              <button
                onClick={onSignOut}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  color: '#DC2626',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEF2F2')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <LogOut size={13} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* 2. Main Content Canvas */}
      <div style={{ flex: 1, marginLeft: '64px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Top Header Bar */}
        <header
          style={{
            height: '60px',
            borderBottom: '1px solid #EAE6DF',
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FFFFFF',
          }}
        >
          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #EAE6DF',
              borderRadius: '8px',
              padding: '6px 14px',
              width: '320px',
              fontSize: '13px',
              color: '#8C8C88',
            }}
          >
            <Search size={14} color="#8C8C88" />
            <input
              type="text"
              placeholder="Find anything..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '13px', color: '#121212' }}
            />
          </div>

          {/* Right Status & Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
              <span>Healthy · 5/5 Nodes</span>
            </div>

            <button
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#737373',
                position: 'relative',
              }}
            >
              <Bell size={17} />
              <span
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: '#059669',
                }}
              />
            </button>

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
              S
            </div>
          </div>
        </header>

        {/* Dynamic Body Content */}
        <main style={{ flex: 1, padding: '40px 48px', maxWidth: '1240px', width: '100%', margin: '0 auto' }}>
          {activeTab === 'overview' ? (
            /* TAB 1: OVERVIEW (Exact Screenshot 5 Replica) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {/* Editorial Greeting */}
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <h1
                  className="font-serif"
                  style={{
                    fontSize: '48px',
                    fontWeight: 400,
                    color: '#121212',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                  }}
                >
                  Good afternoon, <span style={{ color: '#737373' }}>{userName}</span>
                </h1>
                <p style={{ fontSize: '14px', color: '#737373', marginTop: '6px' }}>
                  You're all caught up. Nothing needs your attention right now.
                </p>
              </div>

              {/* AI Command Bar (matching Screenshot 5) */}
              <div style={{ maxWidth: '780px', width: '100%', margin: '0 auto' }}>
                <form
                  onSubmit={handlePromptSubmit}
                  className="midday-command-bar"
                  style={{ position: 'relative' }}
                >
                  <textarea
                    rows={2}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder="How can I help you today?"
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      resize: 'none',
                      fontSize: '14px',
                      color: '#121212',
                    }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '8px',
                      paddingTop: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#8C8C88' }}>
                      <button type="button" title="Add resource" style={{ color: 'inherit' }}>
                        <Plus size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={onSimulateZombie}
                        title="Quick zombie test"
                        style={{ color: 'inherit' }}
                      >
                        <Zap size={15} />
                      </button>
                      <button type="button" title="Target node" style={{ color: 'inherit' }}>
                        <AtSign size={15} />
                      </button>
                      <button type="button" title="Client link" style={{ color: 'inherit' }}>
                        <Link2 size={16} />
                      </button>
                    </div>

                    <button
                      type="submit"
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: '#121212',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <ArrowUp size={15} />
                    </button>
                  </div>
                </form>

                {/* Subtext Connect apps link */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '6px',
                    fontSize: '12px',
                    color: '#737373',
                    marginTop: '8px',
                  }}
                >
                  <span>Connect apps &gt;</span>
                  <span style={{ fontSize: '13px' }}>⚙️ ⚡</span>
                </div>
              </div>

              {/* Quick Action Pill Buttons (matching Screenshot 5) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  onClick={onSimulateZombie}
                  className="midday-btn-outline"
                  style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}
                >
                  <Zap size={14} color="#059669" />
                  <span>Zombie Test</span>
                </button>

                <button
                  onClick={() => setActiveTab('locks')}
                  className="midday-btn-outline"
                  style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}
                >
                  <Lock size={14} />
                  <span>Acquire Lock</span>
                </button>

                <button
                  onClick={() => onPartition('node-3')}
                  className="midday-btn-outline"
                  style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}
                >
                  <ShieldAlert size={14} color="#D97706" />
                  <span>Simulate Partition</span>
                </button>

                <button
                  onClick={onForceElection}
                  className="midday-btn-outline"
                  style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}
                >
                  <Shuffle size={14} />
                  <span>Force Election</span>
                </button>

                <button
                  onClick={() => setActiveTab('logs')}
                  className="midday-btn-outline"
                  style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}
                >
                  <FileCode size={14} />
                  <span>Inspect WAL</span>
                </button>
              </div>

              {/* 2x3 Metric Cards Grid (matching Screenshot 5) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div className="midday-metric-card" onClick={() => setActiveTab('topology')} style={{ cursor: 'pointer' }}>
                  <div className="midday-metric-label">Cluster Status</div>
                  <div className="midday-metric-value">5 Nodes</div>
                  <div className="midday-metric-sub">All healthy &amp; quorum active</div>
                </div>

                <div className="midday-metric-card">
                  <div className="midday-metric-label">Current Term</div>
                  <div className="midday-metric-value">Term {term}</div>
                  <div className="midday-metric-sub">Leader: {leaderId}</div>
                </div>

                <div className="midday-metric-card">
                  <div className="midday-metric-label">Consensus Latency</div>
                  <div className="midday-metric-value">1.2ms</div>
                  <div className="midday-metric-sub">p99 &lt; 3.2ms · gRPC streaming</div>
                </div>

                <div className="midday-metric-card" onClick={() => setActiveTab('logs')} style={{ cursor: 'pointer' }}>
                  <div className="midday-metric-label">Committed Logs</div>
                  <div className="midday-metric-value">{commitIndex}</div>
                  <div className="midday-metric-sub">All state machines applied</div>
                </div>

                <div className="midday-metric-card" onClick={() => setActiveTab('locks')} style={{ cursor: 'pointer' }}>
                  <div className="midday-metric-label">Active Locks</div>
                  <div className="midday-metric-value">3</div>
                  <div className="midday-metric-sub">0 deadlocks · Fencing verified</div>
                </div>

                <div className="midday-metric-card" onClick={() => setActiveTab('terminal')} style={{ cursor: 'pointer' }}>
                  <div className="midday-metric-label">Split-Brain Guard</div>
                  <div className="midday-metric-value">Active</div>
                  <div className="midday-metric-sub">Monotonic fencing tokens</div>
                </div>
              </div>

              {/* Bottom-Right Integration Callout Card (matching Screenshot 5) */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <div
                  style={{
                    maxWidth: '340px',
                    padding: '20px',
                    border: '1px solid #EAE6DF',
                    borderRadius: '12px',
                    backgroundColor: '#FFFFFF',
                    backgroundImage: 'radial-gradient(#EAE6DF 1px, transparent 1px)',
                    backgroundSize: '12px 12px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '18px' }}>🤖</span>
                    <span style={{ fontSize: '18px' }}>⚡</span>
                    <span style={{ fontSize: '18px' }}>🔒</span>
                    <span style={{ fontSize: '18px' }}>🐍</span>
                  </div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#121212', marginBottom: '4px' }}>
                    Use Quorum where you already work
                  </h4>
                  <p style={{ fontSize: '12px', color: '#737373', lineHeight: 1.5 }}>
                    Ask questions and simulate failure scenarios without leaving your terminal or stack.
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === 'topology' ? (
            /* TAB 2: TOPOLOGY VIEW */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400 }}>Cluster Topology</h2>
                  <p style={{ fontSize: '13px', color: '#737373' }}>
                    Interactive 5-node Raft consensus graph over bidirectional gRPC streams.
                  </p>
                </div>
                <button
                  onClick={onHealPartitions}
                  className="midday-btn-black"
                  style={{ padding: '8px 18px', fontSize: '13px', borderRadius: '8px' }}
                >
                  Heal All Partitions
                </button>
              </div>
              <TopologyView
                status={status}
                onKillNode={onKillNode}
                onRestartNode={onRestartNode}
                onPartition={onPartition}
              />
            </div>
          ) : activeTab === 'locks' ? (
            /* TAB 3: DISTRIBUTED LOCKS VIEW */
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400 }}>Distributed Lock Studio</h2>
                <p style={{ fontSize: '13px', color: '#737373' }}>
                  Fencing token leases with draining TTL rings and push-based gRPC promotion queue.
                </p>
              </div>
              <LocksView onAcquireLock={onAcquireLock} onReleaseLock={onReleaseLock} />
            </div>
          ) : activeTab === 'terminal' ? (
            /* TAB 4: KLEPPMANN TERMINAL VIEW */
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400 }}>Kleppmann Split-Brain Console</h2>
                <p style={{ fontSize: '13px', color: '#737373' }}>
                  Martin Kleppmann storage race verification against zombie GC workers.
                </p>
              </div>
              <TerminalView onRunZombieSim={onSimulateZombie} />
            </div>
          ) : (
            /* TAB 5: WAL LOGS VIEW */
            <div style={{ padding: '24px', border: '1px solid #EAE6DF', borderRadius: '12px', backgroundColor: '#FFFFFF' }}>
              <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400, marginBottom: '16px' }}>
                Raft WAL &amp; Commit Index Stream
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #EAE6DF', textAlign: 'left', color: '#737373' }}>
                    <th style={{ padding: '10px 12px' }}>Index</th>
                    <th style={{ padding: '10px 12px' }}>Term</th>
                    <th style={{ padding: '10px 12px' }}>Command</th>
                    <th style={{ padding: '10px 12px' }}>Payload</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { idx: 1842, term: 14, cmd: 'ACQUIRE_LOCK', payload: 'res:orders_db (token: 104)', state: 'COMMITTED' },
                    { idx: 1841, term: 14, cmd: 'HEARTBEAT', payload: 'node-1 -> [2,3,4,5]', state: 'COMMITTED' },
                    { idx: 1840, term: 14, cmd: 'SET_KEY', payload: 'cluster:mode = strict_fencing', state: 'COMMITTED' },
                    { idx: 1839, term: 14, cmd: 'PROMOTION_EVENT', payload: 'worker-primary -> res:orders_db', state: 'COMMITTED' },
                  ].map((row) => (
                    <tr key={row.idx} style={{ borderBottom: '1px solid #F4F4F2' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>#{row.idx}</td>
                      <td style={{ padding: '10px 12px' }}>{row.term}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.cmd}</td>
                      <td style={{ padding: '10px 12px', color: '#666664' }}>{row.payload}</td>
                      <td style={{ padding: '10px 12px', color: '#059669', fontWeight: 600 }}>{row.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
