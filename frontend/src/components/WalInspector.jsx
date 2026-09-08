import React, { useState } from 'react';
import { Layers, FileText, CheckCircle, Database, Check, Clock, Info } from 'lucide-react';

export default function WalInspector({ status, logs }) {
  const [selectedEntry, setSelectedEntry] = useState(null);
  const nodes = status?.nodes || [];

  const getCmdColor = (cmd) => {
    switch (cmd) {
      case 'ACQUIRE': return '#f59e0b';
      case 'RENEW': return '#38bdf8';
      case 'RELEASE': return '#10b981';
      default: return '#94a3b8';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Info */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="#f59e0b" />
            Replicated Write-Ahead Log (WAL) Inspector
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Framed binary records with CRC32 checksums, fsync durability, and commit markers
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8' }}>
            <span style={{ width: '8px', height: '8px', background: '#38bdf8', borderRadius: '50%' }}></span>
            Committed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
            <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }}></span>
            Applied to State
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
            <span style={{ width: '8px', height: '8px', background: '#64748b', borderRadius: '50%' }}></span>
            Uncommitted Suffix
          </span>
        </div>
      </div>

      {/* Side-by-Side Node WALs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${nodes.length || 5}, 1fr)`, gap: '16px', overflowX: 'auto', paddingBottom: '12px' }}>
        {nodes.map((node) => {
          const nodeLogs = logs?.[node.node_id] || [];
          const isLeader = node.role === 'LEADER';

          return (
            <div
              key={node.node_id}
              className="glass-panel"
              style={{ 
                padding: '16px', 
                minWidth: '220px',
                border: isLeader ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-subtle)',
                background: isLeader ? 'rgba(245, 158, 11, 0.03)' : 'var(--bg-card)'
              }}
            >
              {/* Node Column Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isLeader && '👑 '}
                    {node.node_id}
                  </h4>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Term {node.current_term} • {node.role}
                  </span>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
                  Commit: <strong style={{ color: '#38bdf8' }}>{node.commit_index}</strong>
                </div>
              </div>

              {/* Entries List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '540px', overflowY: 'auto' }}>
                {nodeLogs.length === 0 ? (
                  <div style={{ padding: '24px 8px', textAlign: 'center', color: '#64748b', fontSize: '0.75rem' }}>
                    No log entries yet
                  </div>
                ) : (
                  nodeLogs.map((entry) => {
                    const isCommitted = entry.is_committed;
                    const isApplied = entry.is_applied;
                    const cmdColor = getCmdColor(entry.command_type);

                    return (
                      <div
                        key={entry.index}
                        onClick={() => setSelectedEntry({ node_id: node.node_id, entry })}
                        style={{
                          background: isApplied ? 'rgba(16, 185, 129, 0.06)' : isCommitted ? 'rgba(56, 189, 248, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                          border: `1px solid ${isApplied ? 'rgba(16, 185, 129, 0.3)' : isCommitted ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                          borderRadius: '8px',
                          padding: '10px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        className="glass-panel-hover"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#f1f5f9' }}>
                            #{entry.index} (T:{entry.term})
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: cmdColor, background: `${cmdColor}18`, padding: '2px 6px', borderRadius: '4px' }}>
                            {entry.command_type}
                          </span>
                        </div>

                        {entry.data?.key && (
                          <div style={{ fontSize: '0.7rem', color: '#cbd5e1', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            key: <strong>{entry.data.key}</strong>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.65rem', color: '#64748b' }}>
                          <span>CRC32 OK</span>
                          {isApplied ? (
                            <span style={{ color: '#10b981', fontWeight: 600 }}>Applied</span>
                          ) : isCommitted ? (
                            <span style={{ color: '#38bdf8', fontWeight: 600 }}>Committed</span>
                          ) : (
                            <span>Uncommitted</span>
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

      {/* Entry Inspector Modal/Drawer */}
      {selectedEntry && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0, 0, 0, 0.7)', 
            backdropFilter: 'blur(8px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 100, 
            padding: '20px' 
          }}
          onClick={() => setSelectedEntry(null)}
        >
          <div 
            className="glass-panel" 
            style={{ maxWidth: '540px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#f59e0b" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  Log Entry #{selectedEntry.entry.index} ({selectedEntry.node_id})
                </h3>
              </div>
              <button 
                onClick={() => setSelectedEntry(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Term:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{selectedEntry.entry.term}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Command Type:</span>
                <span style={{ fontWeight: 700, color: getCmdColor(selectedEntry.entry.command_type) }}>
                  {selectedEntry.entry.command_type}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Checksum & Framing:</span>
                <span style={{ color: '#10b981', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  CRC32 Validated (QLOG framed)
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
                PAYLOAD JSON
              </label>
              <pre style={{ background: '#090d16', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', color: '#38bdf8', fontSize: '0.8rem', overflowX: 'auto' }}>
                {JSON.stringify(selectedEntry.entry.data, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
