import React, { useState } from 'react';
import { Crown, Shield, Vote, AlertCircle, Zap, Power, RefreshCw } from 'lucide-react';

export default function ClusterTopology({ status, rpcPulses, onKillNode, onRestartNode }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const nodes = status?.nodes || [];
  const partitions = status?.partitions;

  // Compute circular coordinates for 5 nodes
  const radius = 170;
  const centerX = 260;
  const centerY = 240;
  const total = nodes.length || 5;

  const getNodePosition = (index) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  // Node position map
  const posMap = {};
  nodes.forEach((node, idx) => {
    posMap[node.node_id] = getNodePosition(idx);
  });

  const getRoleColor = (role, isStopped) => {
    if (isStopped) return '#ef4444';
    switch (role) {
      case 'LEADER': return 'var(--color-leader)';
      case 'CANDIDATE': return 'var(--color-candidate)';
      case 'FOLLOWER': return 'var(--color-follower)';
      default: return '#64748b';
    }
  };

  const getRoleIcon = (role, isStopped) => {
    if (isStopped) return <Power size={20} color="#ef4444" />;
    switch (role) {
      case 'LEADER': return <Crown size={22} color="#f59e0b" />;
      case 'CANDIDATE': return <Vote size={22} color="#a855f7" />;
      case 'FOLLOWER': return <Shield size={20} color="#38bdf8" />;
      default: return <AlertCircle size={20} color="#64748b" />;
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedNode ? '1fr 340px' : '1fr', gap: '24px', alignItems: 'start' }}>
      
      {/* Topology Canvas */}
      <div className="glass-panel" style={{ padding: '24px', minHeight: '520px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} color="#f59e0b" />
              Live Consensus Topology
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Real-time peer connectivity, election states, and RPC pulse replication
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-leader)' }}>
              <Crown size={14} /> Leader (👑)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-follower)' }}>
              <Shield size={14} /> Follower (🛡️)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-candidate)' }}>
              <Vote size={14} /> Candidate (🗳️)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-danger)' }}>
              <Power size={14} /> Offline (❌)
            </span>
          </div>
        </div>

        {/* SVG Graph */}
        <div style={{ width: '100%', maxWidth: '560px', height: '480px', position: 'relative' }}>
          <svg viewBox="0 0 520 480" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            <defs>
              <radialGradient id="leaderGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </radialGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Peer Connection Mesh Lines */}
            {nodes.map((n1, i) =>
              nodes.slice(i + 1).map((n2) => {
                const pos1 = posMap[n1.node_id];
                const pos2 = posMap[n2.node_id];
                if (!pos1 || !pos2) return null;

                // Check if connection is severed by partition or stopped node
                let isSevered = n1.is_stopped || n2.is_stopped;
                if (partitions) {
                  const p1 = partitions.find((p) => p.includes(n1.node_id));
                  const p2 = partitions.find((p) => p.includes(n2.node_id));
                  if (p1 !== p2) isSevered = true;
                }

                return (
                  <g key={`${n1.node_id}-${n2.node_id}`}>
                    <line
                      x1={pos1.x}
                      y1={pos1.y}
                      x2={pos2.x}
                      y2={pos2.y}
                      stroke={isSevered ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)'}
                      strokeWidth={isSevered ? 1.5 : 1}
                      strokeDasharray={isSevered ? '4, 4' : 'none'}
                    />
                  </g>
                );
              })
            )}

            {/* Active RPC Pulse Packets Flying between nodes */}
            {rpcPulses?.map((pulse) => {
              const srcPos = posMap[pulse.from_node];
              const dstPos = posMap[pulse.to_node];
              if (!srcPos || !dstPos || pulse.dropped) return null;

              const isHeartbeat = pulse.rpc_type === 'Heartbeat';
              const strokeColor = pulse.rpc_type === 'RequestVote' 
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
                  filter="url(#glow)"
                />
              );
            })}

            {/* Node Circles */}
            {nodes.map((node, idx) => {
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
                  {/* Leader ambient background glow */}
                  {isLeader && (
                    <circle r="46" fill="url(#leaderGlow)" className="animate-pulse-slow" />
                  )}

                  {/* Outer ring */}
                  <circle
                    r="34"
                    fill="rgba(15, 23, 42, 0.95)"
                    stroke={isSelected ? '#ffffff' : color}
                    strokeWidth={isSelected ? 3 : isLeader ? 2.5 : 1.5}
                    filter={isLeader ? 'url(#glow)' : undefined}
                    style={{ transition: 'all 0.3s ease' }}
                  />

                  {/* Node Icon container */}
                  <foreignObject x="-16" y="-22" width="32" height="32">
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {getRoleIcon(node.role, node.is_stopped)}
                    </div>
                  </foreignObject>

                  {/* Node ID label */}
                  <text
                    y="16"
                    textAnchor="middle"
                    fill="#f1f5f9"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="var(--font-mono)"
                  >
                    {node.node_id}
                  </text>

                  {/* Term and partition badge */}
                  <text
                    y="27"
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                  >
                    Term {node.current_term} {node.partition_group ? `• P${node.partition_group}` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Node Inspector Drawer */}
      {selectedNode && (
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {getRoleIcon(selectedNode.role, selectedNode.is_stopped)}
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {selectedNode.node_id}
              </h3>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <span style={{ color: '#64748b' }}>Role:</span>
              <span style={{ fontWeight: 700, color: getRoleColor(selectedNode.role, selectedNode.is_stopped) }}>
                {selectedNode.is_stopped ? 'OFFLINE (STOPPED)' : selectedNode.role}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <span style={{ color: '#64748b' }}>Current Term:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{selectedNode.current_term}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <span style={{ color: '#64748b' }}>Commit Index:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#38bdf8' }}>{selectedNode.commit_index}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <span style={{ color: '#64748b' }}>Last Applied:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#34d399' }}>{selectedNode.last_applied}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <span style={{ color: '#64748b' }}>WAL Log Length:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{selectedNode.log_length} entries</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <span style={{ color: '#64748b' }}>Voted For:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: selectedNode.voted_for ? '#fbbf24' : '#64748b' }}>
                {selectedNode.voted_for || 'None'}
              </span>
            </div>
          </div>

          {/* Quick Node Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>CHAOS ACTIONS</span>
            {selectedNode.is_stopped ? (
              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onRestartNode(selectedNode.node_id)}
              >
                <RefreshCw size={14} />
                Restart Node
              </button>
            ) : (
              <button
                className="btn-danger"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onKillNode(selectedNode.node_id)}
              >
                <Power size={14} />
                Kill / Crash Node
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
