import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ShieldCheck, User, X, Plus, Zap, ArrowRight, Layers, AlertCircle } from 'lucide-react';

const SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 380,
  damping: 28,
};

export default function FifoWaitQueueTrack({
  status,
  activeLocks = [],
  onAcquireLock,
  onReleaseLock,
}) {
  const locks = activeLocks.length ? activeLocks : (status?.active_locks || []);
  const [selectedKey, setSelectedKey] = useState(locks[0]?.key || 'production-orders-db');
  const [contenderId, setContenderId] = useState('worker-beta');
  const [contenderTtl, setContenderTtl] = useState(5);
  const [contenderTimeout, setContenderTimeout] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localWaiters, setLocalWaiters] = useState({});
  const [pulseKey, setPulseKey] = useState(0);

  // Sync selected key if current is lost
  useEffect(() => {
    if (locks.length > 0 && !locks.some(l => l.key === selectedKey)) {
      setSelectedKey(locks[0].key);
    }
  }, [locks, selectedKey]);

  // Read current active lock for the selected key
  const currentLock = locks.find(l => l.key === selectedKey);

  // Fetch or extract wait queue for the selected key
  const serverQueue = status?.wait_queues?.[selectedKey] || currentLock?.wait_queue || [];
  const mergedQueue = localWaiters[selectedKey] || serverQueue;

  // Poll queue endpoint periodically as fallback
  useEffect(() => {
    let timer;
    const fetchQueue = async () => {
      if (!selectedKey) return;
      try {
        const res = await fetch(`/api/leases/${encodeURIComponent(selectedKey)}/queue`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.queue)) {
            setLocalWaiters(prev => ({ ...prev, [selectedKey]: data.queue }));
          }
        }
      } catch (_) {}
    };

    fetchQueue();
    timer = setInterval(fetchQueue, 1500);
    return () => clearInterval(timer);
  }, [selectedKey]);

  // Handle enqueueing a new contender via wait_if_busy=True
  const handleEnqueue = async (e) => {
    if (e) e.preventDefault();
    if (!selectedKey || !contenderId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/locks/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: selectedKey,
          client_id: contenderId,
          ttl_ms: contenderTtl * 1000,
          wait_if_busy: true,
          wait_timeout_ms: contenderTimeout * 1000,
        }),
      });
      const data = await res.json();
      setPulseKey(p => p + 1);

      // Auto cycle contender name for convenience
      const match = contenderId.match(/^worker-([a-z]+)$/);
      if (match) {
        const names = ['gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'omega'];
        const nextName = names[(names.indexOf(match[1]) + 1) % names.length] || 'next';
        setContenderId(`worker-${nextName}`);
      } else {
        setContenderId(`worker-${Math.floor(Math.random() * 900) + 100}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Burst enqueue 3 contenders to simulate heavy contention
  const handleBurstEnqueue = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const burstContenders = ['worker-gamma', 'worker-delta', 'worker-epsilon'];
    try {
      for (const cid of burstContenders) {
        await fetch('/api/locks/acquire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: selectedKey,
            client_id: cid,
            ttl_ms: 5000,
            wait_if_busy: true,
            wait_timeout_ms: 60000,
          }),
        });
      }
      setPulseKey(p => p + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancelling a waiter from the queue
  const handleCancelWait = async (client_id) => {
    try {
      await fetch(`/api/locks/${encodeURIComponent(selectedKey)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id }),
      });
      setLocalWaiters(prev => ({
        ...prev,
        [selectedKey]: (prev[selectedKey] || []).filter(w => w.client_id !== client_id),
      }));
      setPulseKey(p => p + 1);
    } catch (_) {}
  };

  const nowMs = Date.now();

  return (
    <div
      style={{
        background: '#08090a',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 24px -8px rgba(0, 0, 0, 0.8)',
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

      {/* Header Bar */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={14} color="#f1f5f9" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: '#f1f5f9',
                  textTransform: 'uppercase',
                  margin: 0,
                }}
              >
                FIFO Wait Queue Track
              </h3>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#94a3b8',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                PUSH ROUTED
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
              Deterministic Raft-replicated waiter queue with sub-millisecond PromotionHub delivery
            </p>
          </div>
        </div>

        {/* Key Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Resource:
          </span>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            style={{
              background: '#0d0e11',
              color: '#f1f5f9',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {locks.map(l => (
              <option key={l.key} value={l.key}>{l.key}</option>
            ))}
            {!locks.some(l => l.key === selectedKey) && (
              <option value={selectedKey}>{selectedKey}</option>
            )}
            <option value="production-orders-db">production-orders-db</option>
            <option value="primary-db-migrator">primary-db-migrator</option>
          </select>
        </div>
      </div>

      {/* Main Track Layout */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Stage 1: Current Lock Holder vs Head of Queue */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: currentLock ? '320px 32px 1fr' : '1fr',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          {/* Active Lease Card */}
          {currentLock ? (
            <motion.div
              layout
              transition={SPRING_TRANSITION}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '14px 16px',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                  ACTIVE LEASE HOLDER
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    color: '#38bdf8',
                    background: 'rgba(56, 189, 248, 0.08)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                  }}
                >
                  TOKEN #{currentLock.fence_token || currentLock.fencing_token}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: '#f8fafc' }}>
                  {currentLock.owner}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  holding {selectedKey}
                </span>
              </div>

              {/* TTL Bar */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', marginBottom: '3px', fontFamily: 'var(--font-mono, monospace)' }}>
                  <span>REMAINING TTL</span>
                  <span style={{ color: currentLock.remaining_ttl_ms > 2000 ? '#10b981' : '#f59e0b' }}>
                    {(currentLock.remaining_ttl_ms / 1000).toFixed(1)}s
                  </span>
                </div>
                <div style={{ height: '3px', width: '100%', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, (currentLock.remaining_ttl_ms / 6000) * 100)}%`,
                      background: currentLock.remaining_ttl_ms > 2000 ? '#10b981' : '#f59e0b',
                      transition: 'width 0.2s linear',
                    }}
                  />
                </div>
              </div>

              {/* Release button to simulate handoff */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => onReleaseLock && onReleaseLock(currentLock.key, currentLock.owner, currentLock.fence_token)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    padding: '3px 8px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                  title="Release lock now to observe instant promotion of #1 in queue"
                >
                  Release to Next
                </button>
              </div>
            </motion.div>
          ) : (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.01)',
                border: '1px dashed rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '0.75rem',
              }}
            >
              No active lease on <strong style={{ color: '#94a3b8' }}>{selectedKey}</strong>. First contender will acquire immediately.
            </div>
          )}

          {/* Connector Arrow */}
          {currentLock && (
            <div style={{ display: 'flex', justifyContent: 'center', color: 'rgba(255, 255, 255, 0.2)' }}>
              <ArrowRight size={18} />
            </div>
          )}

          {/* Contenders Track */}
          <div
            style={{
              background: '#0d0e11',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              padding: '14px',
              minHeight: '110px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.04em' }}>
                QUEUED CONTENDERS ({mergedQueue.length})
              </span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono, monospace)', color: '#64748b' }}>
                FIFO HEAD ➔ TAIL
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                overflowX: 'auto',
                paddingBottom: '4px',
                alignItems: 'stretch',
              }}
            >
              <AnimatePresence mode="popLayout">
                {mergedQueue.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      width: '100%',
                      padding: '16px',
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      color: '#475569',
                      border: '1px dashed rgba(255, 255, 255, 0.04)',
                      borderRadius: '6px',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    WAIT QUEUE EMPTY — NO STREAMING WAITERS
                  </motion.div>
                ) : (
                  mergedQueue.map((item, idx) => {
                    const isHead = idx === 0;
                    const enqueuedAt = item.enqueued_at_ms || item.enqueued_at || nowMs;
                    const waitElapsedS = Math.max(0, ((nowMs - enqueuedAt) / 1000)).toFixed(1);

                    return (
                      <motion.div
                        key={item.client_id}
                        layout
                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: -20 }}
                        transition={SPRING_TRANSITION}
                        style={{
                          flex: '0 0 200px',
                          background: isHead ? 'rgba(16, 185, 129, 0.04)' : 'rgba(255, 255, 255, 0.02)',
                          border: isHead ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '6px',
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '8px',
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 700,
                              color: isHead ? '#10b981' : '#94a3b8',
                              background: isHead ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                            }}
                          >
                            {isHead ? 'HEAD [1]' : `POS [${idx + 1}]`}
                          </span>

                          <button
                            onClick={() => handleCancelWait(item.client_id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title="Cancel stream / drop from queue"
                          >
                            <X size={12} />
                          </button>
                        </div>

                        <div>
                          <div
                            style={{
                              fontSize: '0.85rem',
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 600,
                              color: '#f1f5f9',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.client_id}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>
                            req: {((item.ttl_ms || 5000) / 1000).toFixed(0)}s lease
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: '0.65rem',
                            color: '#94a3b8',
                            borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                            paddingTop: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          <span>WAITING:</span>
                          <span style={{ color: '#cbd5e1' }}>{waitElapsedS}s</span>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Stage 2: Contender Enqueue Action Bar */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <form
            onSubmit={handleEnqueue}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Enqueue Waiter:
            </span>

            <input
              type="text"
              value={contenderId}
              onChange={(e) => setContenderId(e.target.value)}
              placeholder="worker-id"
              style={{
                background: '#0d0e11',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f1f5f9',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono, monospace)',
                width: '130px',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '0.65rem', color: '#64748b' }}>TTL:</span>
              <input
                type="number"
                value={contenderTtl}
                onChange={(e) => setContenderTtl(Number(e.target.value))}
                min="1"
                max="60"
                style={{
                  background: '#0d0e11',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f1f5f9',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  width: '45px',
                }}
              />
              <span style={{ fontSize: '0.65rem', color: '#64748b' }}>s</span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                padding: '5px 12px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500,
              }}
            >
              <Plus size={12} />
              Enqueue Waiter
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleBurstEnqueue}
              disabled={isSubmitting}
              style={{
                background: 'rgba(56, 189, 248, 0.06)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '4px',
                padding: '5px 12px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
              title="Add 3 contending workers in FIFO order to observe cascade promotion"
            >
              <Zap size={12} />
              + Burst 3 Contenders
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
