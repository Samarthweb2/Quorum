import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, Key, Plus, ShieldCheck, Clock } from 'lucide-react';

const DEFAULT_FALLBACK_LOCKS = [
  {
    key: 'resource:orders_db',
    owner: 'worker-primary-node',
    fence_token: 104,
    remaining_ttl_ms: 4200,
    total_ttl_ms: 6000,
    granted_at_ms: Date.now() - 1800,
  },
  {
    key: 'resource:billing_engine',
    owner: 'payment-service-1',
    fence_token: 105,
    remaining_ttl_ms: 5500,
    total_ttl_ms: 6000,
    granted_at_ms: Date.now() - 500,
  },
  {
    key: 'resource:inventory_wal',
    owner: 'warehouse-dispatcher',
    fence_token: 106,
    remaining_ttl_ms: 2400,
    total_ttl_ms: 6000,
    granted_at_ms: Date.now() - 3600,
  },
];

export default function LocksView({ locks: backendLocks = [], onAcquireLock = () => {}, onReleaseLock = () => {} }) {
  // Normalize lock data
  const normalizeLock = (item) => {
    const totalTtl = item.total_ttl_ms || 6000;
    const remaining = item.remaining_ttl_ms != null ? item.remaining_ttl_ms : (item.expiresInSec ? item.expiresInSec * 1000 : totalTtl);
    return {
      key: item.key,
      holder: item.owner || item.holder || item.client_id || 'worker-client',
      fenceToken: item.fence_token ?? item.fencing_token ?? item.fenceToken ?? 101,
      remainingTtlMs: Math.max(0, remaining),
      totalTtlMs: totalTtl,
      acquiredAt: item.granted_at_ms
        ? new Date(item.granted_at_ms).toLocaleTimeString()
        : item.acquiredAt || new Date().toLocaleTimeString(),
    };
  };

  const [activeLocks, setActiveLocks] = useState(() => {
    if (backendLocks && backendLocks.length > 0) {
      return backendLocks.map(normalizeLock);
    }
    return DEFAULT_FALLBACK_LOCKS.map(normalizeLock);
  });

  const [newKey, setNewKey] = useState('');
  const [newHolder, setNewHolder] = useState('');
  const [releaseHoverKey, setReleaseHoverKey] = useState(null);

  // Sync when backendLocks changes from WebSocket status
  useEffect(() => {
    if (backendLocks && backendLocks.length > 0) {
      setActiveLocks(backendLocks.map(normalizeLock));
    }
  }, [backendLocks]);

  // Live TTL countdown ticking timer (runs every 200ms for smooth progress bar)
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLocks((prevLocks) => {
        return prevLocks
          .map((lock) => ({
            ...lock,
            remainingTtlMs: Math.max(0, lock.remainingTtlMs - 200),
          }))
          .filter((lock) => lock.remainingTtlMs > 0);
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const handleAcquire = (e) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    const formattedKey = newKey.startsWith('resource:') ? newKey : `resource:${newKey}`;
    const holder = newHolder.trim() || 'worker-client';
    const token = Math.floor(Math.random() * 50) + 110;

    const newLock = normalizeLock({
      key: formattedKey,
      owner: holder,
      fence_token: token,
      remaining_ttl_ms: 6000,
      total_ttl_ms: 6000,
      granted_at_ms: Date.now(),
    });

    setActiveLocks((prev) => [newLock, ...prev.filter((l) => l.key !== formattedKey)]);
    setNewKey('');
    setNewHolder('');
    onAcquireLock(newLock.key, newLock.holder);
  };

  const handleRelease = (key) => {
    setActiveLocks((prev) => prev.filter((l) => l.key !== key));
    onReleaseLock(key);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Acquire Lock Form */}
      <div
        style={{
          padding: '20px',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          backgroundColor: 'var(--bg-card)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h3
          style={{
            fontSize: '15px',
            fontWeight: 600,
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-primary)',
          }}
        >
          <Key size={16} color="var(--accent-emerald)" />
          <span>Acquire Distributed Lock Lease</span>
        </h3>

        <form onSubmit={handleAcquire} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Resource key (e.g. inventory:batch)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            style={{
              flex: 2,
              padding: '9px 14px',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              fontSize: '13px',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Holder Client ID (e.g. worker_alpha)"
            value={newHolder}
            onChange={(e) => setNewHolder(e.target.value)}
            style={{
              flex: 1,
              padding: '9px 14px',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              fontSize: '13px',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            className="midday-btn-black"
            style={{ borderRadius: '8px', padding: '9px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} />
            <span>Acquire</span>
          </button>
        </form>
      </div>

      {/* Active Locks Grid */}
      {activeLocks.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            border: '1px dashed var(--border-subtle)',
            borderRadius: '12px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card)',
          }}
        >
          <Lock size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <h4 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
            No Active Distributed Locks
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
            All leases have expired or been released. Use the form above to acquire a new lock.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '16px' }}>
          {activeLocks.map((lock) => {
            const ttlPercent = Math.max(0, Math.min(100, (lock.remainingTtlMs / lock.totalTtlMs) * 100));
            const remainingSec = (lock.remainingTtlMs / 1000).toFixed(1);
            const isWarning = lock.remainingTtlMs < 2000;
            const isHovered = releaseHoverKey === lock.key;

            return (
              <div
                key={lock.key}
                style={{
                  padding: '20px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  backgroundColor: 'var(--bg-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: 'var(--shadow-card)',
                  transition: 'border-color 0.2s',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Lock size={15} color="var(--accent-emerald)" />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{lock.key}</span>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: 'var(--accent-emerald-bg)',
                        color: 'var(--accent-emerald)',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                      }}
                    >
                      TOKEN #{lock.fenceToken}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
                    <div>Holder: <strong style={{ color: 'var(--text-primary)' }}>{lock.holder}</strong></div>
                    <div>Acquired: {lock.acquiredAt}</div>
                  </div>

                  {/* TTL Draining Progress Bar */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} /> Lease TTL:
                      </span>
                      <span style={{ color: isWarning ? 'var(--accent-amber)' : 'inherit', fontWeight: isWarning ? 600 : 400 }}>
                        {remainingSec}s remaining
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '6px',
                        backgroundColor: 'var(--bg-input)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${ttlPercent}%`,
                          height: '100%',
                          backgroundColor: isWarning ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                          transition: 'width 0.2s linear, background-color 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleRelease(lock.key)}
                  onMouseEnter={() => setReleaseHoverKey(lock.key)}
                  onMouseLeave={() => setReleaseHoverKey(null)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--accent-red)',
                    backgroundColor: isHovered ? 'rgba(220, 38, 38, 0.08)' : 'var(--bg-card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Unlock size={13} />
                  <span>Release Lock</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
