import React, { useState } from 'react';
import { Lock, Unlock, RefreshCw, Key, ShieldCheck, Clock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import FifoWaitQueueTrack from './FifoWaitQueueTrack';

export default function LockStudio({ status, onAcquireLock, onRenewLock, onReleaseLock }) {
  const [keyInput, setKeyInput] = useState('production-db-migrator');
  const [clientInput, setClientInput] = useState('worker-alpha');
  const [ttlInput, setTtlInput] = useState(6);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeLocks = status?.active_locks || [];

  const handleAcquire = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionFeedback(null);
    try {
      const res = await onAcquireLock(keyInput, clientInput, ttlInput * 1000);
      setActionFeedback(res);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenew = async (lock) => {
    setIsSubmitting(true);
    try {
      const res = await onRenewLock(lock.key, lock.owner, lock.fence_token, ttlInput * 1000);
      setActionFeedback(res);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRelease = async (lock) => {
    setIsSubmitting(true);
    try {
      const res = await onReleaseLock(lock.key, lock.owner, lock.fence_token);
      setActionFeedback(res);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTtlColor = (remainingMs, totalMs = 6000) => {
    const ratio = remainingMs / totalMs;
    if (ratio > 0.5) return '#10b981';
    if (ratio > 0.2) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
      
      {/* Active Locks Table */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="#10b981" />
              Active Distributed Locks
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Replicated state machine records with strictly monotonic 64-bit fencing tokens
            </p>
          </div>
          <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', background: 'rgba(255, 255, 255, 0.05)', padding: '4px 10px', borderRadius: '6px' }}>
            {activeLocks.length} Held Locks
          </span>
        </div>

        {activeLocks.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border-subtle)', borderRadius: '8px', color: '#64748b' }}>
            <Lock size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#94a3b8' }}>No active locks in cluster</p>
            <p style={{ fontSize: '0.8rem' }}>Acquire a lock using the Lock Controller on the right to observe real-time lease coordination.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeLocks.map((lock) => {
              const ttlColor = getTtlColor(lock.remaining_ttl_ms);
              const progressPct = Math.min(100, (lock.remaining_ttl_ms / (ttlInput * 1000 || 6000)) * 100);

              return (
                <div 
                  key={lock.key}
                  className="glass-panel-hover"
                  style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Key size={16} color="#f59e0b" />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{lock.key}</h4>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <User size={12} /> Owner: <strong style={{ color: '#f1f5f9' }}>{lock.owner}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Fencing Token Badge */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.3)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700 }}>
                        <ShieldCheck size={14} />
                        Token #{lock.fence_token}
                      </div>
                    </div>
                  </div>

                  {/* TTL Countdown Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> Remaining TTL:
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: ttlColor }}>
                        {(lock.remaining_ttl_ms / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          height: '100%', 
                          width: `${progressPct}%`, 
                          background: ttlColor, 
                          transition: 'width 0.15s linear, background 0.3s ease',
                          borderRadius: '3px',
                        }} 
                      />
                    </div>
                  </div>

                  {/* Actions on lock */}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      onClick={() => handleRenew(lock)}
                      disabled={isSubmitting}
                    >
                      <RefreshCw size={12} /> Renew
                    </button>
                    <button
                      className="btn-danger"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      onClick={() => handleRelease(lock)}
                      disabled={isSubmitting}
                    >
                      <Unlock size={12} /> Release
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lock Controller Form */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Lock size={18} color="#f59e0b" />
          Lock Controller
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
          Propose lock acquisitions or test mutual exclusion conflict resolution directly.
        </p>

        <form onSubmit={handleAcquire} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
              RESOURCE KEY
            </label>
            <input
              type="text"
              className="input-field"
              style={{ width: '100%' }}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="e.g. primary-db-writer"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
              WORKER / CLIENT ID
            </label>
            <input
              type="text"
              className="input-field"
              style={{ width: '100%' }}
              value={clientInput}
              onChange={(e) => setClientInput(e.target.value)}
              placeholder="e.g. worker-alpha"
              required
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 600 }}>LEASE TTL</label>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>{ttlInput} seconds</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              value={ttlInput}
              onChange={(e) => setTtlInput(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#f59e0b' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', marginTop: '6px' }}
            disabled={isSubmitting}
          >
            <Lock size={16} />
            Acquire Distributed Lock
          </button>
        </form>

        {/* Action Feedback Card */}
        {actionFeedback && (
          <div 
            style={{ 
              background: actionFeedback.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
              border: `1px solid ${actionFeedback.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: actionFeedback.success ? '#34d399' : '#f87171' }}>
              {actionFeedback.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {actionFeedback.status || (actionFeedback.success ? 'SUCCESS' : 'FAILED')}
            </div>
            <p style={{ color: '#cbd5e1' }}>{actionFeedback.message}</p>
            {actionFeedback.fence_token ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
                Fencing Token: #{actionFeedback.fence_token}
              </div>
            ) : null}
          </div>
        )}
      </div>
      </div>

      {/* Real-time FIFO Wait Queue Track */}
      <FifoWaitQueueTrack
        status={status}
        activeLocks={activeLocks}
        onAcquireLock={onAcquireLock}
        onReleaseLock={onReleaseLock}
      />
    </div>
  );
}
