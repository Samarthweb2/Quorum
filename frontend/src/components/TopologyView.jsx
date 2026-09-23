import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Power, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

const DEFAULT_NODES = [
  { id: 'node-1', node_id: 'node-1', role: 'LEADER', term: 1, commit_index: 0 },
  { id: 'node-2', node_id: 'node-2', role: 'FOLLOWER', term: 1, commit_index: 0 },
  { id: 'node-3', node_id: 'node-3', role: 'FOLLOWER', term: 1, commit_index: 0 },
  { id: 'node-4', node_id: 'node-4', role: 'FOLLOWER', term: 1, commit_index: 0 },
  { id: 'node-5', node_id: 'node-5', role: 'FOLLOWER', term: 1, commit_index: 0 },
];

// Custom React Flow Node matching Midday style with live states
function MiddayClusterNode({ data }) {
  const { node, isLeader, isIsolated, isStopped, onKill, onRestart, onPartition } = data;
  const nodeId = node?.node_id || node?.id || 'node';

  return (
    <div
      style={{
        width: '210px',
        backgroundColor: 'var(--bg-card)',
        borderRadius: '12px',
        border: isStopped
          ? '1.5px dashed var(--accent-red)'
          : isLeader
          ? '1.5px solid var(--accent-emerald)'
          : isIsolated
          ? '1.5px solid var(--accent-amber)'
          : '1.5px solid var(--border-subtle)',
        boxShadow: isLeader
          ? '0 6px 20px -4px rgba(5, 150, 105, 0.2)'
          : isStopped
          ? '0 4px 14px -2px rgba(220, 38, 38, 0.15)'
          : 'var(--shadow-card)',
        padding: '14px',
        fontFamily: 'var(--font-sans)',
        position: 'relative',
        transition: 'all 0.2s ease',
        opacity: isStopped ? 0.75 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--text-tertiary)', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--text-tertiary)', width: 6, height: 6 }} />
      <Handle type="target" position={Position.Left} style={{ background: 'var(--text-tertiary)', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--text-tertiary)', width: 6, height: 6 }} />

      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isStopped
                ? 'var(--accent-red)'
                : isLeader
                ? 'var(--accent-emerald)'
                : isIsolated
                ? 'var(--accent-amber)'
                : 'var(--accent-blue)',
            }}
          />
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
            {nodeId}
          </span>
        </div>

        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: '9999px',
            backgroundColor: isStopped
              ? 'rgba(220, 38, 38, 0.12)'
              : isLeader
              ? 'var(--accent-emerald-bg)'
              : isIsolated
              ? 'rgba(217, 119, 6, 0.12)'
              : 'var(--bg-input)',
            color: isStopped
              ? 'var(--accent-red)'
              : isLeader
              ? 'var(--accent-emerald)'
              : isIsolated
              ? 'var(--accent-amber)'
              : 'var(--text-secondary)',
          }}
        >
          {isStopped ? 'OFFLINE' : isLeader ? 'LEADER' : isIsolated ? 'ISOLATED' : 'FOLLOWER'}
        </span>
      </div>

      {/* Node Metrics */}
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Term:</span>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{node?.term ?? node?.current_term ?? 1}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Commit Index:</span>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{node?.commit_index ?? 0}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => onPartition(nodeId)}
          disabled={isStopped}
          title={isIsolated ? 'Heal network partition' : 'Partition node from cluster'}
          style={{
            flex: 1,
            padding: '4px',
            fontSize: '11px',
            fontWeight: 500,
            borderRadius: '5px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: isIsolated ? 'var(--accent-amber)' : 'var(--bg-card)',
            color: isIsolated ? '#FFFFFF' : 'var(--text-primary)',
            cursor: isStopped ? 'not-allowed' : 'pointer',
            opacity: isStopped ? 0.5 : 1,
            transition: 'background-color 0.15s ease',
          }}
        >
          {isIsolated ? 'Heal' : 'Partition'}
        </button>

        <button
          onClick={() => (isStopped ? onRestart(nodeId) : onKill(nodeId))}
          title={isStopped ? 'Restart node' : 'Kill node'}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            borderRadius: '5px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: isStopped ? 'var(--accent-emerald-bg)' : 'var(--bg-input)',
            color: isStopped ? 'var(--accent-emerald)' : 'var(--accent-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          {isStopped ? <RefreshCw size={11} /> : <Power size={11} />}
        </button>
      </div>
    </div>
  );
}

const nodeTypes = { clusterNode: MiddayClusterNode };

export default function TopologyView({
  status,
  onKillNode = () => {},
  onRestartNode = () => {},
  onPartition = () => {},
}) {
  const leaderId = status?.leader || status?.leader_id || 'node-1';
  const partitionedNodes = useMemo(() => {
    if (!status?.network_partitions) return [];
    // partitions can be list of lists [[node-3]] or list of node IDs
    return status.network_partitions.flat();
  }, [status?.network_partitions]);

  const rawNodes = status?.nodes && status.nodes.length > 0 ? status.nodes : DEFAULT_NODES;

  const { nodes, edges } = useMemo(() => {
    const cx = 380;
    const cy = 250;
    const radius = 180;
    const count = rawNodes.length;

    const rfNodes = rawNodes.map((node, i) => {
      const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
      const x = cx + radius * Math.cos(angle) - 105;
      const y = cy + radius * Math.sin(angle) - 60;
      const nId = node.node_id || node.id;
      const isLeader = nId === leaderId;
      const isIsolated = partitionedNodes.includes(nId);
      const isStopped = !!node?.is_stopped || node?.role === 'OFFLINE' || node?.role === 'offline';

      return {
        id: nId,
        type: 'clusterNode',
        position: { x, y },
        data: {
          node,
          isLeader,
          isIsolated,
          isStopped,
          onKill: onKillNode,
          onRestart: onRestartNode,
          onPartition,
        },
      };
    });

    // Mesh edges between leader and followers
    const rfEdges = [];
    rawNodes.forEach((src) => {
      const srcId = src.node_id || src.id;
      const srcStopped = !!src.is_stopped || src.role === 'OFFLINE' || src.role === 'offline';
      if (srcId === leaderId && !srcStopped) {
        rawNodes.forEach((dst) => {
          const dstId = dst.node_id || dst.id;
          const dstStopped = !!dst.is_stopped || dst.role === 'OFFLINE' || dst.role === 'offline';
          if (dstId !== leaderId) {
            const isSevered = partitionedNodes.includes(srcId) || partitionedNodes.includes(dstId) || dstStopped;
            rfEdges.push({
              id: `edge-${srcId}-${dstId}`,
              source: srcId,
              target: dstId,
              animated: !isSevered,
              style: {
                stroke: isSevered ? 'var(--accent-red)' : 'var(--accent-emerald)',
                strokeWidth: isSevered ? 1.5 : 2,
                strokeDasharray: isSevered ? '5,5' : undefined,
                opacity: dstStopped ? 0.3 : 1,
              },
            });
          }
        });
      }
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [rawNodes, leaderId, partitionedNodes, onKillNode, onRestartNode, onPartition]);

  return (
    <div
      style={{
        height: '560px',
        width: '100%',
        backgroundColor: 'var(--bg-card)',
        borderRadius: '14px',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background color="var(--border-subtle)" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
