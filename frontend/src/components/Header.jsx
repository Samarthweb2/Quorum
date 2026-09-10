import React from 'react';
import { Crown, Shield, Activity, Radio, AlertTriangle, Layers, Zap, Bot } from 'lucide-react';


export default function Header({ status, wsConnected, activeTab, setActiveTab, onSimulateZombie, onBackToLanding }) {
  const health = status?.health || 'CONNECTING';
  const leaderId = status?.leader_id;
  const aliveNodes = status?.alive_nodes || 0;
  const totalNodes = status?.total_nodes || 5;
  const isPartitioned = status?.is_partitioned;

  const getHealthBadge = () => {
    if (!wsConnected) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '5px 12px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.3)', fontFamily: 'var(--font-mono)' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span>
          DISCONNECTED
        </div>
      );
    }
    if (health === 'HEALTHY') {
      return (
        <div className="quorum-badge" style={{ padding: '5px 12px', fontSize: '0.75rem' }}>
          <span className="radar-dot"></span>
          CLUSTER HEALTHY ({aliveNodes}/{totalNodes})
        </div>
      );
    }
    if (health === 'PARTITIONED') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '5px 12px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.3)', fontFamily: 'var(--font-mono)' }}>
          <AlertTriangle size={12} />
          NETWORK PARTITIONED
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '5px 12px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid rgba(245, 158, 11, 0.3)', fontFamily: 'var(--font-mono)' }}>
        <Activity size={12} className="animate-spin" />
        {health}
      </div>
    );
  };

  return (
    <header style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(6, 8, 13, 0.9)', backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Brand & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div 
            onClick={onBackToLanding}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: onBackToLanding ? 'pointer' : 'default' }}
            title="Return to Landing Page"
          >
            <svg 
              width={28} 
              height={28} 
              viewBox="0 0 100 100" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
            >
              <circle cx="50" cy="22" r="14" fill="#0284C7" />
              <circle cx="22" cy="74" r="14" fill="#00B7C5" />
              <circle cx="78" cy="74" r="14" fill="#00B7C5" />
              <line x1="50" y1="22" x2="22" y2="74" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
              <line x1="50" y1="22" x2="78" y2="74" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
              <line x1="22" y1="74" x2="78" y2="74" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
              <circle cx="50" cy="22" r="6" fill="#0F172A" />
              <circle cx="22" cy="74" r="6" fill="#0F172A" />
              <circle cx="78" cy="74" r="6" fill="#0F172A" />
            </svg>
            <span style={{ fontSize: '21px', fontWeight: 400, letterSpacing: '-0.02em', color: '#ffffff' }}>
              Quorum
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.65rem', background: 'rgba(2, 132, 199, 0.15)', color: '#0284C7', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(2, 132, 199, 0.3)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                CONTROL PLANE
              </span>
            </div>
          </div>
          {onBackToLanding && (
            <button
              onClick={onBackToLanding}
              className="btn-quorum-outline"
              style={{ fontSize: '0.75rem', padding: '6px 14px', marginLeft: '12px' }}
            >
              ← Landing Page
            </button>
          )}
        </div>

        {/* Global Cluster Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {getHealthBadge()}

          {/* Current Leader */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(14, 18, 28, 0.85)', padding: '6px 14px', borderRadius: '100px', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: '#64748b' }}>LEADER:</span>
            {leaderId ? (
              <span style={{ color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Crown size={14} />
                {leaderId}
              </span>
            ) : (
              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Electing...</span>
            )}
          </div>

          {/* Total Operations */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(14, 18, 28, 0.85)', padding: '6px 14px', borderRadius: '100px', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
            <Zap size={14} color="#00f2aa" />
            <span style={{ color: '#64748b' }}>PROPOSALS:</span>
            <span style={{ fontWeight: 700, color: '#f1f5f9' }}>
              {status?.successful_proposals || 0} / {status?.total_proposals || 0}
            </span>
          </div>

          {/* Zombie Simulator Quick Trigger */}
          <button 
            onClick={onSimulateZombie}
            className="btn-quorum-ghost"
            style={{ fontSize: '0.75rem', padding: '6px 14px', borderColor: 'rgba(2, 132, 199, 0.4)', color: '#0284C7' }}
            title="Demonstrate Fencing Token protection against zombie workers"
          >
            <Shield size={14} />
            Test Zombie Worker
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0 24px', display: 'flex', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
        <button 
          className={`tab-btn ${activeTab === 'topology' ? 'active' : ''}`}
          onClick={() => setActiveTab('topology')}
          style={{ color: activeTab === 'topology' ? '#00f2aa' : '#94a3b8', borderBottomColor: activeTab === 'topology' ? '#00f2aa' : 'transparent' }}
        >
          <Activity size={16} />
          Consensus Topology
        </button>
        <button 
          className={`tab-btn ${activeTab === 'locks' ? 'active' : ''}`}
          onClick={() => setActiveTab('locks')}
          style={{ color: activeTab === 'locks' ? '#00f2aa' : '#94a3b8', borderBottomColor: activeTab === 'locks' ? '#00f2aa' : 'transparent' }}
        >
          <Shield size={16} />
          Lock Studio
          {status?.active_locks?.length > 0 && (
            <span style={{ background: 'rgba(0, 242, 170, 0.2)', color: '#00f2aa', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
              {status.active_locks.length}
            </span>
          )}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'wal' ? 'active' : ''}`}
          onClick={() => setActiveTab('wal')}
          style={{ color: activeTab === 'wal' ? '#00f2aa' : '#94a3b8', borderBottomColor: activeTab === 'wal' ? '#00f2aa' : 'transparent' }}
        >
          <Layers size={16} />
          Replicated WAL
        </button>
        <button 
          className={`tab-btn ${activeTab === 'chaos' ? 'active' : ''}`}
          onClick={() => setActiveTab('chaos')}
          style={{ color: activeTab === 'chaos' ? '#00f2aa' : '#94a3b8', borderBottomColor: activeTab === 'chaos' ? '#00f2aa' : 'transparent' }}
        >
          <AlertTriangle size={16} />
          Chaos & Partitions
          {isPartitioned && (
            <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
              Active
            </span>
          )}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'ai-agents' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai-agents')}
          style={{ color: activeTab === 'ai-agents' ? '#0284C7' : '#94a3b8', borderBottomColor: activeTab === 'ai-agents' ? '#0284C7' : 'transparent' }}
        >
          <Bot size={16} />
          AI Agent Swarm
          <span style={{ background: 'rgba(2, 132, 199, 0.2)', color: '#0284C7', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
            3 Agents
          </span>
        </button>
      </div>
    </header>
  );
}

