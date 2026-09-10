import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Key, Crown, Clock, User, Zap, AlertTriangle, 
  RotateCcw, Search, CheckCircle2, Play, Pause, RefreshCw,
  Layers, Terminal, Bot, Archive, Plus, X, ChevronRight,
  ExternalLink, Copy, Check, FileText, Activity, Server,
  Sliders, ShieldCheck, Database, GitCommit, ChevronDown,
  Info, AlertCircle, ArrowUpDown
} from 'lucide-react';
import ClusterTopology from './ClusterTopology';
import WalInspector from './WalInspector';
import ChaosSandbox from './ChaosSandbox';
import AiAgentStudio from './AiAgentStudio';
import FailureRecoveryShowcase from './FailureRecoveryShowcase';

// Quorum 3-Tier Layered Brand Logo (Blue Accent)
function QuorumStackLogo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="qBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#00B7C5" />
        </linearGradient>
      </defs>
      <path d="M50 16L84 34L50 52L16 34Z" fill="url(#qBlueGrad)" />
      <path d="M16 48L50 66L84 48L50 56Z" fill="url(#qBlueGrad)" />
      <path d="M16 64L50 82L84 64L50 72Z" fill="url(#qBlueGrad)" />
    </svg>
  );
}

export default function QuorumDashboard({
  status,
  logs,
  rpcPulses,
  wsConnected,
  onAcquireLock,
  onRenewLock,
  onReleaseLock,
  onCreatePartition,
  onHealPartitions,
  onKillNode,
  onRestartNode,
  onSetNetworkConditions,
  onSimulateZombie,
  onTriggerSnapshot,
  onBackToLanding,
}) {
  // Navigation tabs in Quorum sidebar
  const [activeNav, setActiveNav] = useState('leases'); // 'leases' | 'recovery' | 'topology' | 'wal' | 'chaos' | 'ai-agents'
  const [namespace, setNamespace] = useState('default');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'expiring' | 'expired'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('acquired_at');
  const [sortAsc, setSortAsc] = useState(false);
  
  // Real Leases & Nodes fetched from backend APIs
  const [apiLeases, setApiLeases] = useState([]);
  const [apiNodes, setApiNodes] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Selected Lease for Detail Inspector Drawer
  const [selectedLockKey, setSelectedLockKey] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('history'); // 'summary' | 'history' | 'raw'
  const [leaseHistory, setLeaseHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState(null);

  // "Acquire Lease" Modal & Action states
  const [acquireModalOpen, setAcquireModalOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newOwner, setNewOwner] = useState('worker-alpha');
  const [newTtl, setNewTtl] = useState(15);
  
  // Action in-flight loading & feedback states
  const [actionLoading, setActionLoading] = useState({}); // { acquire: bool, renew: bool, release: bool, compact: bool, zombie: bool }
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Fetch real nodes from GET /api/nodes
  const fetchNodes = async () => {
    try {
      const res = await fetch('/api/nodes');
      if (res.ok) {
        const data = await res.json();
        setApiNodes(data);
      }
    } catch {
      // Fall back silently to status.nodes if available
    }
  };

  // Fetch real leases from GET /api/leases
  const fetchLeases = async () => {
    try {
      const res = await fetch('/api/leases');
      if (res.ok) {
        const data = await res.json();
        setApiLeases(data);
      }
    } catch {
      // Fall back silently to status.active_locks
    }
  };

  // Fetch real lease history from GET /api/leases/{key}/history
  const fetchLeaseHistory = async (key) => {
    if (!key) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/leases/${encodeURIComponent(key)}/history`);
      if (res.ok) {
        const data = await res.json();
        setLeaseHistory(data);
      } else {
        setLeaseHistory([]);
      }
    } catch {
      setLeaseHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Initial fetch and poll periodically if socket disconnected
  useEffect(() => {
    fetchNodes();
    fetchLeases();
    const interval = setInterval(() => {
      fetchNodes();
      fetchLeases();
    }, wsConnected ? 4000 : 1500);
    return () => clearInterval(interval);
  }, [wsConnected]);

  // When selectedLockKey changes, fetch its real history
  useEffect(() => {
    if (selectedLockKey) {
      fetchLeaseHistory(selectedLockKey);
    }
  }, [selectedLockKey]);

  // Auto-dismiss feedback banners after 4 seconds
  useEffect(() => {
    if (actionSuccess || actionError) {
      const timer = setTimeout(() => {
        setActionSuccess(null);
        setActionError(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess, actionError]);

  // Combine real API leases with websocket status active_locks
  const activeLocks = useMemo(() => {
    if (apiLeases && apiLeases.length > 0) {
      return apiLeases.map((l) => ({
        key: l.key,
        owner: l.owner_id || l.owner || 'worker-unknown',
        fence_token: l.fencing_token ?? l.fence_token ?? 0,
        acquired_at: l.acquired_at ?? l.granted_at_ms ?? Date.now(),
        expires_at_ms: l.expires_at ?? l.expires_at_ms ?? Date.now(),
        remaining_ttl_ms: l.remaining_ttl_ms ?? 0,
        is_active: l.is_active ?? (l.remaining_ttl_ms > 0)
      }));
    }
    if (status?.active_locks) {
      return status.active_locks.map((l) => ({
        key: l.key,
        owner: l.owner || 'worker-unknown',
        fence_token: l.fence_token || 0,
        acquired_at: l.granted_at_ms || Date.now(),
        expires_at_ms: l.expires_at_ms || Date.now(),
        remaining_ttl_ms: l.remaining_ttl_ms || 0,
        is_active: l.is_active ?? (l.remaining_ttl_ms > 0)
      }));
    }
    return [];
  }, [apiLeases, status]);

  // Auto-select first lock if none currently selected
  useEffect(() => {
    if (activeLocks.length > 0 && !selectedLockKey) {
      setSelectedLockKey(activeLocks[0].key);
    }
  }, [activeLocks, selectedLockKey]);

  const leaderNode = apiNodes.find((n) => n.role === 'leader') || 
                     status?.nodes?.find((n) => n.role === 'LEADER');
  const leaderId = leaderNode?.id || leaderNode?.node_id || status?.leader_id || 'node-2';
  const aliveNodesCount = apiNodes.filter((n) => n.role !== 'offline').length || status?.alive_nodes || 5;
  const totalNodesCount = apiNodes.length || status?.total_nodes || 5;

  // Filter & Sort active leases
  const filteredLocks = useMemo(() => {
    let list = activeLocks.filter((l) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = l.key.toLowerCase().includes(q) || 
                            l.owner.toLowerCase().includes(q) ||
                            String(l.fence_token).includes(q);
      if (!matchesSearch) return false;

      const isExpiringSoon = l.remaining_ttl_ms > 0 && l.remaining_ttl_ms < 5000;
      const isExpired = l.remaining_ttl_ms <= 0;

      if (filterStatus === 'active') return l.remaining_ttl_ms >= 5000;
      if (filterStatus === 'expiring') return isExpiringSoon;
      if (filterStatus === 'expired') return isExpired;
      return true;
    });

    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? (valA - valB) : (valB - valA);
    });

    return list;
  }, [activeLocks, searchQuery, filterStatus, sortField, sortAsc]);

  const selectedLock = activeLocks.find((l) => l.key === selectedLockKey) || activeLocks[0];

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(String(text));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Real POST /api/leases/acquire
  const handleAcquireSubmit = async (e) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setActionLoading((prev) => ({ ...prev, acquire: true }));
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/leases/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKey.trim(),
          owner_id: newOwner.trim(),
          ttl_ms: newTtl * 1000,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`Lease "${newKey.trim()}" successfully acquired with Fencing Token #${data.fence_token}!`);
        setSelectedLockKey(newKey.trim());
        setAcquireModalOpen(false);
        setNewKey('');
        await fetchLeases();
        await fetchLeaseHistory(newKey.trim());
      } else {
        setActionError(data.message || 'Failed to acquire lease from cluster leader.');
      }
    } catch (err) {
      setActionError(`Network error while proposing lease: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, acquire: false }));
    }
  };

  // Real POST /api/leases/{key}/renew
  const handleRenewClick = async (lock) => {
    if (!lock) return;
    setActionLoading((prev) => ({ ...prev, renew: true }));
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/leases/${encodeURIComponent(lock.key)}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: lock.owner,
          fence_token: lock.fence_token,
          ttl_ms: 15000,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`Lease "${lock.key}" renewed for +15s (Token #${data.fence_token}).`);
        await fetchLeases();
        await fetchLeaseHistory(lock.key);
      } else {
        setActionError(data.message || 'Failed to renew lease.');
      }
    } catch (err) {
      setActionError(`Error renewing lease: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, renew: false }));
    }
  };

  // Real POST /api/leases/{key}/release
  const handleReleaseClick = async (lock) => {
    if (!lock) return;
    setActionLoading((prev) => ({ ...prev, release: true }));
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/leases/${encodeURIComponent(lock.key)}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: lock.owner,
          fence_token: lock.fence_token,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`Lease "${lock.key}" successfully released.`);
        await fetchLeases();
        await fetchLeaseHistory(lock.key);
      } else {
        setActionError(data.message || 'Failed to release lease.');
      }
    } catch (err) {
      setActionError(`Error releasing lease: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, release: false }));
    }
  };

  // Real POST /api/admin/compact-wal
  const handleCompactWalClick = async () => {
    setActionLoading((prev) => ({ ...prev, compact: true }));
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/admin/compact-wal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`Raft §7 Snapshot saved on ${data.node_id}! WAL compacted up to index #${data.last_included_index}.`);
        if (onTriggerSnapshot) onTriggerSnapshot();
      } else {
        setActionError(data.message || 'Failed to compact WAL prefix.');
      }
    } catch (err) {
      setActionError(`WAL compaction error: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, compact: false }));
    }
  };

  // Real POST /api/admin/simulate/zombie (explicitly labeled simulation)
  const handleZombieSimClick = async () => {
    setActionLoading((prev) => ({ ...prev, zombie: true }));
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/admin/simulate/zombie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_name: selectedLock ? selectedLock.key : 'production-orders-db' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`Zombie simulation complete! Stale write rejected by storage (Token #${data.token_alpha} < Max #${data.token_beta}).`);
        if (onSimulateZombie) onSimulateZombie('production-orders-db');
      } else {
        setActionError(data.message || 'Simulation execution failed.');
      }
    } catch (err) {
      setActionError(`Simulation call error: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, zombie: false }));
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0C10', color: '#f1f5f9', fontFamily: 'var(--font-sans)' }}>
      
      {/* 1. Quorum Left Navigation Sidebar */}
      <aside className="quorum-sidebar" style={{ width: '260px', borderRight: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column' }}>
        
        {/* Brand Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <QuorumStackLogo size={26} />
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              QUORUM
              <span style={{ fontSize: '0.65rem', background: 'rgba(227, 165, 61, 0.15)', color: '#E3A53D', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(227, 165, 61, 0.3)', fontFamily: 'var(--font-mono)' }}>
                CONTROL PLANE
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
              Cluster: <span style={{ color: '#E3A53D', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>us-east-1 ({aliveNodesCount}/{totalNodesCount} alive)</span>
            </div>
          </div>
        </div>

        {/* Namespace Switcher */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Namespace
          </label>
          <select 
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            style={{ 
              width: '100%', 
              background: '#0f131a', 
              border: '1px solid rgba(255, 255, 255, 0.12)', 
              color: '#f1f5f9', 
              fontSize: '0.8rem', 
              fontWeight: 600, 
              padding: '7px 10px', 
              borderRadius: '6px', 
              outline: 'none',
              fontFamily: 'var(--font-mono)'
            }}
          >
            <option value="default">default (production)</option>
            <option value="payments-service">payments-service</option>
            <option value="ai-swarm-ledger">ai-swarm-ledger</option>
          </select>
        </div>

        {/* Core Navigation Items */}
        <nav style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
          
          <div 
            className={`quorum-nav-item ${activeNav === 'leases' ? 'active' : ''}`}
            onClick={() => setActiveNav('leases')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Key size={16} color={activeNav === 'leases' ? '#3FA796' : '#94a3b8'} />
              <span>Leases & Executions</span>
            </div>
            <span style={{ 
              fontSize: '0.7rem', 
              padding: '1px 6px', 
              borderRadius: '10px', 
              background: activeLocks.length > 0 ? 'rgba(63, 167, 150, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
              color: activeLocks.length > 0 ? '#3FA796' : '#64748b',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)'
            }}>
              {activeLocks.length}
            </span>
          </div>

          <div 
            className={`quorum-nav-item ${activeNav === 'recovery' ? 'active' : ''}`}
            onClick={() => setActiveNav('recovery')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RotateCcw size={16} color={activeNav === 'recovery' ? '#3FA796' : '#94a3b8'} />
              <span>Failure Recovery Lab</span>
            </div>
            <span style={{ fontSize: '0.65rem', background: 'rgba(227, 165, 61, 0.15)', color: '#E3A53D', padding: '1px 5px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
              LAB
            </span>
          </div>

          <div 
            className={`quorum-nav-item ${activeNav === 'topology' ? 'active' : ''}`}
            onClick={() => setActiveNav('topology')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Server size={16} color={activeNav === 'topology' ? '#3FA796' : '#94a3b8'} />
              <span>Nodes & Partitions</span>
            </div>
          </div>

          <div 
            className={`quorum-nav-item ${activeNav === 'wal' ? 'active' : ''}`}
            onClick={() => setActiveNav('wal')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Terminal size={16} color={activeNav === 'wal' ? '#3FA796' : '#94a3b8'} />
              <span>Raft WAL Inspector</span>
            </div>
          </div>

          <div 
            className={`quorum-nav-item ${activeNav === 'chaos' ? 'active' : ''}`}
            onClick={() => setActiveNav('chaos')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sliders size={16} color={activeNav === 'chaos' ? '#3FA796' : '#94a3b8'} />
              <span>Fencing & Chaos Sandbox</span>
            </div>
          </div>

          <div 
            className={`quorum-nav-item ${activeNav === 'ai-agents' ? 'active' : ''}`}
            onClick={() => setActiveNav('ai-agents')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bot size={16} color={activeNav === 'ai-agents' ? '#3FA796' : '#94a3b8'} />
              <span>AI Agent Swarm</span>
            </div>
          </div>

        </nav>

        {/* Sidebar Footer: Back to Landing Page */}
        <div style={{ padding: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(0, 0, 0, 0.2)' }}>
          <button
            onClick={onBackToLanding}
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = '#f1f5f9'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            <span>← Back to Landing Page</span>
          </button>
        </div>

      </aside>

      {/* 2. Main Work Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        {/* Top App Bar with Real Node Stats and Live Stream indicator */}
        <header style={{ 
          height: '56px', 
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)', 
          background: 'rgba(10, 12, 16, 0.95)', 
          backdropFilter: 'blur(10px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '0 24px',
          flexShrink: 0
        }}>
          {/* Breadcrumb path */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
            <span style={{ color: '#64748b' }}>Namespaces</span>
            <span style={{ color: '#475569' }}>/</span>
            <span style={{ color: '#ffffff', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{namespace}</span>
            <span style={{ color: '#475569' }}>/</span>
            <span style={{ color: '#E3A53D', fontWeight: 600 }}>
              {activeNav === 'leases' && 'Executions & Distributed Leases'}
              {activeNav === 'recovery' && 'Interactive Failure Recovery'}
              {activeNav === 'topology' && 'Cluster Nodes & Partitions'}
              {activeNav === 'wal' && 'Raft Write-Ahead Log'}
              {activeNav === 'chaos' && 'Chaos & Fencing Verification'}
              {activeNav === 'ai-agents' && 'AI Agent Swarm Coordination'}
            </span>
          </div>

          {/* Right Header Badges: Real Cluster Leader & Streaming Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Cluster Health Pill */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '4px 10px', 
              borderRadius: '20px', 
              background: 'rgba(63, 167, 150, 0.12)', 
              border: '1px solid rgba(63, 167, 150, 0.3)',
              fontSize: '0.72rem',
              color: '#3FA796',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)'
            }}>
              <Crown size={13} color="#E3A53D" />
              <span>Leader: {leaderId}</span>
              <span style={{ color: '#64748b' }}>•</span>
              <span>{aliveNodesCount}/{totalNodesCount} Healthy</span>
            </div>

            {/* Live Streaming Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: wsConnected ? 'rgba(63, 167, 150, 0.1)' : 'rgba(227, 165, 61, 0.1)',
              border: `1px solid ${wsConnected ? 'rgba(63, 167, 150, 0.3)' : 'rgba(227, 165, 61, 0.3)'}`,
              fontSize: '0.72rem',
              color: wsConnected ? '#3FA796' : '#E3A53D',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)'
            }}>
              <span style={{ 
                width: '7px', 
                height: '7px', 
                borderRadius: '50%', 
                backgroundColor: wsConnected ? '#3FA796' : '#E3A53D',
                boxShadow: wsConnected ? '0 0 8px #3FA796' : '0 0 8px #E3A53D',
                animation: wsConnected ? 'pulse 2s infinite' : 'none'
              }} />
              <span>{wsConnected ? 'LIVE STREAMING' : 'RECONNECTING...'}</span>
            </div>
          </div>
        </header>

        {/* Global Feedback Banners for Real Backend Actions */}
        {actionSuccess && (
          <div style={{ 
            background: 'rgba(63, 167, 150, 0.15)', 
            borderBottom: '1px solid rgba(63, 167, 150, 0.4)', 
            padding: '8px 24px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: '#3FA796',
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease-in-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} style={{ background: 'none', border: 'none', color: '#3FA796', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {actionError && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.15)', 
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)', 
            padding: '8px 24px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: '#EF4444',
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease-in-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tab-driven Content Router */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          
          {/* TAB 1: LEASES & EXECUTIONS TABLE + DETAIL DRAWER */}
          {activeNav === 'leases' && (
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              
              {/* Left/Center Pane: Action Bar & Leases Table */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px 24px' }}>
                
                {/* Action Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
                  
                  {/* Left: Search & Filter Chips */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px' }}>
                    
                    {/* Search Input */}
                    <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
                      <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                      <input 
                        type="text"
                        placeholder="Search key, owner, token..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0f131a',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '7px 10px 7px 32px',
                          fontSize: '0.8rem',
                          color: '#ffffff',
                          outline: 'none',
                          fontFamily: 'var(--font-mono)'
                        }}
                      />
                    </div>

                    {/* Filter Chips */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button 
                        className={`quorum-chip ${filterStatus === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('all')}
                      >
                        All ({activeLocks.length})
                      </button>
                      <button 
                        className={`quorum-chip ${filterStatus === 'active' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('active')}
                      >
                        Active
                      </button>
                      <button 
                        className={`quorum-chip ${filterStatus === 'expiring' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('expiring')}
                      >
                        Expiring Soon
                      </button>
                      <button 
                        className={`quorum-chip ${filterStatus === 'expired' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('expired')}
                      >
                        Expired
                      </button>
                    </div>
                  </div>

                  {/* Right: Real Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    
                    {/* + Acquire Lease Button */}
                    <button
                      onClick={() => setAcquireModalOpen(true)}
                      disabled={actionLoading.acquire}
                      style={{
                        background: '#E3A53D',
                        color: '#0A0C10',
                        border: 'none',
                        padding: '7px 14px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 10px rgba(227, 165, 61, 0.25)',
                        opacity: actionLoading.acquire ? 0.7 : 1,
                      }}
                    >
                      <Plus size={14} strokeWidth={3} />
                      <span>+ Acquire Lease</span>
                    </button>

                    {/* Signal / Renew Button */}
                    <button
                      onClick={() => handleRenewClick(selectedLock)}
                      disabled={!selectedLock || actionLoading.renew}
                      title="Renew active lease via leader with monotonic fencing token"
                      style={{
                        background: 'rgba(63, 167, 150, 0.1)',
                        color: '#3FA796',
                        border: '1px solid rgba(63, 167, 150, 0.35)',
                        padding: '7px 12px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: selectedLock ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: (!selectedLock || actionLoading.renew) ? 0.5 : 1,
                      }}
                    >
                      <RefreshCw size={13} className={actionLoading.renew ? 'spin' : ''} />
                      <span>{actionLoading.renew ? 'Renewing...' : 'Signal / Renew'}</span>
                    </button>

                    {/* Terminate / Release Button */}
                    <button
                      onClick={() => handleReleaseClick(selectedLock)}
                      disabled={!selectedLock || actionLoading.release}
                      title="Release active lease"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        padding: '7px 12px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: selectedLock ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: (!selectedLock || actionLoading.release) ? 0.5 : 1,
                      }}
                    >
                      <X size={13} strokeWidth={2.5} />
                      <span>{actionLoading.release ? 'Releasing...' : 'Terminate'}</span>
                    </button>

                    {/* Compact WAL Button (Real Raft §7 Log Truncation) */}
                    <button
                      onClick={handleCompactWalClick}
                      disabled={actionLoading.compact}
                      title="Trigger Raft §7 state snapshot and compact Write-Ahead-Log"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        color: '#f1f5f9',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        padding: '7px 12px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: actionLoading.compact ? 0.6 : 1,
                      }}
                    >
                      <Archive size={13} />
                      <span>{actionLoading.compact ? 'Compacting...' : 'Compact WAL'}</span>
                    </button>

                    {/* Test Zombie [SIMULATION] */}
                    <button
                      onClick={handleZombieSimClick}
                      disabled={actionLoading.zombie}
                      title="Test harness simulation: demonstrates GC pause, lock expiry, and downstream storage fencing rejection"
                      style={{
                        background: 'rgba(227, 165, 61, 0.08)',
                        color: '#E3A53D',
                        border: '1px solid rgba(227, 165, 61, 0.3)',
                        padding: '7px 12px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: actionLoading.zombie ? 0.6 : 1,
                      }}
                    >
                      <AlertTriangle size={13} />
                      <span>Test Zombie</span>
                      <span style={{ fontSize: '0.62rem', background: 'rgba(227, 165, 61, 0.2)', padding: '1px 4px', borderRadius: '3px', fontFamily: 'var(--font-mono)' }}>
                        SIMULATION
                      </span>
                    </button>

                  </div>
                </div>

                {/* Leases Table Card */}
                <div style={{ 
                  flex: 1, 
                  background: '#0f131a', 
                  border: '1px solid rgba(255, 255, 255, 0.08)', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}>
                  {/* Table Header */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1.8fr 1.2fr 1.2fr 1.8fr 1fr 1fr', 
                    padding: '11px 18px', 
                    background: 'rgba(255, 255, 255, 0.02)', 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748b'
                  }}>
                    <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleSort('key')}>
                      <span>Lease Key</span>
                      <ArrowUpDown size={11} />
                    </div>
                    <div>Owner Client</div>
                    <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleSort('fence_token')}>
                      <span>Fencing Token</span>
                      <ArrowUpDown size={11} />
                    </div>
                    <div>TTL Remaining</div>
                    <div>Status</div>
                    <div style={{ textAlign: 'right' }}>Actions</div>
                  </div>

                  {/* Table Body */}
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredLocks.length === 0 ? (
                      /* Honest Empty State */
                      <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                          <Key size={22} color="#64748b" />
                        </div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' }}>
                          No active leases right now
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', maxWidth: '420px', marginBottom: '18px', lineHeight: 1.5 }}>
                          Distributed locks acquired across the 5-node cluster will appear here with live fencing tokens and renewal heartbeats.
                        </div>
                        <button
                          onClick={() => setAcquireModalOpen(true)}
                          style={{
                            background: '#E3A53D',
                            color: '#0A0C10',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Plus size={14} strokeWidth={3} />
                          <span>+ Acquire First Lease</span>
                        </button>
                      </div>
                    ) : (
                      filteredLocks.map((lock) => {
                        const isSelected = selectedLockKey === lock.key;
                        const isExpiring = lock.remaining_ttl_ms > 0 && lock.remaining_ttl_ms < 5000;
                        const isExpired = lock.remaining_ttl_ms <= 0;
                        const ttlPercentage = Math.min(100, Math.max(0, (lock.remaining_ttl_ms / 15000) * 100));

                        return (
                          <div 
                            key={lock.key}
                            className={`quorum-table-row ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedLockKey(lock.key)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.8fr 1.2fr 1.2fr 1.8fr 1fr 1fr',
                              padding: '13px 18px',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                              alignItems: 'center',
                              fontSize: '0.82rem',
                            }}
                          >
                            {/* Key Name */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                              <Key size={14} color={isSelected ? '#3FA796' : '#64748b'} style={{ flexShrink: 0 }} />
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {lock.key}
                              </span>
                            </div>

                            {/* Owner */}
                            <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <User size={13} color="#64748b" />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{lock.owner}</span>
                            </div>

                            {/* Fencing Token */}
                            <div>
                              <span style={{ 
                                background: 'rgba(227, 165, 61, 0.12)', 
                                color: '#E3A53D', 
                                border: '1px solid rgba(227, 165, 61, 0.3)',
                                padding: '2px 8px', 
                                borderRadius: '4px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                fontSize: '0.78rem'
                              }}>
                                #{lock.fence_token}
                              </span>
                            </div>

                            {/* TTL Countdown Bar */}
                            <div style={{ paddingRight: '20px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                                <span style={{ color: isExpired ? '#EF4444' : isExpiring ? '#E3A53D' : '#3FA796' }}>
                                  {isExpired ? 'Expired' : `${(lock.remaining_ttl_ms / 1000).toFixed(1)}s left`}
                                </span>
                              </div>
                              <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ 
                                  width: `${ttlPercentage}%`, 
                                  height: '100%', 
                                  background: isExpired ? '#EF4444' : isExpiring ? '#E3A53D' : '#3FA796',
                                  transition: 'width 0.4s linear'
                                }} />
                              </div>
                            </div>

                            {/* Status Pill */}
                            <div>
                              {isExpired ? (
                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontWeight: 600 }}>
                                  EXPIRED
                                </span>
                              ) : isExpiring ? (
                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(227, 165, 61, 0.15)', color: '#E3A53D', fontWeight: 600 }}>
                                  EXPIRING
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(63, 167, 150, 0.15)', color: '#3FA796', fontWeight: 600 }}>
                                  ACTIVE
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleCopy(lock.fence_token, `tok-${lock.key}`); }}
                                title="Copy Fencing Token"
                                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                              >
                                {copiedId === `tok-${lock.key}` ? <Check size={14} color="#3FA796" /> : <Copy size={14} />}
                              </button>
                              <ChevronRight size={16} color={isSelected ? '#3FA796' : '#475569'} />
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Table Footer Stats */}
                  <div style={{ 
                    padding: '9px 18px', 
                    background: 'rgba(0, 0, 0, 0.25)', 
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: '0.72rem',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    <span>Showing {filteredLocks.length} of {activeLocks.length} leases</span>
                    <span>Consensus Term: #{status?.term || 1} • Leader: {leaderId}</span>
                  </div>

                </div>

              </div>

              {/* Right Pane: Detail View Drawer (Summary, Event History, Raw State) */}
              <div style={{ 
                width: '380px', 
                background: '#0A0C10', 
                borderLeft: '1px solid rgba(255, 255, 255, 0.08)', 
                display: 'flex', 
                flexDirection: 'column',
                flexShrink: 0
              }}>
                {selectedLock ? (
                  <>
                    {/* Drawer Header */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                          Lease Inspector
                        </span>
                        <span style={{ 
                          fontSize: '0.68rem', 
                          background: 'rgba(227, 165, 61, 0.15)', 
                          color: '#E3A53D', 
                          padding: '1px 6px', 
                          borderRadius: '4px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700
                        }}>
                          TOKEN #{selectedLock.fence_token}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                        {selectedLock.key}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Client:</span>
                        <span style={{ color: '#f1f5f9', fontFamily: 'var(--font-mono)' }}>{selectedLock.owner}</span>
                      </div>
                    </div>

                    {/* Drawer Tabs: Summary / Event History / Raw State */}
                    <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: '#0f131a' }}>
                      <button 
                        onClick={() => setInspectorTab('summary')}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          background: 'none',
                          border: 'none',
                          borderBottom: inspectorTab === 'summary' ? '2px solid #E3A53D' : '2px solid transparent',
                          color: inspectorTab === 'summary' ? '#E3A53D' : '#64748b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Summary
                      </button>
                      <button 
                        onClick={() => setInspectorTab('history')}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          background: 'none',
                          border: 'none',
                          borderBottom: inspectorTab === 'history' ? '2px solid #3FA796' : '2px solid transparent',
                          color: inspectorTab === 'history' ? '#3FA796' : '#64748b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Event History ({leaseHistory.length})
                      </button>
                      <button 
                        onClick={() => setInspectorTab('raw')}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          background: 'none',
                          border: 'none',
                          borderBottom: inspectorTab === 'raw' ? '2px solid #3FA796' : '2px solid transparent',
                          color: inspectorTab === 'raw' ? '#3FA796' : '#64748b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Raw State
                      </button>
                    </div>

                    {/* Drawer Content */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                      
                      {/* TAB: SUMMARY */}
                      {inspectorTab === 'summary' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          
                          {/* Fencing Monotonic Guarantee Card */}
                          <div style={{ background: 'rgba(227, 165, 61, 0.06)', border: '1px solid rgba(227, 165, 61, 0.25)', borderRadius: '6px', padding: '12px' }}>
                            <div style={{ fontSize: '0.72rem', color: '#E3A53D', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                              Strictly Monotonic Guarantee
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                              Token #{selectedLock.fence_token} is verified greater than all previously issued tokens for "{selectedLock.key}". Downstream storage rejects any write with a lesser token.
                            </div>
                          </div>

                          {/* TTL Meter Card */}
                          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '12px' }}>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                              Lease TTL Status
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: selectedLock.remaining_ttl_ms > 0 ? '#3FA796' : '#EF4444', fontFamily: 'var(--font-mono)' }}>
                              {(selectedLock.remaining_ttl_ms / 1000).toFixed(2)}s
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                              Expires at: {new Date(selectedLock.expires_at_ms).toLocaleTimeString()}
                            </div>
                          </div>

                          {/* Actions Inside Drawer */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                              onClick={() => handleRenewClick(selectedLock)}
                              disabled={actionLoading.renew}
                              style={{
                                flex: 1,
                                background: 'rgba(63, 167, 150, 0.12)',
                                border: '1px solid rgba(63, 167, 150, 0.35)',
                                color: '#3FA796',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <RefreshCw size={13} className={actionLoading.renew ? 'spin' : ''} />
                              <span>{actionLoading.renew ? 'Renewing...' : 'Renew (+15s)'}</span>
                            </button>
                            <button
                              onClick={() => handleReleaseClick(selectedLock)}
                              disabled={actionLoading.release}
                              style={{
                                flex: 1,
                                background: 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                color: '#EF4444',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <X size={13} />
                              <span>{actionLoading.release ? 'Releasing...' : 'Release'}</span>
                            </button>
                          </div>

                        </div>
                      )}

                      {/* TAB: EVENT HISTORY (Real Git-Tree Vertical Timeline) */}
                      {inspectorTab === 'history' && (
                        <div>
                          {isLoadingHistory ? (
                            <div style={{ padding: '30px 0', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                              Loading real event history from cluster...
                            </div>
                          ) : leaseHistory.length === 0 ? (
                            <div style={{ padding: '30px 0', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                              No events recorded yet for this key.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                              {leaseHistory.map((ev, idx) => {
                                const isExpanded = expandedEventId === ev.event_id;
                                const isLast = idx === leaseHistory.length - 1;

                                return (
                                  <div key={ev.event_id} style={{ display: 'flex', gap: '12px' }}>
                                    
                                    {/* Timeline Left Connector */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px' }}>
                                      <div style={{ 
                                        width: '10px', 
                                        height: '10px', 
                                        borderRadius: '50%', 
                                        background: ev.event_type.includes('RELEASE') ? '#EF4444' : ev.event_type.includes('RENEW') ? '#3FA796' : '#E3A53D',
                                        marginTop: '4px',
                                        boxShadow: '0 0 6px rgba(227, 165, 61, 0.4)'
                                      }} />
                                      {!isLast && (
                                        <div style={{ flex: 1, width: '2px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />
                                      )}
                                    </div>

                                    {/* Timeline Right Content Card */}
                                    <div style={{ flex: 1, paddingBottom: isLast ? '10px' : '18px' }}>
                                      <div 
                                        onClick={() => setExpandedEventId(isExpanded ? null : ev.event_id)}
                                        style={{ 
                                          background: isExpanded ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                                          border: '1px solid rgba(255, 255, 255, 0.08)',
                                          borderRadius: '6px',
                                          padding: '8px 10px',
                                          cursor: 'pointer',
                                          transition: 'all 0.15s ease'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                          <span style={{ 
                                            fontSize: '0.72rem', 
                                            fontWeight: 700, 
                                            color: ev.event_type.includes('RELEASE') ? '#EF4444' : ev.event_type.includes('RENEW') ? '#3FA796' : '#E3A53D',
                                            fontFamily: 'var(--font-mono)' 
                                          }}>
                                            #{ev.event_id} {ev.event_type}
                                          </span>
                                          <span style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                                            {new Date(ev.timestamp_ms).toLocaleTimeString()}
                                          </span>
                                        </div>

                                        <div style={{ fontSize: '0.75rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span>Client: <code style={{ color: '#E3A53D' }}>{ev.owner_id}</code></span>
                                          <span>Token: <code style={{ color: '#3FA796' }}>#{ev.fence_token}</code></span>
                                        </div>

                                        {/* Expandable JSON details */}
                                        {isExpanded && ev.details && (
                                          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                            <pre style={{ 
                                              fontSize: '0.68rem', 
                                              fontFamily: 'var(--font-mono)', 
                                              background: '#06080d', 
                                              padding: '8px', 
                                              borderRadius: '4px', 
                                              overflowX: 'auto',
                                              color: '#94a3b8',
                                              margin: 0
                                            }}>
                                              {JSON.stringify(ev.details, null, 2)}
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* TAB: RAW STATE */}
                      {inspectorTab === 'raw' && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                            <button
                              onClick={() => handleCopy(JSON.stringify(selectedLock, null, 2), 'raw-json')}
                              style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#94a3b8',
                                fontSize: '0.72rem',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {copiedId === 'raw-json' ? <Check size={12} color="#3FA796" /> : <Copy size={12} />}
                              <span>{copiedId === 'raw-json' ? 'Copied' : 'Copy JSON'}</span>
                            </button>
                          </div>
                          <pre style={{ 
                            background: '#06080d', 
                            border: '1px solid rgba(255, 255, 255, 0.08)', 
                            borderRadius: '6px', 
                            padding: '12px', 
                            fontSize: '0.72rem', 
                            fontFamily: 'var(--font-mono)',
                            color: '#3FA796',
                            overflowX: 'auto',
                            lineHeight: 1.5,
                            margin: 0
                          }}>
                            {JSON.stringify(selectedLock, null, 2)}
                          </pre>
                        </div>
                      )}

                    </div>
                  </>
                ) : (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    Select a lease row to view its details and Git-tree history.
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: INTERACTIVE FAILURE RECOVERY LAB */}
          {activeNav === 'recovery' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <FailureRecoveryShowcase />
            </div>
          )}

          {/* TAB 3: CLUSTER TOPOLOGY & PARTITIONS */}
          {activeNav === 'topology' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <ClusterTopology 
                status={status}
                onKillNode={onKillNode}
                onRestartNode={onRestartNode}
                onCreatePartition={onCreatePartition}
                onHealPartitions={onHealPartitions}
              />
            </div>
          )}

          {/* TAB 4: RAFT WAL INSPECTOR */}
          {activeNav === 'wal' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <WalInspector 
                logs={logs}
                status={status}
                onTriggerSnapshot={onTriggerSnapshot}
              />
            </div>
          )}

          {/* TAB 5: CHAOS SANDBOX & FENCING */}
          {activeNav === 'chaos' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <ChaosSandbox 
                status={status}
                onCreatePartition={onCreatePartition}
                onHealPartitions={onHealPartitions}
                onKillNode={onKillNode}
                onRestartNode={onRestartNode}
                onSetNetworkConditions={onSetNetworkConditions}
                onSimulateZombie={onSimulateZombie}
              />
            </div>
          )}

          {/* TAB 6: AI AGENT SWARM COORDINATOR */}
          {activeNav === 'ai-agents' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <AiAgentStudio />
            </div>
          )}

        </div>

      </main>

      {/* "Acquire Lease" Modal */}
      {acquireModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <div style={{
            width: '440px',
            background: '#0f131a',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} color="#E3A53D" />
                <span>Acquire Distributed Lease</span>
              </div>
              <button 
                onClick={() => setAcquireModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAcquireSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Lease Key / Resource ID
                </label>
                <input 
                  type="text"
                  placeholder="e.g. payments-orders-writer"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    background: '#06080d',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    color: '#f1f5f9',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Owner / Client Identifier
                </label>
                <input 
                  type="text"
                  placeholder="e.g. worker-alpha"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: '#06080d',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    color: '#f1f5f9',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  TTL Duration: {newTtl} seconds
                </label>
                <input 
                  type="range"
                  min={3}
                  max={60}
                  value={newTtl}
                  onChange={(e) => setNewTtl(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#E3A53D' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setAcquireModalOpen(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading.acquire || !newKey.trim()}
                  style={{
                    background: '#E3A53D',
                    color: '#0A0C10',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: (actionLoading.acquire || !newKey.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (actionLoading.acquire || !newKey.trim()) ? 0.6 : 1
                  }}
                >
                  {actionLoading.acquire ? 'Acquiring...' : 'Propose to Quorum'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
