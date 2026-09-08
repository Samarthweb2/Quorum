import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, Zap, Radio, Power, RefreshCw, Scissors, HeartPulse, Shield, Play } from 'lucide-react';

export default function ChaosSandbox({ status, onCreatePartition, onHealPartitions, onKillNode, onRestartNode, onSetNetworkConditions, onSimulateZombie }) {
  const [latency, setLatency] = useState(status?.latency_ms || 0);
  const [packetLoss, setPacketLoss] = useState(status?.packet_loss_rate || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nodes = status?.nodes || [];
  const isPartitioned = status?.is_partitioned;
  const partitions = status?.partitions;

  const handleApplyConditions = async () => {
    setIsSubmitting(true);
    try {
      await onSetNetworkConditions(Number(latency), Number(packetLoss));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePartition3v2 = async () => {
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
    if (!status?.leader_id) return;
    const leader = status.leader_id;
    const followers = nodes.filter((n) => n.node_id !== leader).map((n) => n.node_id);
    setIsSubmitting(true);
    try {
      await onCreatePartition([[leader], followers]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
      
      {/* Network Partitioning Controls */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171' }}>
            <Scissors size={18} color="#ef4444" />
            Network Partition Simulation
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Split cluster into disjoint partitions to test quorum election invariants and split-brain resistance
          </p>
        </div>

        {/* Active Partition State Banner */}
        {isPartitioned ? (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontWeight: 700, fontSize: '0.85rem' }}>
              <AlertTriangle size={16} />
              ACTIVE NETWORK PARTITION
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {partitions?.map((group, idx) => (
                <div key={idx} style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  <strong>Partition {idx + 1}:</strong> {group.join(', ')} ({group.length >= 3 ? 'Majority Quorum' : 'Minority'})
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '12px', fontSize: '0.8rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HeartPulse size={16} />
            Full network connectivity. All 5 nodes can reach each other.
          </div>
        )}

        {/* Partition Presets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            className="btn-secondary"
            onClick={handlePartition3v2}
            disabled={isSubmitting}
            style={{ justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Scissors size={14} color="#f59e0b" />
              <strong>Preset: 3 vs 2 Partition</strong>
            </span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Majority (1,2,3) vs Minority (4,5)</span>
          </button>

          <button
            className="btn-secondary"
            onClick={handleIsolateLeader}
            disabled={isSubmitting || !status?.leader_id}
            style={{ justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={14} color="#a855f7" />
              <strong>Preset: Isolate Current Leader</strong>
            </span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Forces 4 remaining nodes to elect new leader</span>
          </button>

          {isPartitioned && (
            <button
              className="btn-primary"
              onClick={onHealPartitions}
              disabled={isSubmitting}
              style={{ justifyContent: 'center', marginTop: '6px' }}
            >
              <HeartPulse size={16} />
              Heal All Partitions & Restore Connectivity
            </button>
          )}
        </div>
      </div>

      {/* Node Power Grid & Faults */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Power size={18} color="#38bdf8" />
            Node Crash / Restart Controls
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Kill specific nodes mid-execution to verify fast failover and state recovery
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {nodes.map((node) => (
            <div
              key={node.node_id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: node.is_stopped ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{node.node_id}</strong>
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '8px' }}>
                  Term {node.current_term} ({node.role})
                </span>
              </div>

              {node.is_stopped ? (
                <button
                  className="btn-primary"
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => onRestartNode(node.node_id)}
                >
                  <RefreshCw size={12} /> Restart
                </button>
              ) : (
                <button
                  className="btn-danger"
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => onKillNode(node.node_id)}
                >
                  <Power size={12} /> Kill
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Latency & Loss Sliders */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={18} color="#a855f7" />
          Network Impairment Injection
        </h3>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
            <label style={{ color: '#94a3b8', fontWeight: 600 }}>INJECTED PEER LATENCY</label>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{latency} ms</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
            <label style={{ color: '#94a3b8', fontWeight: 600 }}>PACKET DROP RATE</label>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#f87171' }}>{(packetLoss * 100).toFixed(0)}%</span>
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

        <button className="btn-secondary" onClick={handleApplyConditions} style={{ justifyContent: 'center' }}>
          Apply Network Impairments
        </button>
      </div>

      {/* Zombie Worker Fencing Simulator Card */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc' }}>
            <Shield size={18} color="#c084fc" />
            Zombie Worker Fencing Token Demo
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Simulate a classic distributed systems GC pause / split-brain bug and observe how downstream storage uses fencing tokens to reject stale writes.
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={onSimulateZombie}
          style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#ffffff', justifyContent: 'center', padding: '12px' }}
        >
          <Play size={16} />
          Run Live Zombie Worker Simulation
        </button>
      </div>
    </div>
  );
}
