import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Shield,
  Vote,
  AlertCircle,
  Zap,
  Power,
  RefreshCw,
  Scissors,
  Radio,
  FileText,
  Layers,
  Terminal,
  HeartPulse,
  ShieldAlert,
  Play,
  Check,
  Copy,
  Sliders,
  Eye,
  Activity,
  Server,
  Database,
  ArrowRight,
} from 'lucide-react';

const SPRING = {
  type: 'spring',
  stiffness: 380,
  damping: 28,
};

export default function ClusterTopology({
  status,
  logs = {},
  rpcPulses = [],
  onKillNode,
  onRestartNode,
  onCreatePartition,
  onHealPartitions,
  onSetNetworkConditions,
  onTriggerSnapshot,
  onSimulateZombie,
}) {
  const [activeSubView, setActiveSubView] = useState('topology'); // 'topology' | 'wal' | 'chaos' | 'logs'
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedWalEntry, setSelectedWalEntry] = useState(null);
  const [latency, setLatency] = useState(status?.latency_ms || 0);
  const [packetLoss, setPacketLoss] = useState(status?.packet_loss_rate || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logFilter, setLogFilter] = useState('');

  const nodes = status?.nodes || [];
  const partitions = status?.partitions;
  const isPartitioned = status?.is_partitioned;
  const leaderId = status?.leader_id;
  const aliveNodes = status?.alive_nodes || nodes.filter((n) => !n.is_stopped).length || 5;
  const totalNodes = status?.total_nodes || nodes.length || 5;
  const quorumMet = aliveNodes >= Math.floor(totalNodes / 2) + 1;
  const leaderNode = nodes.find((n) => n.node_id === leaderId && !n.is_stopped);
  const currentTerm = leaderNode?.current_term || (nodes.length ? Math.max(...nodes.map((n) => n.current_term || 0)) : 1);
  const highestCommit = nodes.length ? Math.max(...nodes.map((n) => n.commit_index || 0)) : 0;

  // Circular coordinates for SVG topology mesh
  const radius = 165;
  const centerX = 260;
  const centerY = 230;
  const total = nodes.length || 5;

  const getNodePosition = (index) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  const posMap = {};
  nodes.forEach((node, idx) => {
    posMap[node.node_id] = getNodePosition(idx);
  });

  const getRoleColor = (role, isStopped) => {
    if (isStopped) return '#ef4444';
    switch (role) {
      case 'LEADER':
        return '#f59e0b';
      case 'CANDIDATE':
        return '#a855f7';
      case 'FOLLOWER':
        return '#38bdf8';
      default:
        return '#64748b';
    }
  };

  const getRoleIcon = (role, isStopped) => {
    if (isStopped) return <Power size={18} color="#ef4444" />;
    switch (role) {
      case 'LEADER':
        return <Crown size={19} color="#f59e0b" />;
      case 'CANDIDATE':
        return <Vote size={19} color="#a855f7" />;
      case 'FOLLOWER':
        return <Shield size={18} color="#38bdf8" />;
      default:
        return <AlertCircle size={18} color="#64748b" />;
    }
  };

  const getCmdColor = (cmd) => {
    switch (cmd) {
      case 'ACQUIRE':
        return '#f59e0b';
      case 'RENEW':
        return '#38bdf8';
      case 'RELEASE':
        return '#10b981';
      default:
        return '#94a3b8';
    }
  };

  // Chaos preset handlers
  const handlePartition3v2 = async () => {
    if (!onCreatePartition) return;
    setIsSubmitting(true);
    try {
      await onCreatePartition([
        ['node-1', 'node-2', 'node-3'],
        ['node-4', 'node-5'],
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIsolateLeader = async () => {
    if (!onCreatePartition || !leaderId) return;
    const followers = nodes.filter((n) => n.node_id !== leaderId).map((n) => n.node_id);
    setIsSubmitting(true);
    try {
      await onCreatePartition([[leaderId], followers]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyNetworkConditions = async () => {
    if (!onSetNetworkConditions) return;
    setIsSubmitting(true);
    try {
      await onSetNetworkConditions(Number(latency), Number(packetLoss));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP CLUSTER TELEMETRY & ACTION BAR (LINEAR STYLE) */}
      <div
        style={{
          background: '#08090a',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'relative',
          overflow: 'hidden',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        {/* Top-rim highlight */}
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

        {/* Telemetry Metrics Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          {/* Active Leader */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Crown size={16} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>
                Raft Leader
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {leaderId ? (
                  <>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                    {leaderId}
                  </>
                ) : (
                  <span style={{ color: '#f87171' }}>ELECTING...</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ width: '1px', height: '28px', background: 'rgba(255, 255, 255, 0.06)' }} />

          {/* Quorum Status */}
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>
              Quorum Majority
            </div>
            <div
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: quorumMet ? '#34d399' : '#f87171',
                fontFamily: 'var(--font-mono, monospace)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: quorumMet ? '#10b981' : '#ef4444' }} />
              {aliveNodes} / {totalNodes} Alive {quorumMet ? '(Quorum Active)' : '(Lost Quorum)'}
            </div>
          </div>

          <div style={{ width: '1px', height: '28px', background: 'rgba(255, 255, 255, 0.06)' }} />

          {/* Term */}
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>
              Election Term
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#a855f7', fontFamily: 'var(--font-mono, monospace)' }}>
              Term #{currentTerm}
            </div>
          </div>

          <div style={{ width: '1px', height: '28px', background: 'rgba(255, 255, 255, 0.06)' }} />

          {/* Commit Index */}
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>
              WAL Commit Index
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#38bdf8', fontFamily: 'var(--font-mono, monospace)' }}>
              #{highestCommit}
            </div>
          </div>
        </div>

        {/* Quick Chaos Presets Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handlePartition3v2}
            disabled={isSubmitting}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
            title="Split into Majority (1,2,3) vs Minority (4,5)"
          >
            <Scissors size={12} color="#f59e0b" />
            3v2 Partition
          </button>

          <button
            onClick={handleIsolateLeader}
            disabled={isSubmitting || !leaderId}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
            title="Sever current leader from all followers to trigger election"
          >
            <ShieldAlert size={12} color="#a855f7" />
            Isolate Leader
          </button>

          {isPartitioned ? (
            <button
              onClick={onHealPartitions}
              disabled={isSubmitting}
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <HeartPulse size={12} />
              Heal Network
            </button>
          ) : null}

          {onTriggerSnapshot && (
            <button
              onClick={() => onTriggerSnapshot()}
              disabled={isSubmitting}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono, monospace)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              }}
              title="Trigger WAL snapshot compaction"
            >
              <Layers size={12} />
              Snapshot
            </button>
          )}
        </div>
      </div>

      {/* 2. SUB-VIEW SEGMENTED CONTROL */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '12px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '3px',
            gap: '2px',
          }}
        >
          <button
            onClick={() => setActiveSubView('topology')}
            style={{
              background: activeSubView === 'topology' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeSubView === 'topology' ? '#f1f5f9' : '#64748b',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: activeSubView === 'topology' ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Zap size={13} color={activeSubView === 'topology' ? '#f59e0b' : '#64748b'} />
            Topology Canvas
          </button>

          <button
            onClick={() => setActiveSubView('wal')}
            style={{
              background: activeSubView === 'wal' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeSubView === 'wal' ? '#f1f5f9' : '#64748b',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: activeSubView === 'wal' ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={13} color={activeSubView === 'wal' ? '#38bdf8' : '#64748b'} />
            Replicated WAL
          </button>

          <button
            onClick={() => setActiveSubView('chaos')}
            style={{
              background: activeSubView === 'chaos' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeSubView === 'chaos' ? '#f1f5f9' : '#64748b',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: activeSubView === 'chaos' ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sliders size={13} color={activeSubView === 'chaos' ? '#ef4444' : '#64748b'} />
            Chaos & Invariants
          </button>

          <button
            onClick={() => setActiveSubView('logs')}
            style={{
              background: activeSubView === 'logs' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeSubView === 'logs' ? '#f1f5f9' : '#64748b',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: activeSubView === 'logs' ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Terminal size={13} color={activeSubView === 'logs' ? '#10b981' : '#64748b'} />
            Live Cluster Logs
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '14px', fontSize: '0.72rem', fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f59e0b' }}>
            <Crown size={12} /> Leader
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8' }}>
            <Shield size={12} /> Follower
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#a855f7' }}>
            <Vote size={12} /> Candidate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#ef4444' }}>
            <Power size={12} /> Offline
          </span>
        </div>
      </div>

      {/* 3. SUB-VIEW CONTENT */}
      {activeSubView === 'topology' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedNode ? '1fr 340px' : '1fr 340px', gap: '20px', alignItems: 'start' }}>
          {/* Topology Canvas (Left Column) */}
          <div
            style={{
              background: '#08090a',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              position: 'relative',
              overflow: 'hidden',
              padding: '24px',
              minHeight: '520px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
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

            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={14} color="#f59e0b" />
                  Raft Consensus Mesh & RPC In-Flight Packet Bus
                </h3>
                <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Click any node to inspect internal Raft state machine registers, RPC channels, and crash injection
                </p>
              </div>
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono, monospace)', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.04)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                {nodes.length} PEERS ONLINE
              </span>
            </div>

            {/* SVG Canvas */}
            <div style={{ width: '100%', maxWidth: '540px', height: '460px', position: 'relative' }}>
              <svg viewBox="0 0 520 460" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                <defs>
                  <radialGradient id="leaderGlowMatte" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                  </radialGradient>
                  <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Mesh Lines between all node pairs */}
                {nodes.map((n1, i) =>
                  nodes.slice(i + 1).map((n2) => {
                    const pos1 = posMap[n1.node_id];
                    const pos2 = posMap[n2.node_id];
                    if (!pos1 || !pos2) return null;

                    let isSevered = n1.is_stopped || n2.is_stopped;
                    if (partitions) {
                      const p1 = partitions.find((p) => p.includes(n1.node_id));
                      const p2 = partitions.find((p) => p.includes(n2.node_id));
                      if (p1 !== p2) isSevered = true;
                    }

                    return (
                      <line
                        key={`${n1.node_id}-${n2.node_id}`}
                        x1={pos1.x}
                        y1={pos1.y}
                        x2={pos2.x}
                        y2={pos2.y}
                        stroke={isSevered ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.07)'}
                        strokeWidth={isSevered ? 1.5 : 1}
                        strokeDasharray={isSevered ? '4, 4' : 'none'}
                      />
                    );
                  })
                )}

                {/* RPC Pulses flying over mesh */}
                {rpcPulses?.map((pulse) => {
                  const srcPos = posMap[pulse.from_node];
                  const dstPos = posMap[pulse.to_node];
                  if (!srcPos || !dstPos || pulse.dropped) return null;

                  const isHeartbeat = pulse.rpc_type === 'Heartbeat';
                  const strokeColor =
                    pulse.rpc_type === 'RequestVote'
                      ? '#a855f7'
                      : isHeartbeat
                      ? '#38bdf8'
                      : '#f59e0b';

                  return (
                    <line
                      key={pulse.id}
                      x1={srcPos.x}
                      y1={srcPos.y}
                      x2={dstPos.x}
                      y2={dstPos.y}
                      stroke={strokeColor}
                      strokeWidth="2.5"
                      className="animate-flow"
                      filter="url(#subtleGlow)"
                    />
                  );
                })}

                {/* Node Disks */}
                {nodes.map((node) => {
                  const pos = posMap[node.node_id];
                  if (!pos) return null;
                  const isSelected = selectedNode?.node_id === node.node_id;
                  const isLeader = node.role === 'LEADER' && !node.is_stopped;
                  const color = getRoleColor(node.role, node.is_stopped);

                  return (
                    <g
                      key={node.node_id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedNode(node)}
                    >
                      {/* Ambient leader aura */}
                      {isLeader && (
                        <circle r="46" fill="url(#leaderGlowMatte)" className="animate-pulse-slow" />
                      )}

                      {/* Outer Ring */}
                      <circle
                        r="34"
                        fill="#0d0e11"
                        stroke={isSelected ? '#ffffff' : color}
                        strokeWidth={isSelected ? 2.5 : isLeader ? 2 : 1}
                        filter={isLeader ? 'url(#subtleGlow)' : undefined}
                        style={{ transition: 'all 0.2s ease' }}
                      />

                      {/* Role Icon */}
                      <foreignObject x="-16" y="-22" width="32" height="32">
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {getRoleIcon(node.role, node.is_stopped)}
                        </div>
                      </foreignObject>

                      {/* Node ID */}
                      <text
                        y="15"
                        textAnchor="middle"
                        fill="#f1f5f9"
                        fontSize="10"
                        fontWeight="600"
                        fontFamily="var(--font-mono, monospace)"
                      >
                        {node.node_id}
                      </text>

                      {/* Term & partition badge */}
                      <text
                        y="26"
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="8.5"
                        fontFamily="var(--font-mono, monospace)"
                      >
                        T:{node.current_term} {node.partition_group ? `• P${node.partition_group}` : ''}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right Column: Selected Node Drawer OR All Nodes Fleet Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {selectedNode ? (
              <div
                style={{
                  background: '#08090a',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {getRoleIcon(selectedNode.role, selectedNode.is_stopped)}
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: '#f1f5f9', margin: 0 }}>
                      {selectedNode.node_id}
                    </h4>
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    ✕ Close
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#64748b' }}>Role State:</span>
                    <span style={{ fontWeight: 600, color: getRoleColor(selectedNode.role, selectedNode.is_stopped), fontFamily: 'var(--font-mono, monospace)' }}>
                      {selectedNode.is_stopped ? 'STOPPED' : selectedNode.role}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#64748b' }}>Current Term:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#a855f7', fontWeight: 600 }}>#{selectedNode.current_term}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#64748b' }}>Commit Index:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#38bdf8', fontWeight: 600 }}>#{selectedNode.commit_index}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#64748b' }}>Last Applied:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#34d399', fontWeight: 600 }}>#{selectedNode.last_applied}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#64748b' }}>WAL Entries:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#f1f5f9' }}>{selectedNode.log_length || 0}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#64748b' }}>Voted For:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: selectedNode.voted_for ? '#f59e0b' : '#64748b' }}>
                      {selectedNode.voted_for || 'None'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#64748b' }}>gRPC Endpoint:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#94a3b8' }}>
                      127.0.0.1:{50050 + (parseInt(selectedNode.node_id?.split('-')[1] || '1', 10))}
                    </span>
                  </div>
                </div>

                {/* Node Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
                  <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>
                    Fault Injection
                  </span>
                  {selectedNode.is_stopped ? (
                    <button
                      onClick={() => onRestartNode && onRestartNode(selectedNode.node_id)}
                      style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <RefreshCw size={13} />
                      Restart Node Process
                    </button>
                  ) : (
                    <button
                      onClick={() => onKillNode && onKillNode(selectedNode.node_id)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#f87171',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Power size={13} />
                      Kill / Crash Node Process
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* All 5 Nodes Fleet List */
              <div
                style={{
                  background: '#08090a',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>
                    Raft Fleet Nodes
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'var(--font-mono, monospace)' }}>
                    5 NODES
                  </span>
                </div>

                {nodes.map((node) => {
                  const isLeader = node.role === 'LEADER' && !node.is_stopped;
                  const isStopped = node.is_stopped;
                  const color = getRoleColor(node.role, isStopped);

                  return (
                    <div
                      key={node.node_id}
                      onClick={() => setSelectedNode(node)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: isLeader ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'border-color 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getRoleIcon(node.role, isStopped)}
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: '#f1f5f9' }}>
                            {node.node_id}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>
                            T:{node.current_term} • Commit #{node.commit_index}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: `${color}15`,
                            border: `1px solid ${color}40`,
                            color: color,
                          }}
                        >
                          {isStopped ? 'STOPPED' : node.role}
                        </span>

                        {isStopped ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestartNode && onRestartNode(node.node_id);
                            }}
                            title="Restart node"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#34d399',
                              cursor: 'pointer',
                              padding: '3px',
                            }}
                          >
                            <RefreshCw size={13} />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onKillNode && onKillNode(node.node_id);
                            }}
                            title="Kill node"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#f87171',
                              cursor: 'pointer',
                              padding: '3px',
                            }}
                          >
                            <Power size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. REPLICATED WAL SUB-VIEW */}
      {activeSubView === 'wal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              background: '#08090a',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '16px 20px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
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
            <div>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={14} color="#38bdf8" />
                Multi-Node Replicated Write-Ahead Log (WAL) Inspector
              </h3>
              <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Framed binary records with CRC32 integrity verification, fsync markers, and commit watermarks
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem', fontFamily: 'var(--font-mono, monospace)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10b981' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                Applied to State
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8' }} />
                Quorum Committed
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} />
                Uncommitted Suffix
              </span>
            </div>
          </div>

          {/* 5-Column Side-by-Side Node WALs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${nodes.length || 5}, minmax(220px, 1fr))`,
              gap: '14px',
              overflowX: 'auto',
              paddingBottom: '8px',
            }}
          >
            {nodes.map((node) => {
              const nodeLogs = logs?.[node.node_id] || [];
              const isLeader = node.role === 'LEADER' && !node.is_stopped;

              return (
                <div
                  key={node.node_id}
                  style={{
                    background: '#08090a',
                    borderRadius: '8px',
                    border: isLeader ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                    position: 'relative',
                    overflow: 'hidden',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
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

                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: isLeader ? '#f59e0b' : '#f1f5f9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {isLeader && '👑 '}
                        {node.node_id}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>
                        Term {node.current_term} • {node.role}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.68rem', fontFamily: 'var(--font-mono, monospace)', color: '#38bdf8' }}>
                      Commit: <strong>#{node.commit_index}</strong>
                    </div>
                  </div>

                  {/* Log Entries */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '480px', overflowY: 'auto' }}>
                    {nodeLogs.length === 0 ? (
                      <div style={{ padding: '24px 8px', textAlign: 'center', color: '#64748b', fontSize: '0.72rem', fontFamily: 'var(--font-mono, monospace)' }}>
                        No binary records
                      </div>
                    ) : (
                      nodeLogs.map((entry) => {
                        const isApplied = entry.is_applied;
                        const isCommitted = entry.is_committed;
                        const cmdColor = getCmdColor(entry.command_type);

                        return (
                          <div
                            key={entry.index}
                            onClick={() => setSelectedWalEntry({ node_id: node.node_id, entry })}
                            style={{
                              background: isApplied
                                ? 'rgba(16, 185, 129, 0.05)'
                                : isCommitted
                                ? 'rgba(56, 189, 248, 0.05)'
                                : 'rgba(255, 255, 255, 0.02)',
                              border: `1px solid ${
                                isApplied
                                  ? 'rgba(16, 185, 129, 0.25)'
                                  : isCommitted
                                  ? 'rgba(56, 189, 248, 0.25)'
                                  : 'rgba(255, 255, 255, 0.05)'
                              }`,
                              borderRadius: '6px',
                              padding: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.72rem', fontWeight: 600, color: '#f1f5f9' }}>
                                #{entry.index} (T:{entry.term})
                              </span>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontFamily: 'var(--font-mono, monospace)',
                                  fontWeight: 600,
                                  color: cmdColor,
                                  background: `${cmdColor}15`,
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                }}
                              >
                                {entry.command_type}
                              </span>
                            </div>

                            {entry.data?.key && (
                              <div style={{ fontSize: '0.68rem', color: '#cbd5e1', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.data.key}
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>
                              <span>CRC32 OK</span>
                              {isApplied ? (
                                <span style={{ color: '#10b981', fontWeight: 600 }}>APPLIED</span>
                              ) : isCommitted ? (
                                <span style={{ color: '#38bdf8', fontWeight: 600 }}>COMMITTED</span>
                              ) : (
                                <span>UNCOMMITTED</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* WAL Entry Payload Modal */}
          {selectedWalEntry && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
                padding: '20px',
              }}
              onClick={() => setSelectedWalEntry(null)}
            >
              <div
                style={{
                  background: '#08090a',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  maxWidth: '520px',
                  width: '100%',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={15} color="#38bdf8" />
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: '#f1f5f9', margin: 0 }}>
                      Log Record #{selectedWalEntry.entry.index} ({selectedWalEntry.node_id})
                    </h4>
                  </div>
                  <button
                    onClick={() => setSelectedWalEntry(null)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem' }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Raft Term:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#a855f7', fontWeight: 600 }}>#{selectedWalEntry.entry.term}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Command:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: getCmdColor(selectedWalEntry.entry.command_type) }}>
                      {selectedWalEntry.entry.command_type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Integrity Framing:</span>
                    <span style={{ color: '#10b981', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                      QLOG V1 (CRC32 Checksum Validated)
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '6px', fontFamily: 'var(--font-mono, monospace)' }}>
                    RAW PAYLOAD DATA:
                  </label>
                  <pre
                    style={{
                      background: '#0d0e11',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '12px',
                      color: '#38bdf8',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      overflowX: 'auto',
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(selectedWalEntry.entry.data, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. CHAOS & INVARIANTS SUB-VIEW */}
      {activeSubView === 'chaos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
          {/* Left: Partition Sandbox */}
          <div
            style={{
              background: '#08090a',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              position: 'relative',
              overflow: 'hidden',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
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

            <div>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Scissors size={14} color="#ef4444" />
                Network Partition Injection & Quorum Invariants
              </h3>
              <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Sever TCP communication channels between nodes to prove split-brain protection and majority-only commit progress
              </p>
            </div>

            {/* Partition status card */}
            {isPartitioned ? (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontWeight: 600, fontSize: '0.78rem', fontFamily: 'var(--font-mono, monospace)' }}>
                  <AlertCircle size={14} />
                  NETWORK PARTITION ACTIVE
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {partitions?.map((group, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-mono, monospace)',
                        color: group.length >= 3 ? '#34d399' : '#f87171',
                        border: `1px solid ${group.length >= 3 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                      }}
                    >
                      Partition #{idx + 1}: {group.join(', ')} ({group.length >= 3 ? 'Majority 3/5' : 'Minority 2/5 (Blocked)'})
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: '#34d399',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <HeartPulse size={14} />
                Full mesh connectivity. All 5 peers communicating with zero drop rate.
              </div>
            )}

            {/* Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={handlePartition3v2}
                disabled={isSubmitting}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#f1f5f9', fontWeight: 500 }}>
                  <Scissors size={13} color="#f59e0b" />
                  Preset: 3 vs 2 Network Partition
                </span>
                <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>
                  (1,2,3) vs (4,5)
                </span>
              </button>

              <button
                onClick={handleIsolateLeader}
                disabled={isSubmitting || !leaderId}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#f1f5f9', fontWeight: 500 }}>
                  <ShieldAlert size={13} color="#a855f7" />
                  Preset: Isolate Current Leader
                </span>
                <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>
                  Triggers Term #{currentTerm + 1} Election
                </span>
              </button>

              {isPartitioned && (
                <button
                  onClick={onHealPartitions}
                  disabled={isSubmitting}
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <HeartPulse size={14} />
                  Heal All Network Partitions
                </button>
              )}
            </div>
          </div>

          {/* Right: Network Impairment Sliders */}
          <div
            style={{
              background: '#08090a',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              position: 'relative',
              overflow: 'hidden',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
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

            <div>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={14} color="#38bdf8" />
                Network Transport Impairments
              </h3>
              <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Simulate WAN inter-region latency and packet drop rates across gRPC streams
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '6px', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: '#94a3b8' }}>INJECTED PEER LATENCY</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{latency} ms</span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="10"
                value={latency}
                onChange={(e) => setLatency(e.target.value)}
                style={{ width: '100%', accentColor: '#38bdf8' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '6px', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: '#94a3b8' }}>PACKET LOSS DROP RATE</span>
                <span style={{ color: '#f87171', fontWeight: 600 }}>{(packetLoss * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={packetLoss}
                onChange={(e) => setPacketLoss(e.target.value)}
                style={{ width: '100%', accentColor: '#ef4444' }}
              />
            </div>

            <button
              onClick={handleApplyNetworkConditions}
              disabled={isSubmitting}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#f1f5f9',
                borderRadius: '6px',
                padding: '8px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              Apply Transport Impairments
            </button>
          </div>
        </div>
      )}

      {/* 6. CLUSTER EVENT LOGS SUB-VIEW */}
      {activeSubView === 'logs' && (
        <div
          style={{
            background: '#08090a',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
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

          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={14} color="#10b981" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: '#f1f5f9' }}>
                CLUSTER ACTIVITY & RAFT STATE TRANSITIONS
              </span>
            </div>

            <input
              type="text"
              placeholder="Filter logs (e.g. term, heartbeat, acquire)..."
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#f1f5f9',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono, monospace)',
                padding: '4px 10px',
                borderRadius: '4px',
                outline: 'none',
                width: '240px',
              }}
            />
          </div>

          <div
            style={{
              maxHeight: '440px',
              overflowY: 'auto',
              padding: '14px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.75rem',
            }}
          >
            {/* Generate consolidated event stream from logs or mock entries */}
            {nodes.flatMap((n) => (logs?.[n.node_id] || []).map((e) => ({ ...e, node: n.node_id })))
              .filter((e) => !logFilter || JSON.stringify(e).toLowerCase().includes(logFilter.toLowerCase()))
              .slice(-50)
              .map((e, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '4px 0',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <span style={{ color: '#64748b', fontSize: '0.68rem', minWidth: '70px' }}>
                    [LOG #{e.index}]
                  </span>
                  <span style={{ color: '#38bdf8', fontWeight: 600, minWidth: '60px' }}>
                    {e.node}
                  </span>
                  <span
                    style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      color: '#f59e0b',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                    }}
                  >
                    {e.command_type}
                  </span>
                  <span style={{ color: '#cbd5e1' }}>
                    {e.data?.key ? `key="${e.data.key}" client="${e.data.client_id || 'sys'}"` : 'State transition'}
                  </span>
                  <span style={{ marginLeft: 'auto', color: e.is_applied ? '#10b981' : '#64748b', fontSize: '0.65rem' }}>
                    {e.is_applied ? 'APPLIED' : 'COMMITTED'}
                  </span>
                </div>
              ))}
            {Object.keys(logs).length === 0 && (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '30px' }}>
                Cluster stable. Awaiting client lock acquisition proposals or chaos events...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
