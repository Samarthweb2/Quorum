import React from 'react';
import { Crown, Shield, Activity, Zap, Bot, FileTerminal, ArrowLeft } from 'lucide-react';

export default function Header({
  status,
  wsConnected,
  activeTab,
  setActiveTab,
  onBackToLanding,
}) {
  const health = status?.health || 'CONNECTING';
  const leaderId = status?.leader_id;
  const aliveNodes = status?.alive_nodes || 0;
  const totalNodes = status?.total_nodes || 5;
  const isPartitioned = status?.is_partitioned;

  const getHealthBadge = () => {
    if (!wsConnected) {
      return (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 600,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#f87171',
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
          DISCONNECTED
        </div>
      );
    }
    if (health === 'HEALTHY') {
      return (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 600,
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.22)',
            color: '#34d399',
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
          HEALTHY ({aliveNodes}/{totalNodes})
        </div>
      );
    }
    if (health === 'PARTITIONED') {
      return (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 600,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
          PARTITIONED
        </div>
      );
    }
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '0.72rem',
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 600,
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          color: '#fbbf24',
        }}
      >
        <Activity size={12} className="animate-spin" />
        {health}
      </div>
    );
  };

  // Simplified 3 Core Views + Secondary AI Swarm Toggle
  const tabs = [
    {
      id: 'cluster',
      label: 'Cluster & Nodes',
      icon: <Activity size={14} />,
      badge: isPartitioned ? 'Partitioned' : null,
      badgeDanger: true,
    },
    {
      id: 'locks',
      label: 'Locks & Queues',
      icon: <Shield size={14} />,
      badge: status?.active_locks?.length > 0 ? status.active_locks.length : null,
    },
    {
      id: 'zombie',
      label: 'Zombie Lab',
      icon: <FileTerminal size={14} />,
      badgeLabel: 'KLEPPMANN',
    },
    {
      id: 'ai-agents',
      label: 'AI Swarm',
      icon: <Bot size={14} />,
      badgeLabel: '3 AGENTS',
      isSecondary: true,
    },
  ];

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: '#08090a',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* 1px Top-Rim Gradient Highlight */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Bar: Brand, Stats, Navigation */}
      <div
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        {/* Brand Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            onClick={onBackToLanding}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              cursor: onBackToLanding ? 'pointer' : 'default',
            }}
            title="Return to Landing Page"
          >
            <svg
              width={24}
              height={24}
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
            >
              <circle cx="50" cy="22" r="14" fill="#0284C7" />
              <circle cx="22" cy="74" r="14" fill="#00B7C5" />
              <circle cx="78" cy="74" r="14" fill="#00B7C5" />
              <line x1="50" y1="22" x2="22" y2="74" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="5" strokeLinecap="round" />
              <line x1="50" y1="22" x2="78" y2="74" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="5" strokeLinecap="round" />
              <line x1="22" y1="74" x2="78" y2="74" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="5" strokeLinecap="round" />
              <circle cx="50" cy="22" r="5" fill="#FFFFFF" />
              <circle cx="22" cy="74" r="5" fill="#FFFFFF" />
              <circle cx="78" cy="74" r="5" fill="#FFFFFF" />
            </svg>
            <span
              style={{
                fontSize: '1.05rem',
                fontWeight: 600,
                letterSpacing: '-0.025em',
                color: '#f8fafc',
              }}
            >
              Quorum
            </span>
          </div>

          <span
            style={{
              fontSize: '0.62rem',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 700,
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#94a3b8',
              padding: '2px 7px',
              borderRadius: '3px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              letterSpacing: '0.06em',
            }}
          >
            CONTROL PLANE
          </span>

          {onBackToLanding && (
            <button
              onClick={onBackToLanding}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                borderRadius: '4px',
                fontSize: '0.72rem',
                padding: '4px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono, monospace)',
                transition: 'all 0.15s ease',
              }}
            >
              <ArrowLeft size={12} />
              Landing
            </button>
          )}
        </div>

        {/* Global Cluster Stats Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {getHealthBadge()}

          {/* Current Leader */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <span style={{ color: '#64748b' }}>LEADER:</span>
            {leaderId ? (
              <span style={{ color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Crown size={12} />
                {leaderId}
              </span>
            ) : (
              <span style={{ color: '#64748b', fontStyle: 'italic' }}>Electing...</span>
            )}
          </div>

          {/* Total Operations */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <Zap size={12} color="#10b981" />
            <span style={{ color: '#64748b' }}>COMMITS:</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
              {status?.successful_proposals || 0} / {status?.total_proposals || 0}
            </span>
          </div>

          {/* Fast Switch to Zombie Lab */}
          <button
            onClick={() => setActiveTab('zombie')}
            style={{
              background: activeTab === 'zombie' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              color: activeTab === 'zombie' ? '#38bdf8' : '#cbd5e1',
              border: `1px solid ${activeTab === 'zombie' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
              borderRadius: '4px',
              fontSize: '0.72rem',
              padding: '4px 11px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            title="Open the interactive Kleppmann Fencing Terminal"
          >
            <Shield size={12} />
            Zombie Test
          </button>
        </div>
      </div>

      {/* Tabs Row (Clean 3-View Linear Style) */}
      <div
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          gap: '4px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          overflowX: 'auto',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                padding: '10px 14px',
                color: isActive ? '#f8fafc' : '#94a3b8',
                fontSize: '0.78rem',
                fontWeight: isActive ? 600 : 500,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: isActive ? '#38bdf8' : '#64748b' }}>{tab.icon}</span>
              <span>{tab.label}</span>

              {tab.badge && (
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontWeight: 700,
                    background: tab.badgeDanger ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.1)',
                    color: tab.badgeDanger ? '#f87171' : '#38bdf8',
                    border: `1px solid ${tab.badgeDanger ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.2)'}`,
                  }}
                >
                  {tab.badge}
                </span>
              )}

              {tab.badgeLabel && !tab.badge && (
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  {tab.badgeLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
}
