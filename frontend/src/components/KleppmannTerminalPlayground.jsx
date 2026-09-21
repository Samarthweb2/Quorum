import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, Play, RotateCcw, Copy, Check, Terminal, Database, Code2, AlertTriangle, ArrowRight } from 'lucide-react';

const SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 380,
  damping: 28,
};

export default function KleppmannTerminalPlayground({ status }) {
  const [engineMode, setEngineMode] = useState('postgres'); // 'postgres' | 'redis'
  const [currentStep, setCurrentStep] = useState(0); // 0 = idle, 1 = worker A acquired, 2 = GC paused, 3 = expired, 4 = worker B wrote, 5 = worker A rejected
  const [isRunningAuto, setIsRunningAuto] = useState(false);
  const [logs, setLogs] = useState([
    {
      id: 1,
      time: '00:00.000',
      tag: 'SYSTEM',
      color: '#64748b',
      text: 'Quorum Kleppmann Fencing Terminal initialized. Storage engine: PostgreSQL (ACID guarded).',
    },
    {
      id: 2,
      time: '00:00.010',
      tag: 'STORAGE',
      color: '#94a3b8',
      text: 'Account table: id=1042, balance=$1000.00, last_fence_token=40.',
    },
  ]);
  const [copied, setCopied] = useState(false);
  const terminalEndRef = useRef(null);

  // Storage State
  const [storageState, setStorageState] = useState({
    balance: 1000,
    lastFenceToken: 40,
    rejectedCount: 0,
    lastCommittedBy: 'INIT',
    status: 'PRISTINE',
  });

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (tag, color, text) => {
    const time = new Date().toISOString().substring(14, 23);
    setLogs((prev) => [...prev, { id: Date.now() + Math.random(), time, tag, color, text }]);
  };

  const handleStep1 = () => {
    setCurrentStep(1);
    addLog(
      'LEASE_ACQUIRE',
      '#38bdf8',
      'Worker-A proposed ACQUIRE "account:1042" (ttl=4000ms). Quorum Raft granted monotonic fencing token #41.'
    );
  };

  const handleStep2 = () => {
    setCurrentStep(2);
    addLog(
      'GC_PAUSE',
      '#f59e0b',
      'Worker-A enters Stop-The-World GC pause / network partition! Thread frozen. Worker-A lease clock continues ticking on cluster.'
    );
  };

  const handleStep3 = () => {
    setCurrentStep(3);
    addLog(
      'LEASE_EXPIRE',
      '#f87171',
      'Worker-A lease expired at t=4000ms. Contender Worker-B acquires "account:1042", granted monotonic fencing token #42.'
    );
  };

  const handleStep4 = () => {
    setCurrentStep(4);
    setStorageState((prev) => ({
      ...prev,
      balance: 750,
      lastFenceToken: 42,
      lastCommittedBy: 'Worker-B (Token #42)',
      status: 'COMMITTED',
    }));
    if (engineMode === 'postgres') {
      addLog(
        'SQL_COMMIT',
        '#10b981',
        'Worker-B: UPDATE accounts SET balance = balance - 250, last_fence_token = 42 WHERE id = 1042 AND last_fence_token < 42;'
      );
      addLog('STORAGE', '#10b981', 'Result: 1 row affected. New balance=$750.00, storage.last_fence_token=42.');
    } else {
      addLog('REDIS_LUA', '#10b981', 'Worker-B atomic EVALSHA: redis.call("SET", "account:1042:balance", 750), token=42.');
      addLog('STORAGE', '#10b981', 'Result: OK. Storage fence token bumped to 42.');
    }
  };

  const handleStep5 = () => {
    setCurrentStep(5);
    setStorageState((prev) => ({
      ...prev,
      rejectedCount: prev.rejectedCount + 1,
      status: 'FENCED_OUT',
    }));
    addLog(
      'ZOMBIE_WAKE',
      '#f43f5e',
      'Worker-A wakes up from GC pause! Completely unaware its lease expired. Worker-A attempts to write using stale token #41...'
    );
    if (engineMode === 'postgres') {
      addLog(
        'SQL_REJECT',
        '#ef4444',
        'Worker-A: UPDATE accounts SET balance = balance - 100, last_fence_token = 41 WHERE id = 1042 AND last_fence_token < 41;'
      );
      addLog(
        'GUARD_VERDICT',
        '#ef4444',
        'FATAL: 0 rows affected! Condition "42 < 41" evaluated to FALSE. FencingTokenStaleError thrown.'
      );
    } else {
      addLog(
        'REDIS_LUA',
        '#ef4444',
        'Worker-A Lua guard: token 41 <= current 42 -> return redis.error_reply("ERR_STALE_FENCING_TOKEN")'
      );
      addLog('GUARD_VERDICT', '#ef4444', 'FATAL: Stale write blocked at storage engine. Zero data corruption.');
    }
    addLog(
      'INVARIANT',
      '#10b981',
      '✔ Kleppmann Monotonic Safety Verified: Stale Zombie write safely discarded. Balance remains $750.00.'
    );
  };

  const handleRunFullSimulation = async () => {
    if (isRunningAuto) return;
    setIsRunningAuto(true);
    handleReset();

    await new Promise((r) => setTimeout(r, 400));
    handleStep1();
    await new Promise((r) => setTimeout(r, 1200));
    handleStep2();
    await new Promise((r) => setTimeout(r, 1200));
    handleStep3();
    await new Promise((r) => setTimeout(r, 1200));
    handleStep4();
    await new Promise((r) => setTimeout(r, 1400));
    handleStep5();

    setIsRunningAuto(false);
  };

  const handleReset = () => {
    setCurrentStep(0);
    setStorageState({
      balance: 1000,
      lastFenceToken: 40,
      rejectedCount: 0,
      lastCommittedBy: 'INIT',
      status: 'PRISTINE',
    });
    setLogs([
      {
        id: Date.now(),
        time: '00:00.000',
        tag: 'RESET',
        color: '#64748b',
        text: `Playground reset. Target engine: ${engineMode.toUpperCase()}. Account id=1042, balance=$1000.00, token=40.`,
      },
    ]);
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.time}] [${l.tag}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        background: '#08090a',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        boxShadow: '0 8px 32px -8px rgba(0, 0, 0, 0.9)',
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

      {/* Terminal Title Bar */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#0d0e11',
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
            <Terminal size={14} color="#f1f5f9" />
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
                Kleppmann Fencing Terminal
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
                ZOMBIE WORKER MITIGATION
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
              Monotonic fencing token validation protecting downstream databases from stale GC-paused workers
            </p>
          </div>
        </div>

        {/* Engine Toggle & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '2px',
            }}
          >
            <button
              onClick={() => {
                setEngineMode('postgres');
                handleReset();
              }}
              style={{
                background: engineMode === 'postgres' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                color: engineMode === 'postgres' ? '#f1f5f9' : '#64748b',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono, monospace)',
                cursor: 'pointer',
              }}
            >
              PostgreSQL
            </button>
            <button
              onClick={() => {
                setEngineMode('redis');
                handleReset();
              }}
              style={{
                background: engineMode === 'redis' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                color: engineMode === 'redis' ? '#f1f5f9' : '#64748b',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono, monospace)',
                cursor: 'pointer',
              }}
            >
              Redis Lua
            </button>
          </div>

          <button
            onClick={handleRunFullSimulation}
            disabled={isRunningAuto}
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '0.75rem',
              cursor: isRunningAuto ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 500,
            }}
          >
            <Play size={12} fill="#34d399" />
            {isRunningAuto ? 'Running...' : 'Run Simulation'}
          </button>

          <button
            onClick={handleReset}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '5px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Reset simulation"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Step Sequence Toolbar */}
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(255, 255, 255, 0.01)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
        }}
      >
        <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)', marginRight: '4px' }}>
          STEPS:
        </span>

        <button
          onClick={handleStep1}
          disabled={currentStep >= 1 || isRunningAuto}
          style={{
            background: currentStep >= 1 ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.03)',
            color: currentStep >= 1 ? '#38bdf8' : '#94a3b8',
            border: `1px solid ${currentStep >= 1 ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            borderRadius: '4px',
            padding: '4px 10px',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono, monospace)',
            cursor: currentStep >= 1 ? 'default' : 'pointer',
          }}
        >
          1. Acquire (Worker A)
        </button>

        <ArrowRight size={12} color="rgba(255, 255, 255, 0.15)" />

        <button
          onClick={handleStep2}
          disabled={currentStep < 1 || currentStep >= 2 || isRunningAuto}
          style={{
            background: currentStep >= 2 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.03)',
            color: currentStep >= 2 ? '#f59e0b' : '#94a3b8',
            border: `1px solid ${currentStep >= 2 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            borderRadius: '4px',
            padding: '4px 10px',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono, monospace)',
            cursor: currentStep === 1 ? 'pointer' : 'default',
          }}
        >
          2. Freeze GC (Worker A)
        </button>

        <ArrowRight size={12} color="rgba(255, 255, 255, 0.15)" />

        <button
          onClick={handleStep3}
          disabled={currentStep < 2 || currentStep >= 3 || isRunningAuto}
          style={{
            background: currentStep >= 3 ? 'rgba(248, 113, 113, 0.1)' : 'rgba(255, 255, 255, 0.03)',
            color: currentStep >= 3 ? '#f87171' : '#94a3b8',
            border: `1px solid ${currentStep >= 3 ? 'rgba(248, 113, 113, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            borderRadius: '4px',
            padding: '4px 10px',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono, monospace)',
            cursor: currentStep === 2 ? 'pointer' : 'default',
          }}
        >
          3. Lease Expires ➔ Worker B
        </button>

        <ArrowRight size={12} color="rgba(255, 255, 255, 0.15)" />

        <button
          onClick={handleStep4}
          disabled={currentStep < 3 || currentStep >= 4 || isRunningAuto}
          style={{
            background: currentStep >= 4 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.03)',
            color: currentStep >= 4 ? '#10b981' : '#94a3b8',
            border: `1px solid ${currentStep >= 4 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            borderRadius: '4px',
            padding: '4px 10px',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono, monospace)',
            cursor: currentStep === 3 ? 'pointer' : 'default',
          }}
        >
          4. Worker B Writes (#42)
        </button>

        <ArrowRight size={12} color="rgba(255, 255, 255, 0.15)" />

        <button
          onClick={handleStep5}
          disabled={currentStep < 4 || currentStep >= 5 || isRunningAuto}
          style={{
            background: currentStep >= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
            color: currentStep >= 5 ? '#ef4444' : '#94a3b8',
            border: `1px solid ${currentStep >= 5 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
            borderRadius: '4px',
            padding: '4px 10px',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono, monospace)',
            cursor: currentStep === 4 ? 'pointer' : 'default',
          }}
        >
          5. Worker A Wakes (Stale #41)
        </button>
      </div>

      {/* Middle Split: Storage State & Guard Logic vs Console */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          minHeight: '380px',
        }}
      >
        {/* Left Column: Storage Engine Table & Guard Code */}
        <div
          style={{
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            background: 'rgba(255, 255, 255, 0.01)',
          }}
        >
          {/* Database Inspector Card */}
          <div
            style={{
              background: '#0d0e11',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={13} color="#38bdf8" />
                DATABASE STORAGE INSPECTOR
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: storageState.rejectedCount > 0 ? '#10b981' : '#94a3b8',
                  background: storageState.rejectedCount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: `1px solid ${storageState.rejectedCount > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)'}`,
                }}
              >
                {storageState.rejectedCount > 0 ? 'SPLIT-BRAIN PROTECTED' : 'READY'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono, monospace)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', paddingBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>TABLE / ROW:</span>
                <span style={{ color: '#f1f5f9' }}>accounts (id=1042)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', paddingBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>BALANCE:</span>
                <span style={{ color: storageState.balance === 1000 ? '#f1f5f9' : '#10b981', fontWeight: 600 }}>
                  ${storageState.balance.toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', paddingBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>LAST FENCE TOKEN:</span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                  #{storageState.lastFenceToken}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', paddingBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>ZOMBIE WRITES BLOCKED:</span>
                <span style={{ color: storageState.rejectedCount > 0 ? '#ef4444' : '#64748b', fontWeight: 700 }}>
                  {storageState.rejectedCount}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>LAST WRITER:</span>
                <span style={{ color: '#94a3b8' }}>{storageState.lastCommittedBy}</span>
              </div>
            </div>
          </div>

          {/* Guard Query Inspector */}
          <div
            style={{
              background: '#0d0e11',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Code2 size={13} color="#f59e0b" />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f1f5f9' }}>
                STORAGE GUARD LOGIC ({engineMode.toUpperCase()})
              </span>
            </div>

            <pre
              style={{
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono, monospace)',
                color: '#94a3b8',
                lineHeight: '1.45',
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '10px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                overflowX: 'auto',
                margin: 0,
                flex: 1,
              }}
            >
              {engineMode === 'postgres' ? (
                <>
                  <span style={{ color: '#64748b' }}>-- Monotonic SQL Guard Clause</span>{'\n'}
                  <span style={{ color: '#38bdf8' }}>UPDATE</span> accounts{'\n'}
                  <span style={{ color: '#38bdf8' }}>SET</span> balance = balance - :amount,{'\n'}
                  {'    '}last_fence_token = :token{'\n'}
                  <span style={{ color: '#38bdf8' }}>WHERE</span> id = :id{'\n'}
                  {'  '}<span style={{ color: '#f59e0b' }}>AND last_fence_token &lt; :token</span>;{'\n\n'}
                  <span style={{ color: '#64748b' }}>-- If :token is stale (41 &lt; 42):</span>{'\n'}
                  <span style={{ color: '#f87171' }}>-- rows_affected = 0 (REJECTED)</span>
                </>
              ) : (
                <>
                  <span style={{ color: '#64748b' }}>-- Atomic Redis Lua Guard</span>{'\n'}
                  <span style={{ color: '#38bdf8' }}>local</span> cur = redis.call(<span style={{ color: '#a5f3fc' }}>'GET'</span>, KEYS[1]){'\n'}
                  <span style={{ color: '#38bdf8' }}>if</span> cur and tonumber(cur) &gt;= tonumber(ARGV[1]) <span style={{ color: '#38bdf8' }}>then</span>{'\n'}
                  {'  '}<span style={{ color: '#f87171' }}>return redis.error_reply('STALE_TOKEN')</span>{'\n'}
                  <span style={{ color: '#38bdf8' }}>end</span>{'\n'}
                  redis.call(<span style={{ color: '#a5f3fc' }}>'SET'</span>, KEYS[1], ARGV[1]){'\n'}
                  <span style={{ color: '#10b981' }}>return 1</span>
                </>
              )}
            </pre>
          </div>
        </div>

        {/* Right Column: Authentic Terminal Console */}
        <div
          style={{
            background: '#08090a',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {/* Terminal Sub-header */}
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.7rem',
              color: '#64748b',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <span>quorum-guard-agent — pts/1</span>
            <button
              onClick={handleCopyLogs}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.7rem',
              }}
            >
              {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Terminal Stream */}
          <div
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              maxHeight: '360px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.72rem',
              lineHeight: '1.6',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {logs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={SPRING_TRANSITION}
                style={{ display: 'flex', gap: '8px', wordBreak: 'break-all' }}
              >
                <span style={{ color: '#475569', flexShrink: 0 }}>[{log.time}]</span>
                <span
                  style={{
                    color: log.color,
                    fontWeight: 600,
                    flexShrink: 0,
                    width: '120px',
                  }}
                >
                  [{log.tag}]
                </span>
                <span style={{ color: '#cbd5e1' }}>{log.text}</span>
              </motion.div>
            ))}
            <div ref={terminalEndRef} />
          </div>

          {/* Terminal Command Line Footer */}
          <div
            style={{
              padding: '8px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.04)',
              background: '#0d0e11',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
              color: '#94a3b8',
            }}
          >
            <span style={{ color: '#10b981' }}>quorum-cluster</span>
            <span style={{ color: '#64748b' }}>on</span>
            <span style={{ color: '#38bdf8' }}>leader/node-1</span>
            <span style={{ color: '#f59e0b' }}>$</span>
            <span style={{ color: '#f1f5f9' }}>
              {currentStep === 0
                ? 'waiting for simulation trigger...'
                : currentStep === 1
                ? 'worker-a holding token 41'
                : currentStep === 2
                ? 'worker-a thread halted (GC stall)'
                : currentStep === 3
                ? 'worker-b acquired token 42'
                : currentStep === 4
                ? 'worker-b write committed (t=42)'
                : 'worker-a stale write fenced out!'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
