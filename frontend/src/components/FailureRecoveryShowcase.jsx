import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, RotateCcw, Copy, Check, ChevronDown, 
  AlertTriangle, Shield, CheckCircle2, Zap, Clock, Terminal
} from 'lucide-react';

export default function FailureRecoveryShowcase() {
  const [scenario, setScenario] = useState('subscription'); // 'subscription' | 'leader-crash' | 'zombie-gc' | 'partition'
  const [activeStep, setActiveStep] = useState(0); // 0: Runs, 1: Breaks, 2: Recovers
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-play timer loop
  useEffect(() => {
    let timer;
    if (isPlaying) {
      timer = setInterval(() => {
        setActiveStep((prev) => {
          if (prev >= 2) {
            setIsPlaying(false);
            return 2;
          }
          return prev + 1;
        });
      }, 2200);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  const handleStartOver = () => {
    setIsPlaying(false);
    setActiveStep(0);
  };

  const handleTogglePlay = () => {
    if (activeStep >= 2) {
      setActiveStep(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  // Scenarios configuration
  const scenariosData = {
    'subscription': {
      title: 'Subscription & Payments',
      workflowName: 'Subscription-Workflow',
      code: [
        { num: 1, text: '@workflow.defn', highlight: false },
        { num: 2, text: 'class SubscriptionWorkflow:', highlight: false },
        { num: 3, text: '    @workflow.run', highlight: false },
        { num: 4, text: '    async def run(self, customer: Customer) -> None:', highlight: false },
        { num: 5, text: '        # 1. Acquire consensus lease with monotonic fencing token', highlight: activeStep === 0 },
        { num: 6, text: '        async with quorum_client.lock(f"sub:{customer.id}", ttl_s=10) as lock:', highlight: activeStep === 0 },
        { num: 7, text: '            # 2. Charge customer with idempotency token #104', highlight: activeStep === 0 },
        { num: 8, text: '            await payment_gateway.charge(customer.amount, token=lock.fence_token)', highlight: activeStep === 1 },
        { num: 9, text: '            # ⚠️ 504 Gateway Timeout! Network packet dropped by upstream bank', highlight: activeStep === 1, isError: true },
        { num: 10, text: '            # 🪄 Quorum auto-renews lease & safely retries activity', highlight: activeStep === 2, isRecovery: true },
        { num: 11, text: '            await payment_gateway.confirm_settlement(token=lock.fence_token)', highlight: activeStep === 2 },
      ],
      timelineEvents: [
        { 
          label: 'Lock_Acquired (Token #104)', 
          startCol: 1, 
          spanCol: 4, 
          color: '#3FA796', 
          activeAt: 0,
          status: 'SUCCESS'
        },
        { 
          label: 'Activity: Charge_Customer', 
          startCol: 4, 
          spanCol: 4, 
          color: activeStep >= 1 ? '#ef4444' : '#E3A53D', 
          activeAt: activeStep >= 1 ? 1 : 0,
          status: activeStep === 0 ? 'RUNNING' : activeStep === 1 ? 'FAILED (504 Timeout)' : 'RESOLVED'
        },
        { 
          label: 'Heartbeat_Renewed (Lease +10s)', 
          startCol: 8, 
          spanCol: 3, 
          color: '#3FA796', 
          activeAt: 2,
          status: 'HEARTBEAT_OK'
        },
        { 
          label: 'Retry: Payment_Confirmed', 
          startCol: 11, 
          spanCol: 4, 
          color: '#3FA796', 
          activeAt: 2,
          status: 'COMPLETED'
        }
      ]
    },

    'leader-crash': {
      title: 'Leader Kernel Crash & Failover',
      workflowName: 'Leader-Failover-Workflow',
      code: [
        { num: 1, text: '# 1. Distributed Raft Cluster running with 5 nodes', highlight: activeStep === 0 },
        { num: 2, text: 'leader = cluster.get_leader() # Node-2 (Term 1)', highlight: activeStep === 0 },
        { num: 3, text: 'await leader.replicate_wal(entry="proposal_42")', highlight: activeStep === 0 },
        { num: 4, text: '# ⚠️ Node-2 experiences kernel panic / power loss!', highlight: activeStep === 1, isError: true },
        { num: 5, text: 'followers.detect_heartbeat_timeout(150ms)', highlight: activeStep === 1 },
        { num: 6, text: '# 🪄 Majority quorum elects Node-3 as new Leader (Term 2)', highlight: activeStep === 2, isRecovery: true },
        { num: 7, text: 'client.auto_redirect(new_leader="node-3")', highlight: activeStep === 2 },
        { num: 8, text: 'await storage.commit_durable_state() # Zero data loss!', highlight: activeStep === 2 }
      ],
      timelineEvents: [
        { label: 'Leader_Node_2_Heartbeat', startCol: 1, spanCol: 5, color: '#E3A53D', activeAt: 0, status: 'LEADER_ACTIVE' },
        { label: 'Hardware_Crash_Detected', startCol: 5, spanCol: 3, color: '#ef4444', activeAt: 1, status: 'POWER_LOSS' },
        { label: 'Election_Timeout_Triggered', startCol: 8, spanCol: 3, color: '#E3A53D', activeAt: 1, status: 'ELECTION_RUNNING' },
        { label: 'New_Leader_Node_3_Elected', startCol: 11, spanCol: 4, color: '#3FA796', activeAt: 2, status: 'TERM_2_STABLE' }
      ]
    },

    'zombie-gc': {
      title: 'Zombie Worker & GC Pause',
      workflowName: 'Martin-Kleppmann-Fencing-Check',
      code: [
        { num: 1, text: '# Client 1 acquires lock on database record', highlight: activeStep === 0 },
        { num: 2, text: 'token_alpha = await quorum.acquire("db", ttl=5000) # Token #33', highlight: activeStep === 0 },
        { num: 3, text: '# ⚠️ Client 1 suffers 12-second Stop-The-World GC Pause!', highlight: activeStep === 1, isError: true },
        { num: 4, text: 'lease_alpha.expire(); token_beta = await quorum.acquire() # Token #34', highlight: activeStep === 1 },
        { num: 5, text: '# 🪄 Client 1 wakes up & tries to write with stale Token #33', highlight: activeStep === 2, isRecovery: true },
        { num: 6, text: 'storage.validate(token=33) -> REJECTED (ERR_FENCE_VIOLATION)', highlight: activeStep === 2, isRecovery: true },
        { num: 7, text: '# Storage protected from silent data corruption!', highlight: activeStep === 2 }
      ],
      timelineEvents: [
        { label: 'Client_1_Granted (Token #33)', startCol: 1, spanCol: 4, color: '#3FA796', activeAt: 0, status: 'VALID' },
        { label: 'Stop-The-World_GC_Pause', startCol: 4, spanCol: 4, color: '#ef4444', activeAt: 1, status: 'CLIENT_FROZEN' },
        { label: 'Client_2_Granted (Token #34)', startCol: 6, spanCol: 5, color: '#E3A53D', activeAt: 1, status: 'LEASE_TRANSFERRED' },
        { label: 'Stale_Write_Blocked (Fence Guard)', startCol: 11, spanCol: 4, color: '#3FA796', activeAt: 2, status: 'SAFETY_PRESERVED' }
      ]
    },

    'partition': {
      title: '3v2 Network Partition',
      workflowName: 'Split-Brain-Defense-Workflow',
      code: [
        { num: 1, text: '# 5-Node cluster operational: [node-1, node-2, node-3, node-4, node-5]', highlight: activeStep === 0 },
        { num: 2, text: 'await quorum.verify_majority(required=3)', highlight: activeStep === 0 },
        { num: 3, text: '# ⚠️ Fiber cut splits network: Majority [1,2,3] vs Minority [4,5]', highlight: activeStep === 1, isError: true },
        { num: 4, text: 'minority_nodes.propose() -> DENIED (No Quorum)', highlight: activeStep === 1 },
        { num: 5, text: '# 🪄 Majority partition continues committing linearizable transactions', highlight: activeStep === 2, isRecovery: true },
        { num: 6, text: 'network.heal(); followers.re_sync_wal_from_leader()', highlight: activeStep === 2 }
      ],
      timelineEvents: [
        { label: '5_Node_Consensus_Quorum', startCol: 1, spanCol: 4, color: '#3FA796', activeAt: 0, status: '5/5 HEALTHY' },
        { label: 'Network_Split_3v2_Active', startCol: 4, spanCol: 4, color: '#ef4444', activeAt: 1, status: 'PARTITIONED' },
        { label: 'Minority_Write_Refused', startCol: 7, spanCol: 4, color: '#E3A53D', activeAt: 1, status: 'SPLIT_BRAIN_BLOCKED' },
        { label: 'Partition_Healed_WAL_Synced', startCol: 11, spanCol: 4, color: '#3FA796', activeAt: 2, status: 'RECONNECTED' }
      ]
    }
  };

  const currentScenario = scenariosData[scenario];

  const handleCopyCode = () => {
    const raw = currentScenario.code.map((c) => c.text).join('\n');
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', width: '100%', padding: '20px 0' }}>
      
      {/* 1. Header & Description matching screenshot */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 300, letterSpacing: '-0.025em', color: '#ffffff', fontFamily: 'var(--font-sans)', marginBottom: '12px' }}>
          Watch a Lease recover from failure
        </h2>
        <p style={{ fontSize: '1.05rem', color: '#9ca3af', maxWidth: '760px', margin: '0 auto', lineHeight: 1.5 }}>
          Choose a scenario, then run the demo to see Quorum preserve completed work, retry the failed step, and finish the Workflow.
        </p>
      </div>

      {/* 2. Interactive Card Container */}
      <div 
        className="glass-panel" 
        style={{ 
          background: 'rgba(9, 12, 18, 0.95)', 
          border: '1px solid rgba(255, 255, 255, 0.1)', 
          borderRadius: '12px', 
          overflow: 'hidden',
          boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(227, 165, 61, 0.05)'
        }}
      >
        
        {/* Top Control Bar matching screenshot */}
        <div 
          style={{ 
            padding: '14px 24px', 
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)', 
            background: 'rgba(14, 18, 28, 0.8)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            flexWrap: 'wrap', 
            gap: '16px' 
          }}
        >
          
          {/* Scenario Selector Dropdown */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              value={scenario}
              onChange={(e) => { setScenario(e.target.value); setActiveStep(0); setIsPlaying(false); }}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '7px 32px 7px 14px',
                borderRadius: '100px',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <option value="subscription" style={{ background: '#0b0e17' }}>Subscription</option>
              <option value="leader-crash" style={{ background: '#0b0e17' }}>Leader Crash & Failover</option>
              <option value="zombie-gc" style={{ background: '#0b0e17' }}>Zombie Worker & GC Pause</option>
              <option value="partition" style={{ background: '#0b0e17' }}>3v2 Network Partition</option>
            </select>
            <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '12px', pointerEvents: 'none' }} />
          </div>

          {/* Center 3-Step Process Track matching screenshot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            
            {/* Step 1: Workflow runs */}
            <div 
              onClick={() => setActiveStep(0)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                paddingBottom: '4px',
                borderBottom: activeStep === 0 ? '2px solid #3FA796' : '2px solid transparent',
                transition: 'all 0.2s ease'
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: activeStep === 0 ? '#3FA796' : '#64748b' }}></span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: activeStep === 0 ? '#ffffff' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Zap size={14} color={activeStep === 0 ? '#3FA796' : '#64748b'} />
                Workflow runs
              </span>
            </div>

            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>———</span>

            {/* Step 2: Something breaks */}
            <div 
              onClick={() => setActiveStep(1)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                paddingBottom: '4px',
                borderBottom: activeStep === 1 ? '2px solid #ef4444' : '2px solid transparent',
                transition: 'all 0.2s ease'
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: activeStep === 1 ? '#ef4444' : '#64748b' }}></span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: activeStep === 1 ? '#ffffff' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <AlertTriangle size={14} color={activeStep === 1 ? '#ef4444' : '#64748b'} />
                Something breaks
              </span>
            </div>

            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>———</span>

            {/* Step 3: It recovers */}
            <div 
              onClick={() => setActiveStep(2)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                paddingBottom: '4px',
                borderBottom: activeStep === 2 ? '2px solid #3FA796' : '2px solid transparent',
                transition: 'all 0.2s ease'
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: activeStep === 2 ? '#3FA796' : '#64748b' }}></span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: activeStep === 2 ? '#ffffff' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle2 size={14} color={activeStep === 2 ? '#3FA796' : '#64748b'} />
                It recovers
              </span>
            </div>

          </div>

          {/* Action Buttons: Play (Amber) & Start Over */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            
            {/* Play/Pause Button */}
            <button
              onClick={handleTogglePlay}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#E3A53D',
                color: '#0A0C10',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(227, 165, 61, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              {isPlaying ? <Pause size={14} color="#0A0C10" /> : <Play size={14} color="#0A0C10" fill="#0A0C10" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            {/* Start Over Button */}
            <button
              onClick={handleStartOver}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                color: '#cbd5e1',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
                padding: '6px 8px'
              }}
            >
              <RotateCcw size={13} />
              Start Over
            </button>

          </div>

        </div>

        {/* 3. Split Body: Code on Left | Event Timeline on Right */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1fr) 1.2fr', minHeight: '380px' }}>
          
          {/* Left Column: Your Workflow Code */}
          <div style={{ borderRight: '1px solid rgba(255, 255, 255, 0.08)', background: '#07090e', display: 'flex', flexDirection: 'column' }}>
            
            {/* Code Header Bar */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                Your Workflow Code
              </span>
              <button
                onClick={handleCopyCode}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                title="Copy code"
              >
                {copied ? <Check size={14} color="#3FA796" /> : <Copy size={14} />}
              </button>
            </div>

            {/* Code Lines with Dynamic Active Highlight */}
            <div style={{ padding: '16px 0', flex: 1, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: '1.65' }}>
              {currentScenario.code.map((line) => {
                let bgColor = 'transparent';
                let textColor = '#cbd5e1';

                if (line.isError) {
                  bgColor = 'rgba(239, 68, 68, 0.15)';
                  textColor = '#fca5a5';
                } else if (line.isRecovery) {
                  bgColor = 'rgba(63, 167, 150, 0.15)';
                  textColor = '#3FA796';
                } else if (line.highlight) {
                  bgColor = 'rgba(227, 165, 61, 0.12)';
                  textColor = '#E3A53D';
                }

                return (
                  <div 
                    key={line.num}
                    style={{ 
                      display: 'flex', 
                      padding: '2px 18px',
                      background: bgColor,
                      transition: 'background 0.25s ease'
                    }}
                  >
                    <span style={{ width: '28px', color: '#475569', userSelect: 'none', flexShrink: 0, fontSize: '0.75rem' }}>
                      {line.num}
                    </span>
                    <span style={{ color: textColor, whiteSpace: 'pre' }}>
                      {line.text}
                    </span>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Right Column: Quorum Event Timeline (Gantt Chart View) */}
          <div style={{ background: '#090b10', padding: '16px 22px', display: 'flex', flexDirection: 'column' }}>
            
            {/* Timeline Header */}
            <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                Quorum Event Timeline
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                Time (seconds) →
              </span>
            </div>

            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{currentScenario.workflowName}</span>
              <span style={{ fontSize: '0.65rem', background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                RUN_ID: 9bf2a-44c
              </span>
            </div>

            {/* Gantt Grid with Vertical Tick Lines */}
            <div style={{ position: 'relative', flex: 1, minHeight: '220px', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '14px', background: 'rgba(6, 8, 12, 0.6)' }}>
              
              {/* Vertical Tick Columns */}
              <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', pointerEvents: 'none' }}>
                {Array.from({ length: 15 }).map((_, i) => (
                  <div key={i} style={{ borderRight: '1px solid rgba(255, 255, 255, 0.04)', height: '100%' }} />
                ))}
              </div>

              {/* Event Bars along the timeline */}
              <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '10px' }}>
                {currentScenario.timelineEvents.map((evt, idx) => {
                  const isVisible = activeStep >= evt.activeAt;
                  const isCurrent = activeStep === evt.activeAt;

                  if (!isVisible) return null;

                  const leftPct = ((evt.startCol - 1) / 15) * 100;
                  const widthPct = (evt.spanCol / 15) * 100;

                  return (
                    <div 
                      key={idx}
                      style={{
                        marginLeft: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: isCurrent ? `${evt.color}22` : 'rgba(255, 255, 255, 0.04)',
                        border: `1px solid ${evt.color}`,
                        borderRadius: '6px',
                        padding: '8px 12px',
                        boxShadow: isCurrent ? `0 0 14px ${evt.color}33` : 'none',
                        animation: 'fadeIn 0.3s ease-in-out',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                          {evt.label}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: evt.color, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          {evt.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Current Phase Status Explainer */}
            <div style={{ marginTop: '16px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeStep === 0 && <span style={{ color: '#3FA796', fontWeight: 600, fontSize: '0.78rem' }}>● PHASE 1: Normal Execution — Lease granted by Raft leader with monotonic token</span>}
                {activeStep === 1 && <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.78rem' }}>⚠️ PHASE 2: Failure Detected — Step interrupted without corrupting committed state</span>}
                {activeStep === 2 && <span style={{ color: '#3FA796', fontWeight: 600, fontSize: '0.78rem' }}>🪄 PHASE 3: Automatic Recovery — Quorum retries and safely concludes workflow</span>}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                Step {activeStep + 1} of 3
              </span>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
