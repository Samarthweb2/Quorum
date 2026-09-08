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
        <div className="temporal-badge" style={{ padding: '5px 12px', fontSize: '0.75rem' }}>
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
              width={26} 
              height={26} 
              viewBox="0 0 192 192" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
            >
              <path 
                d="M123.34 68.6596C119.655 41.0484 110.327 18 96 18C81.6731 18 72.3454 41.0484 68.6596 68.6596C41.0484 72.3454 18 81.6731 18 96C18 110.327 41.0525 119.655 68.6596 123.34C72.3454 150.948 81.6731 174 96 174C110.327 174 119.655 150.948 123.34 123.34C150.952 119.655 174 110.327 174 96C174 81.6731 150.948 72.3454 123.34 68.6596ZM67.7583 115.298C41.3151 111.479 25.893 102.737 25.893 96C25.893 89.2629 41.3151 80.5212 67.7583 76.7021C67.1764 83.0674 66.8733 89.566 66.8733 96C66.8733 102.434 67.1764 108.937 67.7583 115.298ZM96 25.893C102.737 25.893 111.479 41.3151 115.298 67.7583C108.937 67.1764 102.434 66.8733 96 66.8733C89.566 66.8733 83.0633 67.1764 76.7021 67.7583C80.5212 41.3151 89.2629 25.893 96 25.893ZM124.242 115.298C122.94 115.488 117.602 116.114 116.252 116.248C116.118 117.602 115.488 122.936 115.302 124.238C111.483 150.681 102.741 166.103 96.0041 166.103C89.267 166.103 80.5253 150.681 76.7061 124.238C76.5202 122.936 75.8898 117.598 75.7564 116.248C75.1421 109.979 74.7703 103.246 74.7703 96C74.7703 88.7537 75.1421 82.0206 75.7564 75.7483C82.0247 75.134 88.7577 74.7622 96.0041 74.7622C103.25 74.7622 109.983 75.134 116.252 75.7483C117.606 75.8817 122.94 76.5121 124.242 76.698C150.685 80.5172 166.111 89.2629 166.111 95.996C166.111 102.729 150.685 111.479 124.242 115.298Z" 
                fill="#FFFFFF" 
              />
            </svg>
            <span style={{ fontSize: '21px', fontWeight: 400, letterSpacing: '-0.02em', color: '#ffffff' }}>
              Quorum
            </span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.65rem', background: 'rgba(124, 92, 252, 0.15)', color: '#c4b5fd', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(124, 92, 252, 0.3)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                CONTROL PLANE
              </span>
            </div>
          </div>
          {onBackToLanding && (
            <button
              onClick={onBackToLanding}
              className="btn-temporal-outline"
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
            className="btn-temporal-ghost"
            style={{ fontSize: '0.75rem', padding: '6px 14px', borderColor: 'rgba(168, 85, 247, 0.4)', color: '#c084fc' }}
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
          style={{ color: activeTab === 'ai-agents' ? '#c084fc' : '#94a3b8', borderBottomColor: activeTab === 'ai-agents' ? '#c084fc' : 'transparent' }}
        >
          <Bot size={16} />
          AI Agent Swarm
          <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
            3 Agents
          </span>
        </button>
      </div>
    </header>
  );
}

