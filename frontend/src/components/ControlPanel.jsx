import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Activity,
  Cpu,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Sliders,
  Save,
  Power,
  Wifi,
  WifiOff,
} from 'lucide-react';

export default function ControlPanel({
  status,
  wsConnected = false,
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
  const [activeTab, setActiveTab] = useState('overview');
  const [promptText, setPromptText] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const prevStatusRef = useRef(null);

  const [notifications, setNotifications] = useState([
    { id: 1, msg: 'Cluster initialized with 5 nodes', type: 'success', time: 'just now', read: false },
    { id: 2, msg: 'Leader elected: node-2 (Term 1)', type: 'info', time: '1m ago', read: false },
  ]);

  // Global Ctrl+K / Cmd+K and Escape keyboard listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setShowSearchDropdown(true);
      }
      if (e.key === 'Escape') {
        setShowSearchDropdown(false);
        setShowNotifications(false);
      }
    };

    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Settings state
  const [settings, setSettings] = useState({
    heartbeatInterval: 150,
    electionTimeout: 300,
    maxLogEntries: 10000,
    snapshotThreshold: 1000,
    leaseDefaultTtl: 6000,
    enableLeaderLease: true,
    enablePreVote: true,
    enableAutoSnapshot: false,
  });

  // Metrics history for sparkline charts
  const [metricsHistory, setMetricsHistory] = useState({
    latency: [],
  });

  useEffect(() => {
    if (!status) return;
    const now = Date.now();
    setMetricsHistory(prev => ({
      latency: [...prev.latency.slice(-29), { t: now, v: status.latency_ms || (Math.random() * 2 + 0.5) }],
    }));
  }, [status]);

  // Derived live data from status
  const leaderId = status?.leader_id || status?.leader || 'node-1';
  const term = status?.nodes?.find(n => n.role === 'LEADER')?.current_term || status?.term || 1;
  const commitIndex = status?.nodes?.reduce((max, n) => Math.max(max, n.commit_index || 0), 0) || 0;
  const totalNodes = status?.total_nodes || 5;
  const aliveNodes = status?.alive_nodes ?? status?.nodes?.filter(n => !n.is_stopped).length ?? 5;
  const activeLocks = status?.active_locks?.length ?? 0;
  const isHealthy = status?.health === 'HEALTHY';
  const latencyMs = status?.latency_ms || 0;
  const totalProposals = status?.total_proposals || 0;
  const successfulProposals = status?.successful_proposals || 0;

  const handlePromptSubmit = (e) => {
    e?.preventDefault();
    if (!promptText.trim()) return;
    const lower = promptText.toLowerCase();
    if (lower.includes('zombie') || lower.includes('test')) {
      setActiveTab('terminal');
      onSimulateZombie();
    } else if (lower.includes('lock') || lower.includes('lease')) {
      setActiveTab('locks');
    } else if (lower.includes('node') || lower.includes('topology') || lower.includes('partition')) {
      setActiveTab('topology');
    } else if (lower.includes('metric') || lower.includes('latency') || lower.includes('chart')) {
      setActiveTab('metrics');
    } else if (lower.includes('setting') || lower.includes('config')) {
      setActiveTab('settings');
    } else if (lower.includes('log') || lower.includes('wal')) {
      setActiveTab('logs');
    }
    setPromptText('');
  };

  const tabItems = [
    { id: 'overview', icon: LayoutGrid, label: 'Overview' },
    { id: 'metrics', icon: LineChart, label: 'Metrics & Latency' },
    { id: 'topology', icon: Network, label: 'Cluster Topology' },
    { id: 'locks', icon: Lock, label: 'Distributed Locks' },
    { id: 'terminal', icon: Terminal, label: 'Kleppmann Terminal' },
    { id: 'logs', icon: FileText, label: 'WAL & Raft Logs' },
    { id: 'tools', icon: Briefcase, label: 'Tools & Chaos' },
    { id: 'settings', icon: Settings, label: 'Cluster Settings' },
  ];

  // Watch status for live cluster notifications
  useEffect(() => {
    if (!status) return;
    const prev = prevStatusRef.current;
    if (!prev) {
      prevStatusRef.current = status;
      return;
    }

    const newNotifs = [];
    const timeNow = 'just now';

    // 1. Leader election event
    const prevLeader = prev.leader_id || prev.leader;
    const currLeader = status.leader_id || status.leader;
    if (prevLeader && currLeader && prevLeader !== currLeader) {
      newNotifs.push({
        id: Date.now() + Math.random(),
        msg: `Leader change: ${currLeader} elected (Term ${term})`,
        type: 'info',
        time: timeNow,
        read: false,
      });
    }

    // 2. Node state transitions (killed / restarted)
    if (prev.nodes && status.nodes) {
      status.nodes.forEach(currNode => {
        const prevNode = prev.nodes.find(pn => (pn.node_id || pn.id) === (currNode.node_id || currNode.id));
        if (prevNode) {
          const wasStopped = !!prevNode.is_stopped || prevNode.role === 'OFFLINE' || prevNode.role === 'offline';
          const isStopped = !!currNode.is_stopped || currNode.role === 'OFFLINE' || currNode.role === 'offline';
          const nid = currNode.node_id || currNode.id;
          if (!wasStopped && isStopped) {
            newNotifs.push({
              id: Date.now() + Math.random(),
              msg: `Node ${nid} went offline (Stopped)`,
              type: 'warn',
              time: timeNow,
              read: false,
            });
          } else if (wasStopped && !isStopped) {
            newNotifs.push({
              id: Date.now() + Math.random(),
              msg: `Node ${nid} rejoined quorum`,
              type: 'success',
              time: timeNow,
              read: false,
            });
          }
        }
      });
    }

    // 3. Network partitions
    const prevParts = prev.network_partitions?.length || 0;
    const currParts = status.network_partitions?.length || 0;
    if (currParts > prevParts) {
      newNotifs.push({
        id: Date.now() + Math.random(),
        msg: 'Network partition detected in cluster!',
        type: 'warn',
        time: timeNow,
        read: false,
      });
    } else if (currParts < prevParts && currParts === 0) {
      newNotifs.push({
        id: Date.now() + Math.random(),
        msg: 'Network partitions healed. Cluster recovered.',
        type: 'success',
        time: timeNow,
        read: false,
      });
    }

    // 4. Lock acquisitions
    const prevLocks = prev.active_locks || [];
    const currLocks = status.active_locks || [];
    if (currLocks.length > prevLocks.length) {
      const added = currLocks.filter(cl => !prevLocks.some(pl => pl.key === cl.key));
      added.forEach(al => {
        newNotifs.push({
          id: Date.now() + Math.random(),
          msg: `Distributed lock leased on ${al.key} (Token #${al.fence_token || al.fencing_token})`,
          type: 'success',
          time: timeNow,
          read: false,
        });
      });
    }

    if (newNotifs.length > 0) {
      setNotifications(prevList => [...newNotifs, ...prevList].slice(0, 20));
    }

    prevStatusRef.current = status;
  }, [status, term]);

  // Compute search results across tabs, nodes, locks, and actions
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { tabs: [], nodes: [], locks: [], actions: [] };
    const q = searchQuery.toLowerCase().trim();

    const matchedTabs = tabItems.filter(t => t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));

    const matchedNodes = (status?.nodes || []).filter(n => {
      const nid = (n.node_id || n.id || '').toLowerCase();
      const role = (n.role || '').toLowerCase();
      return nid.includes(q) || role.includes(q);
    });

    const matchedLocks = (status?.active_locks || []).filter(l => {
      const key = (l.key || '').toLowerCase();
      const owner = (l.owner || l.holder || '').toLowerCase();
      return key.includes(q) || owner.includes(q);
    });

    const actionList = [
      { id: 'zombie', label: 'Simulate Zombie GC Race', desc: 'Kleppmann storage race verification', action: () => { setActiveTab('terminal'); onSimulateZombie(); } },
      { id: 'election', label: 'Force Leader Election', desc: 'Trigger Raft leader election ripple', action: onForceElection },
      { id: 'heal', label: 'Heal Network Partitions', desc: 'Reconnect all partitioned nodes', action: onHealPartitions },
      { id: 'acquire', label: 'Acquire Distributed Lock', desc: 'Open distributed lock studio', action: () => setActiveTab('locks') },
    ];
    const matchedActions = actionList.filter(a => a.label.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q));

    return { tabs: matchedTabs, nodes: matchedNodes, locks: matchedLocks, actions: matchedActions };
  }, [searchQuery, status, onSimulateZombie, onForceElection, onHealPartitions]);

  // Simple sparkline SVG
  const Sparkline = ({ data, color = 'var(--accent-emerald)', height = 32, width = 120 }) => {
    if (!data || data.length < 2) return <div style={{ width, height }} />;
    const values = data.map(d => d.v);
    const min = Math.min(...values);
    const max = Math.max(...values) || 1;
    const range = max - min || 1;
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // WAL logs from node data
  const walLogs = status?.nodes ? status.nodes.flatMap(n => {
    const entries = [];
    if (n.commit_index > 0) {
      entries.push({ idx: n.commit_index, term: n.current_term, cmd: n.role === 'LEADER' ? 'HEARTBEAT' : 'APPEND_ENTRIES', payload: `${n.node_id} (commit: ${n.commit_index})`, state: 'COMMITTED' });
    }
    return entries;
  }).sort((a, b) => b.idx - a.idx).slice(0, 10) : [
    { idx: 0, term: 1, cmd: 'INIT', payload: 'Cluster initialized', state: 'COMMITTED' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-canvas)', display: 'flex' }}>
      {/* Left Sidebar Dock */}
      <aside className="midday-dock">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <div onClick={() => setActiveTab('overview')} style={{ cursor: 'pointer', padding: '6px' }} title="Quorum Overview">
            <SunburstLogo size={22} color="var(--text-primary)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {tabItems.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`dock-icon-btn ${activeTab === item.id ? 'active' : ''}`} title={item.label}>
                <item.icon size={18} />
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Profile */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowProfileMenu(!showProfileMenu)} style={{ width: '34px', height: '34px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
            SL
          </button>
          {showProfileMenu && (
            <div style={{ position: 'absolute', bottom: '44px', left: '0', width: '180px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '6px', zIndex: 100 }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', fontSize: '12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Sam (SLMobbin)</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>sam@mobbin.design</div>
              </div>
              <button onClick={onSignOut} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '5px', fontSize: '12px', color: '#DC2626', textAlign: 'left' }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEF2F2')} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <LogOut size={13} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ flex: 1, marginLeft: '64px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header Bar */}
        <header style={{ height: '60px', borderBottom: '1px solid var(--border-subtle)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-card)' }}>
          {/* Enhanced Search Bar */}
          <div ref={searchContainerRef} style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '6px 14px',
                width: '340px',
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                boxShadow: showSearchDropdown && searchQuery.trim() ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <Search size={14} color="var(--text-tertiary)" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Find anything... (Ctrl+K)"
                value={searchQuery}
                onFocus={() => setShowSearchDropdown(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    if (searchResults.tabs.length > 0) {
                      setActiveTab(searchResults.tabs[0].id);
                      setShowSearchDropdown(false);
                      setSearchQuery('');
                    } else if (searchResults.actions.length > 0) {
                      searchResults.actions[0].action();
                      setShowSearchDropdown(false);
                      setSearchQuery('');
                    } else if (searchResults.nodes.length > 0) {
                      setActiveTab('topology');
                      setShowSearchDropdown(false);
                      setSearchQuery('');
                    } else if (searchResults.locks.length > 0) {
                      setActiveTab('locks');
                      setShowSearchDropdown(false);
                      setSearchQuery('');
                    }
                  } else if (e.key === 'Escape') {
                    setShowSearchDropdown(false);
                  }
                }}
                style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '13px', color: 'var(--text-primary)', outline: 'none' }}
              />
              <kbd style={{ fontSize: '10px', fontFamily: 'var(--font-sans)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1px 5px', color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-input)' }}>
                ⌘K
              </kbd>
            </div>

            {/* Search Results Dropdown Panel */}
            {showSearchDropdown && searchQuery.trim() && (
              <div
                style={{
                  position: 'absolute',
                  top: '46px',
                  left: 0,
                  width: '380px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 12px 32px -4px rgba(0,0,0,0.14)',
                  zIndex: 200,
                  padding: '8px',
                }}
              >
                {searchResults.tabs.length === 0 &&
                searchResults.nodes.length === 0 &&
                searchResults.locks.length === 0 &&
                searchResults.actions.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                    No results found for "{searchQuery}"
                  </div>
                ) : (
                  <>
                    {/* Tabs */}
                    {searchResults.tabs.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', padding: '4px 8px', letterSpacing: '0.04em' }}>
                          NAVIGATION
                        </div>
                        {searchResults.tabs.map(tab => (
                          <div
                            key={tab.id}
                            onClick={() => {
                              setActiveTab(tab.id);
                              setShowSearchDropdown(false);
                              setSearchQuery('');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--text-primary)',
                              backgroundColor: 'transparent',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <tab.icon size={14} color="var(--accent-emerald)" />
                            <span>{tab.label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Nodes */}
                    {searchResults.nodes.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', padding: '4px 8px', letterSpacing: '0.04em' }}>
                          NODES
                        </div>
                        {searchResults.nodes.map(n => (
                          <div
                            key={n.node_id || n.id}
                            onClick={() => {
                              setActiveTab('topology');
                              setShowSearchDropdown(false);
                              setSearchQuery('');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--text-primary)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Network size={14} color="var(--accent-blue)" />
                              <span style={{ fontWeight: 500 }}>{n.node_id || n.id}</span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{n.role} · Term {n.term || n.current_term}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Locks */}
                    {searchResults.locks.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', padding: '4px 8px', letterSpacing: '0.04em' }}>
                          DISTRIBUTED LOCKS
                        </div>
                        {searchResults.locks.map(l => (
                          <div
                            key={l.key}
                            onClick={() => {
                              setActiveTab('locks');
                              setShowSearchDropdown(false);
                              setSearchQuery('');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--text-primary)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Lock size={14} color="var(--accent-emerald)" />
                              <span>{l.key}</span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{l.owner || l.holder}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick Actions */}
                    {searchResults.actions.length > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', padding: '4px 8px', letterSpacing: '0.04em' }}>
                          ACTIONS
                        </div>
                        {searchResults.actions.map(act => (
                          <div
                            key={act.id}
                            onClick={() => {
                              act.action();
                              setShowSearchDropdown(false);
                              setSearchQuery('');
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--text-primary)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <div style={{ fontWeight: 500 }}>{act.label}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{act.desc}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Live Health Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 500,
                color: (status || wsConnected) ? (isHealthy ? 'var(--accent-emerald)' : 'var(--accent-red)') : 'var(--accent-amber)',
                backgroundColor: (status || wsConnected) ? (isHealthy ? 'var(--accent-emerald-bg)' : 'rgba(220, 38, 38, 0.08)') : 'rgba(217, 119, 6, 0.08)',
                padding: '4px 10px',
                borderRadius: '9999px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: (status || wsConnected) ? (isHealthy ? 'var(--accent-emerald)' : 'var(--accent-red)') : 'var(--accent-amber)',
                  animation: (!status && !wsConnected) ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <span>
                {status || wsConnected
                  ? `${isHealthy ? 'Healthy' : 'Degraded'} · ${aliveNodes}/${totalNodes} Nodes`
                  : 'Connecting to cluster...'}
              </span>
            </div>

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                  position: 'relative',
                  cursor: 'pointer',
                  backgroundColor: showNotifications ? 'var(--bg-subtle)' : 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
                onMouseLeave={(e) => {
                  if (!showNotifications) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Bell size={17} />
                {notifications.some(n => !n.read) && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-emerald)',
                    }}
                  />
                )}
              </button>

              {showNotifications && (
                <div
                  style={{
                    position: 'absolute',
                    top: '42px',
                    right: '0',
                    width: '320px',
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 12px 32px -4px rgba(0,0,0,0.12)',
                    zIndex: 100,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-light)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Cluster Notifications
                    </span>
                    <button
                      onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                      style={{ fontSize: '11px', color: 'var(--accent-emerald)', fontWeight: 500, cursor: 'pointer', background: 'none', border: 'none' }}
                    >
                      Mark all read
                    </button>
                  </div>
                  <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        No cluster notifications
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          style={{
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--border-light)',
                            backgroundColor: n.read ? 'transparent' : 'var(--accent-emerald-bg)',
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'flex-start',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              marginTop: '6px',
                              flexShrink: 0,
                              backgroundColor:
                                n.type === 'success'
                                  ? 'var(--accent-emerald)'
                                  : n.type === 'warn'
                                  ? 'var(--accent-amber)'
                                  : 'var(--accent-blue)',
                            }}
                          />
                          <div>
                            <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{n.msg}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{n.time}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--btn-black)', color: 'var(--btn-black-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600 }}>S</div>
          </div>
        </header>

        {/* Dynamic Body */}
        <main style={{ flex: 1, padding: '40px 48px', maxWidth: '1240px', width: '100%', margin: '0 auto' }}>
          {activeTab === 'overview' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <h1 className="font-serif" style={{ fontSize: '48px', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  Good afternoon, <span style={{ color: 'var(--text-tertiary)' }}>{userName}</span>
                </h1>
                <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                  {isHealthy ? "You're all caught up. Nothing needs your attention right now." : `⚠️ Cluster health degraded — ${aliveNodes}/${totalNodes} nodes online.`}
                </p>
              </div>

              <div style={{ maxWidth: '780px', width: '100%', margin: '0 auto' }}>
                <form onSubmit={handlePromptSubmit} className="midday-command-bar" style={{ position: 'relative' }}>
                  <textarea rows={2} value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="How can I help you today?" style={{ width: '100%', border: 'none', background: 'transparent', resize: 'none', fontSize: '14px', color: 'var(--text-primary)', outline: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-tertiary)' }}>
                      <button type="button" title="Add resource" style={{ color: 'inherit' }}><Plus size={16} /></button>
                      <button type="button" onClick={onSimulateZombie} title="Quick zombie test" style={{ color: 'inherit' }}><Zap size={15} /></button>
                      <button type="button" title="Target node" style={{ color: 'inherit' }}><AtSign size={15} /></button>
                      <button type="button" title="Client link" style={{ color: 'inherit' }}><Link2 size={16} /></button>
                    </div>
                    <button type="submit" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--btn-black)', color: 'var(--btn-black-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s' }}><ArrowUp size={15} /></button>
                  </div>
                </form>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                  <span>Connect apps &gt;</span><span style={{ fontSize: '13px' }}>⚙️ ⚡</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={onSimulateZombie} className="midday-btn-outline" style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}><Zap size={14} color="var(--accent-emerald)" /><span>Zombie Test</span></button>
                <button onClick={() => setActiveTab('locks')} className="midday-btn-outline" style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}><Lock size={14} /><span>Acquire Lock</span></button>
                <button onClick={() => onPartition('node-3')} className="midday-btn-outline" style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}><ShieldAlert size={14} color="var(--accent-amber)" /><span>Simulate Partition</span></button>
                <button onClick={onForceElection} className="midday-btn-outline" style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}><Shuffle size={14} /><span>Force Election</span></button>
                <button onClick={() => setActiveTab('logs')} className="midday-btn-outline" style={{ borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}><FileCode size={14} /><span>Inspect WAL</span></button>
              </div>

              {/* LIVE Metric Cards */}
              {!status && !wsConnected ? (
                <div
                  style={{
                    padding: '36px 24px',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: '12px',
                    backgroundColor: 'var(--bg-card)',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <RefreshCw size={22} className="animate-spin" color="var(--accent-amber)" />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Connecting to Quorum Cluster Daemon...
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Streaming Raft cluster telemetry, fsm states, and active lock leases
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <div className="midday-metric-card" onClick={() => setActiveTab('topology')} style={{ cursor: 'pointer' }}>
                    <div className="midday-metric-label">Cluster Status</div>
                    <div className="midday-metric-value">{aliveNodes}/{totalNodes} Nodes</div>
                    <div className="midday-metric-sub">{isHealthy ? 'All healthy & quorum active' : `${totalNodes - aliveNodes} node(s) down`}</div>
                  </div>
                  <div className="midday-metric-card">
                    <div className="midday-metric-label">Current Term</div>
                    <div className="midday-metric-value">Term {term}</div>
                    <div className="midday-metric-sub">Leader: {leaderId}</div>
                  </div>
                  <div className="midday-metric-card" onClick={() => setActiveTab('metrics')} style={{ cursor: 'pointer' }}>
                    <div className="midday-metric-label">Consensus Latency</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="midday-metric-value">{latencyMs.toFixed(1)}ms</div>
                      <Sparkline data={metricsHistory.latency} color="var(--accent-emerald)" />
                    </div>
                    <div className="midday-metric-sub">Live · gRPC streaming</div>
                  </div>
                  <div className="midday-metric-card" onClick={() => setActiveTab('logs')} style={{ cursor: 'pointer' }}>
                    <div className="midday-metric-label">Committed Logs</div>
                    <div className="midday-metric-value">{commitIndex}</div>
                    <div className="midday-metric-sub">All state machines applied</div>
                  </div>
                  <div className="midday-metric-card" onClick={() => setActiveTab('locks')} style={{ cursor: 'pointer' }}>
                    <div className="midday-metric-label">Active Locks</div>
                    <div className="midday-metric-value">{activeLocks}</div>
                    <div className="midday-metric-sub">0 deadlocks · Fencing verified</div>
                  </div>
                  <div className="midday-metric-card" onClick={() => setActiveTab('terminal')} style={{ cursor: 'pointer' }}>
                    <div className="midday-metric-label">Split-Brain Guard</div>
                    <div className="midday-metric-value">Active</div>
                    <div className="midday-metric-sub">Monotonic fencing tokens</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <div style={{ maxWidth: '340px', padding: '20px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)', backgroundImage: 'radial-gradient(var(--border-subtle) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}><span style={{ fontSize: '18px' }}>🤖</span><span style={{ fontSize: '18px' }}>⚡</span><span style={{ fontSize: '18px' }}>🔒</span><span style={{ fontSize: '18px' }}>🐍</span></div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Use Quorum where you already work</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>Ask questions and simulate failure scenarios without leaving your terminal or stack.</p>
                </div>
              </div>
            </div>

          ) : activeTab === 'metrics' ? (
            /* METRICS TAB */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400, color: 'var(--text-primary)' }}>Metrics & Latency</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Real-time cluster performance monitoring and node-level metrics.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div className="midday-metric-card">
                  <div className="midday-metric-label"><Activity size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />Health</div>
                  <div className="midday-metric-value" style={{ color: isHealthy ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>{isHealthy ? 'HEALTHY' : 'DEGRADED'}</div>
                </div>
                <div className="midday-metric-card">
                  <div className="midday-metric-label"><Cpu size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />Proposals</div>
                  <div className="midday-metric-value">{totalProposals}</div>
                  <div className="midday-metric-sub">{successfulProposals} successful</div>
                </div>
                <div className="midday-metric-card">
                  <div className="midday-metric-label"><Clock size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />Avg Latency</div>
                  <div className="midday-metric-value">{latencyMs.toFixed(1)}ms</div>
                </div>
                <div className="midday-metric-card">
                  <div className="midday-metric-label"><Lock size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />Active Leases</div>
                  <div className="midday-metric-value">{activeLocks}</div>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Node-Level Metrics</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-tertiary)' }}>
                      <th style={{ padding: '10px 16px' }}>Node</th>
                      <th style={{ padding: '10px 16px' }}>Role</th>
                      <th style={{ padding: '10px 16px' }}>Term</th>
                      <th style={{ padding: '10px 16px' }}>Commit Idx</th>
                      <th style={{ padding: '10px 16px' }}>WAL</th>
                      <th style={{ padding: '10px 16px' }}>Lease</th>
                      <th style={{ padding: '10px 16px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(status?.nodes || []).map(node => (
                      <tr key={node.node_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{node.node_id}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px', backgroundColor: node.role === 'LEADER' ? 'var(--accent-emerald-bg)' : 'var(--bg-subtle)', color: node.role === 'LEADER' ? 'var(--accent-emerald)' : 'var(--text-tertiary)' }}>{node.role}</span>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{node.current_term}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{node.commit_index}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{node.active_wal_entries}</td>
                        <td style={{ padding: '10px 16px' }}>
                          {node.leader_lease_active ? <span style={{ color: 'var(--accent-emerald)', fontSize: '12px' }}><CheckCircle size={12} style={{ marginRight: '4px', verticalAlign: '-2px' }} />{node.leader_lease_remaining_ms}ms</span> : <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {node.is_stopped
                            ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-red)', fontSize: '12px' }}><XCircle size={12} /> Stopped</span>
                            : <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-emerald)', fontSize: '12px' }}><CheckCircle size={12} /> Online</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          ) : activeTab === 'topology' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400, color: 'var(--text-primary)' }}>Cluster Topology</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Interactive 5-node Raft consensus graph over bidirectional gRPC streams.</p>
                </div>
                <button onClick={onHealPartitions} className="midday-btn-black" style={{ padding: '8px 18px', fontSize: '13px', borderRadius: '8px' }}>Heal All Partitions</button>
              </div>
              <TopologyView status={status} onKillNode={onKillNode} onRestartNode={onRestartNode} onPartition={onPartition} />
            </div>

          ) : activeTab === 'locks' ? (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400, color: 'var(--text-primary)' }}>Distributed Lock Studio</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Fencing token leases with draining TTL rings and push-based gRPC promotion queue.</p>
              </div>
              <LocksView locks={status?.active_locks || []} onAcquireLock={onAcquireLock} onReleaseLock={onReleaseLock} />
            </div>

          ) : activeTab === 'terminal' ? (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400, color: 'var(--text-primary)' }}>Kleppmann Split-Brain Console</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Martin Kleppmann storage race verification against zombie GC workers.</p>
              </div>
              <TerminalView onRunZombieSim={onSimulateZombie} />
            </div>

          ) : activeTab === 'tools' ? (
            /* TOOLS & CHAOS TAB */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400, color: 'var(--text-primary)' }}>Tools & Chaos Engineering</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Inject failures, simulate partitions, and test cluster resilience.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(217, 119, 6, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={18} color="var(--accent-amber)" /></div>
                    <div><h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Zombie Worker Simulation</h4><p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Test fencing token rejection</p></div>
                  </div>
                  <button onClick={onSimulateZombie} className="midday-btn-black" style={{ width: '100%', padding: '9px', fontSize: '13px', borderRadius: '8px' }}><Zap size={14} /> Run Zombie Test</button>
                </div>
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(220, 38, 38, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><WifiOff size={18} color="var(--accent-red)" /></div>
                    <div><h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Network Partition</h4><p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Isolate node-3 from cluster</p></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => onPartition('node-3')} className="midday-btn-outline" style={{ flex: 1, padding: '9px', fontSize: '13px', borderRadius: '8px' }}><ShieldAlert size={14} /> Partition</button>
                    <button onClick={onHealPartitions} className="midday-btn-outline" style={{ flex: 1, padding: '9px', fontSize: '13px', borderRadius: '8px' }}><Wifi size={14} /> Heal All</button>
                  </div>
                </div>
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--accent-emerald-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shuffle size={18} color="var(--accent-emerald)" /></div>
                    <div><h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Force Leader Election</h4><p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Kill leader to trigger re-election</p></div>
                  </div>
                  <button onClick={onForceElection} className="midday-btn-black" style={{ width: '100%', padding: '9px', fontSize: '13px', borderRadius: '8px' }}><Shuffle size={14} /> Trigger Election</button>
                </div>
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(37, 99, 235, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Power size={18} color="var(--accent-blue)" /></div>
                    <div><h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Node Power Control</h4><p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Kill or restart specific nodes</p></div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(status?.nodes || [{ node_id: 'node-1' }, { node_id: 'node-2' }, { node_id: 'node-3' }, { node_id: 'node-4' }, { node_id: 'node-5' }]).map(n => (
                      <button key={n.node_id} onClick={() => n.is_stopped ? onRestartNode(n.node_id) : onKillNode(n.node_id)} className="midday-btn-outline" style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '6px' }}><Power size={11} /><span>{n.node_id}</span></button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          ) : activeTab === 'settings' ? (
            /* SETTINGS TAB */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400, color: 'var(--text-primary)' }}>Cluster Settings</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Configure Raft consensus parameters, leader lease, and snapshot policies.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16} /> Raft Timing</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div><label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Heartbeat Interval (ms)</label><input type="number" value={settings.heartbeatInterval} onChange={e => setSettings(s => ({...s, heartbeatInterval: +e.target.value}))} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '13px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }} /></div>
                    <div><label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Election Timeout (ms)</label><input type="number" value={settings.electionTimeout} onChange={e => setSettings(s => ({...s, electionTimeout: +e.target.value}))} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '13px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }} /></div>
                    <div><label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Default Lease TTL (ms)</label><input type="number" value={settings.leaseDefaultTtl} onChange={e => setSettings(s => ({...s, leaseDefaultTtl: +e.target.value}))} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '13px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }} /></div>
                  </div>
                </div>
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Sliders size={16} /> Feature Toggles</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {[
                      { key: 'enableLeaderLease', label: 'Leader Lease Read Optimization', desc: 'Serves reads from leader without heartbeat' },
                      { key: 'enablePreVote', label: 'Pre-Vote Protocol', desc: 'Prevents disruptive elections from partitioned nodes' },
                      { key: 'enableAutoSnapshot', label: 'Auto Snapshot', desc: 'Automatically compact WAL at threshold' },
                    ].map(toggle => (
                      <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                        <div><div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{toggle.label}</div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{toggle.desc}</div></div>
                        <button onClick={() => setSettings(s => ({...s, [toggle.key]: !s[toggle.key]}))} style={{ width: '40px', height: '22px', borderRadius: '11px', position: 'relative', cursor: 'pointer', backgroundColor: settings[toggle.key] ? 'var(--accent-emerald)' : 'var(--bg-subtle)', border: '1px solid ' + (settings[toggle.key] ? 'var(--accent-emerald)' : 'var(--border-subtle)'), transition: 'all 0.2s' }}>
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#FFFFFF', position: 'absolute', top: '2px', left: settings[toggle.key] ? '20px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> WAL & Snapshot</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div><label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Max Log Entries</label><input type="number" value={settings.maxLogEntries} onChange={e => setSettings(s => ({...s, maxLogEntries: +e.target.value}))} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '13px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }} /></div>
                    <div><label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Snapshot Threshold</label><input type="number" value={settings.snapshotThreshold} onChange={e => setSettings(s => ({...s, snapshotThreshold: +e.target.value}))} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '13px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }} /></div>
                  </div>
                </div>
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Network size={16} /> Cluster Info</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>Total Nodes</span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalNodes}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>Alive Nodes</span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{aliveNodes}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>Current Leader</span><span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>{leaderId}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>Partitioned</span><span style={{ fontWeight: 600, color: status?.is_partitioned ? 'var(--accent-red)' : 'var(--text-primary)' }}>{status?.is_partitioned ? 'Yes' : 'No'}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>Packet Loss</span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{(status?.packet_loss_rate || 0) * 100}%</span></div>
                  </div>
                </div>
              </div>
            </div>

          ) : (
            /* WAL LOGS TAB */
            <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
              <h2 className="font-serif" style={{ fontSize: '32px', fontWeight: 400, marginBottom: '16px', color: 'var(--text-primary)' }}>Raft WAL &amp; Commit Index Stream</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '10px 12px' }}>Index</th>
                    <th style={{ padding: '10px 12px' }}>Term</th>
                    <th style={{ padding: '10px 12px' }}>Command</th>
                    <th style={{ padding: '10px 12px' }}>Payload</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {walLogs.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>#{row.idx}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{row.term}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>{row.cmd}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{row.payload}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--accent-emerald)', fontWeight: 600 }}>{row.state}</td>
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
