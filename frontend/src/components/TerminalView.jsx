import React, { useState } from 'react';
import { Terminal, Play, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';

export default function TerminalView({ onRunZombieSim = () => {} }) {
  const [logs, setLogs] = useState([
    { time: '13:20:01', type: 'info', msg: 'Quorum Raft Cluster online. Term: 14, Leader: node-1.' },
    { time: '13:21:40', type: 'info', msg: 'Client 1 acquires lock on res:customer_balance with Fencing Token #101.' },
    { time: '13:21:42', type: 'warn', msg: 'Client 1 pauses (simulated GC pause / network freeze)...' },
    { time: '13:21:45', type: 'warn', msg: 'Lease expired for Client 1. PromotionHub notifies Client 2.' },
    { time: '13:21:46', type: 'success', msg: 'Client 2 acquires lock with higher Fencing Token #102.' },
    { time: '13:21:47', type: 'success', msg: 'Client 2 writes data to storage (Token #102 accepted).' },
    { time: '13:21:49', type: 'danger', msg: 'Client 1 wakes up (Zombie Worker) and attempts stale write with Token #101!' },
    { time: '13:21:50', type: 'success', msg: 'STORAGE GUARD: Token #101 < Current #102. Stale write REJECTED. Zero corruption!' },
  ]);

  const [isRunning, setIsRunning] = useState(false);

  const runSimulation = () => {
    setIsRunning(true);
    const simTime = new Date().toLocaleTimeString();
    setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        { time: simTime, type: 'info', msg: 'Initiating Kleppmann Storage Race Test...' },
        { time: simTime, type: 'warn', msg: 'Worker 1 frozen during database transaction.' },
        { time: simTime, type: 'success', msg: 'Worker 2 promoted with incremented fencing token.' },
        { time: simTime, type: 'success', msg: 'Fencing Token verification verified: Cluster invariant maintained.' },
      ]);
      setIsRunning(false);
      onRunZombieSim();
    }, 900);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #EAE6DF',
        }}
      >
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#121212' }}>
            Martin Kleppmann Storage Race Console
          </h3>
          <p style={{ fontSize: '13px', color: '#737373' }}>
            Verify how Quorum's fencing tokens stop stale writes from delayed GC workers.
          </p>
        </div>

        <button
          onClick={runSimulation}
          disabled={isRunning}
          className="midday-btn-black"
          style={{ padding: '8px 18px', fontSize: '13px', borderRadius: '8px' }}
        >
          {isRunning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          <span>{isRunning ? 'Running Simulation...' : 'Simulate Race'}</span>
        </button>
      </div>

      {/* Terminal Output Screen */}
      <div
        style={{
          backgroundColor: '#0C0C0C',
          borderRadius: '12px',
          border: '1px solid #262626',
          padding: '20px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '12px',
          minHeight: '380px',
          color: '#EDEDED',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #262626', marginBottom: '16px' }}>
          <Terminal size={14} color="#737373" />
          <span style={{ color: '#737373', fontSize: '11px' }}>quorum-daemon :: kleppmann-fencing-sandbox</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {logs.map((log, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '12px', lineHeight: 1.5 }}>
              <span style={{ color: '#555555' }}>[{log.time}]</span>
              <span
                style={{
                  color:
                    log.type === 'danger'
                      ? '#EF4444'
                      : log.type === 'warn'
                      ? '#F59E0B'
                      : log.type === 'success'
                      ? '#10B981'
                      : '#9CA3AF',
                }}
              >
                {log.msg}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
