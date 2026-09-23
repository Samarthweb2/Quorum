import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Shield, Zap, Power, AlertTriangle, CheckCircle } from 'lucide-react';

// Custom React Flow Node matching Midday White & Cream Card
function MiddayClusterNode({ data }) {
  const { node, isLeader, isIsolated, onKill, onRestart, onPartition } = data;
  const isHealthy = node?.status === 'HEALTHY' || !node?.status || node?.status === 'ALIVE';

  return (
    <div
      style={{
        width: '210px',
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: `1.5px solid ${isLeader ? '#059669' : isIsolated ? '#DC2626' : '#EAE6DF'}`,
        boxShadow: isLeader
          ? '0 6px 20px -4px rgba(5, 150, 105, 0.15)'
          : '0 4px 14px -2px rgba(0, 0, 0, 0.04)',
        padding: '14px',
        fontFamily: 'Inter, sans-serif',
        position: 'relative',
        transition: 'all 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#737373', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#737373', width: 6, height: 6 }} />
      <Handle type="target" position={Position.Left} style={{ background: '#737373', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: '#737373', width: 6, height: 6 }} />

      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isLeader ? '#059669' : isIsolated ? '#DC2626' : '#2563EB',
            }}
          />
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#121212' }}>
            {node?.node_id || node?.id || 'node'}
          </span>
        </div>

        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: '9999px',
            backgroundColor: isLeader ? 'rgba(5, 150, 105, 0.1)' : '#F4F4F2',
            color: isLeader ? '#059669' : '#737373',
          }}
        >
          {isLeader ? 'LEADER' : isIsolated ? 'ISOLATED' : 'FOLLOWER'}
        </span>
      </div>

      {/* Node Metrics */}
      <div style={{ fontSize: '11px', color: '#737373', display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Term:</span>
          <span style={{ fontWeight: 500, color: '#121212' }}>{node?.term ?? 14}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Commit Index:</span>
          <span style={{ fontWeight: 500, color: '#121212' }}>{node?.commit_index ?? 1842}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => onPartition(node?.node_id || node?.id)}
          style={{
            flex: 1,
            padding: '4px',
            fontSize: '11px',
            fontWeight: 500,
            borderRadius: '5px',
            border: '1px solid #EAE6DF',
            backgroundColor: isIsolated ? '#DC2626' : '#FFFFFF',
            color: isIsolated ? '#FFFFFF' : '#121212',
          }}
        >
          {isIsolated ? 'Heal' : 'Partition'}
        </button>
        <button
          onClick={() => (isHealthy ? onKill(node?.node_id || node?.id) : onRestart(node?.node_id || node?.id))}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            borderRadius: '5px',
            border: '1px solid #EAE6DF',
            backgroundColor: '#F4F4F2',
            color: '#121212',
          }}
        >
          <Power size={11} />
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
  const partitionedNodes = status?.network_partitions || [];

  // 5 Nodes in clean pentagon layout
  const rawNodes = status?.nodes || [
    { id: 'node-1', node_id: 'node-1', role: 'LEADER', term: 14, commit_index: 1842 },
    { id: 'node-2', node_id: 'node-2', role: 'FOLLOWER', term: 14, commit_index: 1842 },
    { id: 'node-3', node_id: 'node-3', role: 'FOLLOWER', term: 14, commit_index: 1842 },
    { id: 'node-4', node_id: 'node-4', role: 'FOLLOWER', term: 14, commit_index: 1842 },
    { id: 'node-5', node_id: 'node-5', role: 'FOLLOWER', term: 14, commit_index: 1842 },
  ];

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

      return {
        id: nId,
        type: 'clusterNode',
        position: { x, y },
        data: {
          node,
          isLeader,
          isIsolated,
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
      if (srcId === leaderId) {
        rawNodes.forEach((dst) => {
          const dstId = dst.node_id || dst.id;
          if (dstId !== leaderId) {
            const isSevered = partitionedNodes.includes(srcId) || partitionedNodes.includes(dstId);
            rfEdges.push({
              id: `edge-${srcId}-${dstId}`,
              source: srcId,
              target: dstId,
              animated: !isSevered,
              style: {
                stroke: isSevered ? '#DC2626' : '#059669',
                strokeWidth: isSevered ? 1.5 : 2,
                strokeDasharray: isSevered ? '5,5' : undefined,
              },
            });
          }
        });
      }
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [rawNodes, leaderId, partitionedNodes]);

  return (
    <div style={{ height: '560px', width: '100%', backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #EAE6DF', overflow: 'hidden' }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background color="#EAE6DF" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
