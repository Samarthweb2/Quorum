import React, { useState } from 'react';
import { Lock, Unlock, Key, Plus, ShieldCheck } from 'lucide-react';

export default function LocksView({ onAcquireLock = () => {}, onReleaseLock = () => {} }) {
  const [locks, setLocks] = useState([
    {
      key: 'resource:orders_db',
      holder: 'worker-primary-node',
      fenceToken: 104,
      ttlRemaining: 74, // percentage
      expiresInSec: 4.2,
      acquiredAt: '13:24:10',
    },
    {
      key: 'resource:billing_engine',
      holder: 'payment-service-1',
      fenceToken: 105,
      ttlRemaining: 92,
      expiresInSec: 5.8,
      acquiredAt: '13:25:02',
    },
    {
      key: 'resource:inventory_wal',
      holder: 'warehouse-dispatcher',
      fenceToken: 106,
      ttlRemaining: 48,
      expiresInSec: 2.1,
      acquiredAt: '13:25:30',
    },
  ]);

  const [newKey, setNewKey] = useState('');
  const [newHolder, setNewHolder] = useState('');

  const handleAcquire = (e) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    const token = Math.floor(Math.random() * 50) + 110;
    const newLock = {
      key: newKey.startsWith('resource:') ? newKey : `resource:${newKey}`,
      holder: newHolder || 'worker-client',
      fenceToken: token,
      ttlRemaining: 100,
      expiresInSec: 6.0,
      acquiredAt: new Date().toLocaleTimeString(),
    };
    setLocks([newLock, ...locks]);
    setNewKey('');
    setNewHolder('');
    onAcquireLock(newLock.key, newLock.holder);
  };

  const handleRelease = (key) => {
    setLocks(locks.filter((l) => l.key !== key));
    onReleaseLock(key);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Acquire Lock Form */}
      <div style={{ padding: '20px', border: '1px solid #EAE6DF', borderRadius: '12px', backgroundColor: '#FFFFFF' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={16} />
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
              border: '1px solid #EAE6DF',
              borderRadius: '8px',
              fontSize: '13px',
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
              border: '1px solid #EAE6DF',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          />
          <button
            type="submit"
            className="midday-btn-black"
            style={{ borderRadius: '8px', padding: '9px 20px', fontSize: '13px' }}
          >
            <Plus size={14} />
            <span>Acquire</span>
          </button>
        </form>
      </div>

      {/* Active Locks Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {locks.map((lock) => (
          <div
            key={lock.key}
            style={{
              padding: '20px',
              border: '1px solid #EAE6DF',
              borderRadius: '12px',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={15} color="#059669" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#121212' }}>{lock.key}</span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                    color: '#059669',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                  }}
                >
                  TOKEN #{lock.fenceToken}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#737373', marginBottom: '16px' }}>
                <div>Holder: <strong style={{ color: '#121212' }}>{lock.holder}</strong></div>
                <div>Acquired: {lock.acquiredAt}</div>
              </div>

              {/* TTL Draining Progress Bar */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#737373', marginBottom: '4px' }}>
                  <span>Lease TTL:</span>
                  <span>{lock.expiresInSec}s remaining</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#F4F4F2', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${lock.ttlRemaining}%`,
                      height: '100%',
                      backgroundColor: '#059669',
                      transition: 'width 0.5s linear',
                    }}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => handleRelease(lock.key)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #EAE6DF',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#DC2626',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEF2F2')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
            >
              <Unlock size={13} />
              <span>Release Lock</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
