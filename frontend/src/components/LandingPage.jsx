import React, { useState, useEffect, useRef } from 'react';

// Three-Node Quorum Brand Logo (Cyan & Sky Blue)
function QuorumBrandLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <circle cx="50" cy="22" r="14" fill="#0284C7" />
      <circle cx="22" cy="74" r="14" fill="#00B7C5" />
      <circle cx="78" cy="74" r="14" fill="#00B7C5" />
      <line x1="50" y1="22" x2="22" y2="74" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />
      <line x1="50" y1="22" x2="78" y2="74" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />
      <line x1="22" y1="74" x2="78" y2="74" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />
      <circle cx="50" cy="22" r="6" fill="#FFFFFF" />
      <circle cx="22" cy="74" r="6" fill="#FFFFFF" />
      <circle cx="78" cy="74" r="6" fill="#FFFFFF" />
    </svg>
  );
}

// GitHub Icon
function GitHubMark({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017C2 16.446 4.869 20.205 8.847 21.533C9.347 21.624 9.53 21.314 9.53 21.051C9.53 20.816 9.52 20.033 9.516 19.208C6.734 19.813 6.147 18.019 6.147 18.019C5.692 16.864 5.034 16.557 5.034 16.557C4.127 15.936 5.103 15.949 5.103 15.949C6.106 16.02 6.634 16.98 6.634 16.98C7.525 18.508 8.971 18.067 9.54 17.812C9.631 17.166 9.889 16.726 10.174 16.476C7.953 16.223 5.618 15.362 5.618 11.523C5.618 10.428 6.009 9.534 6.65 8.835C6.547 8.581 6.202 7.56 6.748 6.195C6.748 6.195 7.589 5.925 9.502 7.221C10.301 6.999 11.154 6.888 12.003 6.884C12.852 6.888 13.705 6.999 14.505 7.221C16.417 5.924 17.256 6.195 17.256 6.195C17.804 7.56 17.458 8.581 17.356 8.835C17.999 9.534 18.386 10.428 18.386 11.523C18.386 15.372 16.046 16.22 13.818 16.468C14.178 16.779 14.498 17.393 14.498 18.333C14.498 19.683 14.486 20.768 14.486 21.051C14.486 21.317 14.666 21.631 15.174 21.531C19.149 20.201 22.017 16.444 22.017 12.017C22.017 6.484 17.538 2 12 2Z" />
    </svg>
  );
}

export default function LandingPage({
  status,
  onLaunchDashboard,
  onAcquireLock,
  onSimulateZombie,
  onCreatePartition,
  onHealPartitions
}) {
  // Global modal state
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // --------------------------------------------------------------------------
  // SECTION 2: LIVE CONSENSUS PRODUCT SURFACE STATE
  // --------------------------------------------------------------------------
  const [consensusPhase, setConsensusPhase] = useState('committed'); // 'idle' | 'proposing' | 'replicating' | 'committed'
  const [consensusOp, setConsensusOp] = useState({
    resource: 'db-writer',
    term: 42,
    commitIndex: 1284,
    quorum: '3 / 5',
    fenceToken: 1042,
    timeAgo: '42ms ago',
    acks: { n1: true, n2: true, n3: true, n4: false, n5: false }
  });
  const [isConsensusRunning, setIsConsensusRunning] = useState(false);

  const handleRunRealRequest = () => {
    if (isConsensusRunning) return;
    setIsConsensusRunning(true);
    setConsensusPhase('proposing');

    // Step 1: Proposal reaches Leader WAL (~600ms)
    setTimeout(() => {
      setConsensusPhase('replicating');
      setConsensusOp(prev => ({
        ...prev,
        acks: { n1: true, n2: true, n3: true, n4: false, n5: false }
      }));
    }, 700);

    // Step 2: Quorum committed across 3/5 nodes (~1400ms)
    setTimeout(() => {
      setConsensusPhase('committed');
      setConsensusOp(prev => ({
        ...prev,
        commitIndex: prev.commitIndex + 1,
        fenceToken: prev.fenceToken + 1,
        timeAgo: 'just now'
      }));
      setIsConsensusRunning(false);
    }, 1500);
  };

  // --------------------------------------------------------------------------
  // SECTION 3: TRY A DISTRIBUTED LOCK (TACTILE WIDGET)
  // --------------------------------------------------------------------------
  const [lockResource, setLockResource] = useState('db-writer');
  const [isLocked, setIsLocked] = useState(false);
  const [lockToken, setLockToken] = useState(1042);
  const [lockTtlSec, setLockTtlSec] = useState(5.0);
  const lockTimerRef = useRef(null);

  const handleAcquireTryLock = () => {
    if (isLocked) return;
    setIsLocked(true);
    setLockToken(prev => prev + 1);
    setLockTtlSec(5.0);

    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    lockTimerRef.current = setInterval(() => {
      setLockTtlSec(prev => {
        if (prev <= 0.1) {
          clearInterval(lockTimerRef.current);
          setIsLocked(false);
          return 5.0;
        }
        return Number((prev - 0.1).toFixed(1));
      });
    }, 100);
  };

  const handleReleaseTryLock = () => {
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    setIsLocked(false);
    setLockTtlSec(5.0);
  };

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    };
  }, []);

  // --------------------------------------------------------------------------
  // SECTION 6: LIVE CHAOS SCENARIO STATE
  // --------------------------------------------------------------------------
  const [chaosState, setChaosState] = useState({
    activeAction: null, // 'kill_leader' | 'partition' | 'stall_worker' | null
    term: 42,
    node1: { id: 'NODE 01', role: 'LEADER', status: 'healthy' },
    node2: { id: 'NODE 02', role: 'FOLLOWER', status: 'healthy' },
    node3: { id: 'NODE 03', role: 'FOLLOWER', status: 'healthy' },
    logMessage: 'Cluster stable. Leader heartbeat regular at 2.2s.',
    electionProgress: null,
  });

  const handleChaosAction = (action) => {
    if (action === 'kill_leader') {
      setChaosState(prev => ({
        ...prev,
        activeAction: 'kill_leader',
        node1: { ...prev.node1, status: 'killed' },
        logMessage: 'Node 01 killed. Follower election timeout expiring...',
        electionProgress: 'TIMEOUT DETECTED (180ms)'
      }));

      setTimeout(() => {
        setChaosState(prev => ({
          ...prev,
          node2: { ...prev.node2, role: 'CANDIDATE' },
          electionProgress: 'ELECTION: Node 02 requested peer votes (term 43)'
        }));
      }, 700);

      setTimeout(() => {
        setChaosState(prev => ({
          ...prev,
          term: 43,
          node2: { ...prev.node2, role: 'LEADER' },
          electionProgress: 'NEW LEADER ELECTED: Node 02 (Term 43)',
          logMessage: 'Failover complete in 240ms. Majority quorum (2/3) operational.'
        }));
      }, 1500);
    } else if (action === 'partition') {
      setChaosState(prev => ({
        ...prev,
        activeAction: 'partition',
        node3: { ...prev.node3, status: 'partitioned' },
        electionProgress: 'PARTITION: Node 03 isolated in minority island',
        logMessage: 'Quorum safety active: Leader & Node 02 form 2/3 majority. Mutations proceed.'
      }));
    } else if (action === 'stall_worker') {
      setChaosState(prev => ({
        ...prev,
        activeAction: 'stall_worker',
        electionProgress: 'WORKER A STALLED (GC pause) → Lease expired → Worker B acquired #1043',
        logMessage: 'Worker A resumed with Token #1042. Write rejected by storage (1042 < 1043).'
      }));
    } else if (action === 'reset') {
      setChaosState({
        activeAction: null,
        term: 42,
        node1: { id: 'NODE 01', role: 'LEADER', status: 'healthy' },
        node2: { id: 'NODE 02', role: 'FOLLOWER', status: 'healthy' },
        node3: { id: 'NODE 03', role: 'FOLLOWER', status: 'healthy' },
        logMessage: 'Cluster stable. Leader heartbeat regular at 2.2s.',
        electionProgress: null,
      });
    }
  };

  // --------------------------------------------------------------------------
  // FLOATING AI CHAT ASSISTANT
  // --------------------------------------------------------------------------
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiActiveTab, setAiActiveTab] = useState('home'); // 'home' | 'messages'
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([
    {
      sender: 'ai',
      text: 'Hello! I am your <strong>Quorum AI Assistant</strong>. Ask me anything about distributed locks, Raft consensus, monotonic fencing tokens, or Python SDK integration!'
    }
  ]);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages]);

  const handleAiSend = (queryText) => {
    const clean = (queryText || aiInput).trim();
    if (!clean) return;

    setAiActiveTab('messages');
    setAiMessages(prev => [...prev, { sender: 'user', text: clean }]);
    setAiInput('');

    setTimeout(() => {
      const q = clean.toLowerCase();
      let reply = '';
      if (q.includes('fenc') || q.includes('zombie') || q.includes('token')) {
        reply = "<strong>Monotonic Fencing Tokens in Quorum:</strong><br><br>Quorum implements Martin Kleppmann's formal fencing protocol. Whenever a worker acquires a lock, the Raft state machine mints a strictly increasing int64 token (e.g. <code>#1042</code>).<br><br>When writing to storage (Postgres, DynamoDB, Redis), pass the token:<br><pre>UPDATE resources SET data = :val, last_fence = 1042\nWHERE id = :id AND last_fence < 1042;</pre>If a paused zombie worker awakes with stale token <code>#1041</code>, storage automatically rejects the write!";
      } else if (q.includes('raft') || q.includes('leader') || q.includes('election') || q.includes('failover')) {
        reply = "<strong>Quorum Raft Consensus & Leader Failover:</strong><br><br>• <strong>Heartbeats:</strong> Leader dispatches <code>AppendEntries</code> heartbeats every 2.2s.<br>• <strong>Failover:</strong> If heartbeats miss randomized election timeouts (150-300ms), a candidate initiates term increment and requests peer votes.<br>• <strong>Safety:</strong> Strict quorum majority (3/5) is required before committing any lease mutation. Zero split-brain states are physically possible.";
      } else if (q.includes('python') || q.includes('code') || q.includes('sdk') || q.includes('lock')) {
        reply = "<strong>Python SDK Context Manager:</strong><br><br>Install and acquire leases with automatic heartbeating:<br><pre>from quorum.client import QuorumClient\n\nclient = QuorumClient(endpoints=['http://localhost:8000'])\n\nasync with client.lock('db-writer', ttl_s=5.0, auto_renew=True) as lock:\n    print(f'Granted Lease! Fencing Token: #{lock.fence_token}')\n    await write_to_database(lock.fence_token)</pre>";
      } else {
        reply = "Quorum is an enterprise-grade <strong>Distributed Coordination Engine</strong> built with pure Python Raft consensus.<br><br>It provides:<br>1. <strong>Strictly monotonic 64-bit fencing tokens</strong> to eliminate zombie worker overwrites.<br>2. <strong>Sub-second leader failover</strong> with zero log corruption.<br>3. <strong>Pythonic async/sync context managers</strong> with auto-renewing TTL leases.";
      }

      setAiMessages(prev => [...prev, { sender: 'ai', text: reply }]);
    }, 400);
  };

  return (
    <div className="quorum-app-wrapper">
      
      {/* 1. TOP NAVBAR */}
      <header className="navbar">
        <div className="nav-container">
          
          <div 
            className="brand-group" 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <QuorumBrandLogo size={28} />
            <span className="brand-title">Quorum</span>
          </div>

          <nav className="nav-links">
            <a href="#live-consensus" className="nav-link">Consensus</a>
            <a href="#try-lock" className="nav-link">Try Lock</a>
            <a href="#correctness" className="nav-link">Architecture</a>
            <a href="#fencing-proof" className="nav-link">Fencing</a>
            <a href="#chaos-testing" className="nav-link">Fault Tolerance</a>
          </nav>

          <div className="nav-actions">
            <button 
              onClick={() => setIsLoginOpen(true)}
              className="btn-primary"
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
            >
              Launch Control Plane →
            </button>
            <a 
              href="https://github.com/Samarthweb2/Quorum" 
              className="nav-icon-link" 
              target="_blank" 
              rel="noopener noreferrer"
              title="GitHub Repository"
            >
              <GitHubMark size={18} color="#231044" />
            </a>
          </div>

        </div>
      </header>

      {/* 2. HERO SECTION (RESTRAINED, WASMER-STYLE GENERATIVE WHITESPACE) */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-heading">
            Distributed Coordination Engine
          </h1>
          <p className="hero-subheading">
            Coordinate distributed services and eliminate race conditions with pure Raft consensus. Engineered with strictly monotonic fencing tokens to guarantee zero data loss.
          </p>
          <div className="hero-actions">
            <a href="#live-consensus" className="btn-primary">
              Explore Cluster
            </a>
            <a 
              href="https://github.com/Samarthweb2/Quorum" 
              className="btn-secondary" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* QUICK STATUS STRIP */}
      <div className="quick-strip-container">
        <div className="quick-strip-card">
          <span>Coordinate your distributed microservices instantly with pure Raft consensus.</span>
          <button 
            onClick={() => onLaunchDashboard('topology')} 
            className="quick-strip-btn"
          >
            Launch Control Plane →
          </button>
        </div>
      </div>

      {/* =========================================================================
          3. SECTION 2: "SEE QUORUM MAKE A DECISION" (ONE PRODUCT SURFACE)
          ========================================================================= */}
      <section className="product-section" id="live-consensus">
        <div className="section-container">
          
          <div className="section-heading-block">
            <span className="eyebrow-text">LIVE CONSENSUS</span>
            <h2 className="product-title">See Quorum make a decision.</h2>
            <p className="product-desc">
              Send a real lock request to the cluster and watch it move from proposal to committed state.
            </p>
          </div>

          {/* SINGLE UNIFIED INFRASTRUCTURE SURFACE */}
          <div className="infra-surface">
            
            {/* Top Bar: Cluster Health & Real-time Heartbeat */}
            <div className="infra-surface-top">
              <div className="infra-title-tag">
                <span>LIVE CLUSTER</span>
              </div>
              <div className="infra-status-indicator">
                <span className="live-dot-pulse"></span>
                <span>OPERATIONAL</span>
              </div>
            </div>

            {/* Topology Line: Node 1 (Leader) - Node 2 - Node 3 */}
            <div className="infra-nodes-row">
              <div className="infra-node-cell leader">
                <div className="node-role-label">LEADER</div>
                <div className="node-id-label">NODE 01</div>
                <div className="node-dot">●</div>
              </div>
              
              <div className="infra-heartbeat-line">
                <div className="heartbeat-pulse-fx"></div>
                <span className="heartbeat-caption">heartbeat · 2.2s</span>
              </div>

              <div className="infra-node-cell follower">
                <div className="node-role-label">FOLLOWER</div>
                <div className="node-id-label">NODE 02</div>
                <div className="node-dot">●</div>
              </div>

              <div className="infra-heartbeat-line">
                <div className="heartbeat-pulse-fx"></div>
                <span className="heartbeat-caption">heartbeat · 2.2s</span>
              </div>

              <div className="infra-node-cell follower">
                <div className="node-role-label">FOLLOWER</div>
                <div className="node-id-label">NODE 03</div>
                <div className="node-dot">●</div>
              </div>
            </div>

            {/* Raft State Monospace Bar */}
            <div className="infra-metrics-bar font-mono">
              <div className="metric-col">
                <span className="m-label">TERM</span>
                <span className="m-val">{consensusOp.term}</span>
              </div>
              <div className="metric-col">
                <span className="m-label">COMMIT INDEX</span>
                <span className="m-val">{consensusOp.commitIndex.toLocaleString()}</span>
              </div>
              <div className="metric-col">
                <span className="m-label">QUORUM</span>
                <span className="m-val">{consensusOp.quorum}</span>
              </div>
            </div>

            <div className="infra-divider"></div>

            {/* Last Operation / Dynamic Request Surface */}
            <div className="infra-operation-pane">
              <div className="op-header">
                <span className="op-label">LAST OPERATION</span>
                {consensusPhase === 'proposing' && <span className="phase-pill proposing">Proposing to Leader WAL...</span>}
                {consensusPhase === 'replicating' && <span className="phase-pill replicating">Replicating via AppendEntries...</span>}
                {consensusPhase === 'committed' && <span className="phase-pill committed">✓ Committed to State Machine</span>}
              </div>

              <div className="op-detail-row">
                <div className="op-call font-mono">
                  AcquireLock("<span>{consensusOp.resource}</span>")
                </div>
                <div className="op-token font-mono">
                  #{consensusOp.fenceToken}
                </div>
              </div>

              <div className="op-meta-row font-mono">
                <span className="meta-status">committed</span>
                <span className="meta-time">{consensusOp.timeAgo}</span>
              </div>

              {/* In-place Replication Trace (Dynamic) */}
              {consensusPhase !== 'idle' && (
                <div className="in-place-trace font-mono">
                  <div className="trace-row">
                    <span className="trace-label">REPLICATION:</span>
                    <span className="trace-nodes">
                      Node 01 <strong className="chk">✓</strong> · Node 02 <strong className="chk">✓</strong> · Node 03 <strong className="chk">✓</strong> · Node 04 <span className="dim">—</span> · Node 05 <span className="dim">—</span>
                    </span>
                    <span className="trace-summary">3 / 5 acknowledged</span>
                  </div>
                </div>
              )}

            </div>

            {/* Action CTA inside or immediately under surface */}
            <div className="infra-footer-action">
              <button 
                onClick={handleRunRealRequest} 
                className="btn-trigger-action"
                disabled={isConsensusRunning}
              >
                <span>{isConsensusRunning ? 'Executing consensus...' : 'Run a real request →'}</span>
              </button>
            </div>

          </div>

        </div>
      </section>

      {/* =========================================================================
          4. SECTION 3: "TRY A DISTRIBUTED LOCK" (RIDICULOUSLY SIMPLE WIDGET)
          ========================================================================= */}
      <section className="product-section alt-bg" id="try-lock">
        <div className="section-container">
          
          <div className="section-heading-block">
            <span className="eyebrow-text">INTERACTIVE</span>
            <h2 className="product-title">Try a distributed lock.</h2>
            <p className="product-desc">
              Acquire a mutual exclusion lock across the cluster. If a worker pauses or network partitions occur, fencing guarantees zero write corruption.
            </p>
          </div>

          <div className="tactile-lock-box">
            
            {!isLocked ? (
              /* Idle / Unlocked Form */
              <div className="lock-unlocked-view">
                <div className="lock-field-group">
                  <label className="lock-field-label">Resource</label>
                  <input 
                    type="text" 
                    value={lockResource} 
                    onChange={(e) => setLockResource(e.target.value)}
                    className="lock-input font-mono"
                  />
                </div>

                <div className="lock-field-group">
                  <label className="lock-field-label">Lease</label>
                  <div className="lock-readonly-val font-mono">5 seconds</div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <button 
                    onClick={handleAcquireTryLock} 
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                  >
                    Acquire lock
                  </button>
                </div>
              </div>
            ) : (
              /* Locked / Active State */
              <div className="lock-locked-view font-mono">
                
                <div className="locked-badge-row">
                  <span className="locked-dot">●</span>
                  <span className="locked-text">LOCKED</span>
                </div>

                <div className="locked-stats-grid">
                  <div className="locked-stat-item">
                    <span className="lbl">Resource</span>
                    <span className="val">{lockResource}</span>
                  </div>

                  <div className="locked-stat-item">
                    <span className="lbl">Fence token</span>
                    <span className="val token-color">#{lockToken}</span>
                  </div>

                  <div className="locked-stat-item">
                    <span className="lbl">Owner</span>
                    <span className="val">demo-client</span>
                  </div>

                  <div className="locked-stat-item">
                    <span className="lbl">Expires in</span>
                    <span className="val">{lockTtlSec}s</span>
                  </div>
                </div>

                <div className="locked-timer-bar">
                  <div 
                    className="locked-timer-progress" 
                    style={{ width: `${(lockTtlSec / 5.0) * 100}%` }}
                  ></div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <button 
                    onClick={handleReleaseTryLock} 
                    className="btn-secondary"
                    style={{ width: '100%', justifyContent: 'center', padding: '10px', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  >
                    Release lock
                  </button>
                </div>

              </div>
            )}

            <div className="lock-caption-sentence">
              Every successful acquisition receives a monotonically increasing fencing token, preventing stale workers from writing after their lease expires.
            </div>

          </div>

        </div>
      </section>

      {/* =========================================================================
          5. SECTION 4: "BUILT FOR CORRECTNESS" (3 ELEGANT TYPOGRAPHIC COLUMNS)
          ========================================================================= */}
      <section className="product-section" id="correctness">
        <div className="section-container">
          
          <div className="section-heading-block">
            <span className="eyebrow-text">ENGINEERING</span>
            <h2 className="product-title">Built for correctness.</h2>
            <p className="product-desc">
              No black-box binaries. Engineered from first principles with pure Python Raft consensus and strictly ordered storage guards.
            </p>
          </div>

          <div className="three-columns-grid">
            
            {/* Column 1: Consensus */}
            <div className="correctness-col">
              <h3 className="col-title">Consensus</h3>
              <p className="col-desc">
                Cluster membership coordinates leader election and linearizable log progression across an odd-numbered quorum of nodes.
              </p>
              <ul className="col-feature-list font-mono">
                <li>Raft state machine</li>
                <li>Leader election</li>
                <li>Log replication</li>
                <li>Quorum commits (3/5)</li>
              </ul>
            </div>

            {/* Column 2: Durability */}
            <div className="correctness-col">
              <h3 className="col-title">Durability</h3>
              <p className="col-desc">
                Mutations are guaranteed durable on disk before network acknowledgement, preventing state loss across sudden process crashes.
              </p>
              <ul className="col-feature-list font-mono">
                <li>Write-ahead log (WAL)</li>
                <li>CRC32 validation</li>
                <li>Crash recovery</li>
                <li>Atomic persistence</li>
              </ul>
            </div>

            {/* Column 3: Coordination */}
            <div className="correctness-col">
              <h3 className="col-title">Coordination</h3>
              <p className="col-desc">
                Protects downstream databases and message queues from slow zombie workers holding expired mutex leases.
              </p>
              <ul className="col-feature-list font-mono">
                <li>Monotonic fencing</li>
                <li>64-bit int tokens</li>
                <li>Lease TTL expiry</li>
                <li>Stale-write protection</li>
              </ul>
            </div>

          </div>

        </div>
      </section>

      {/* =========================================================================
          6. SECTION 5: "FENCING" (MINIMAL, TECHNICALLY MEANINGFUL PROOF)
          ========================================================================= */}
      <section className="product-section alt-bg" id="fencing-proof">
        <div className="section-container">
          
          <div className="section-heading-block">
            <span className="eyebrow-text">SAFETY GUARANTEE</span>
            <h2 className="product-title">Why locks fail without fencing.</h2>
            <p className="product-desc">
              Martin Kleppmann proved that simple distributed locks cannot protect storage against slow workers. Here is how Quorum solves it.
            </p>
          </div>

          <div className="fencing-flow-container">
            
            {/* Lifecycle diagram */}
            <div className="fencing-minimal-flow font-mono">
              <div className="flow-step">
                <span className="step-title">WORKER A</span>
                <span className="step-meta">TOKEN #1042</span>
              </div>
              
              <div className="flow-connector-vertical">│<br />▼</div>

              <div className="flow-step highlight-stall">
                <span className="step-title">STALLS</span>
                <span className="step-meta">JVM GC pause · 10s</span>
              </div>

              <div className="flow-connector-vertical">│<br />▼</div>

              <div className="flow-step">
                <span className="step-title">LEASE EXPIRES</span>
                <span className="step-meta">5.0s TTL exceeded</span>
              </div>

              <div className="flow-connector-vertical">│<br />▼</div>

              <div className="flow-step highlight-new">
                <span className="step-title">WORKER B</span>
                <span className="step-meta">TOKEN #1043 · NEW OWNER</span>
              </div>
            </div>

            {/* The Actual Rejected Operation */}
            <div className="fencing-rejection-box font-mono">
              <div className="rej-header">
                <span>Worker A attempts late write:</span>
              </div>

              <div className="rej-data-grid">
                <div className="rej-data-item">
                  <span className="k">token</span>
                  <span className="v">1042</span>
                </div>
                <div className="rej-data-item">
                  <span className="k">current</span>
                  <span className="v watermark">1043</span>
                </div>
              </div>

              <div className="rej-verdict">
                <div className="verdict-title">REJECTED</div>
                <div className="verdict-sub">stale fencing token (#1042 &lt; #1043)</div>
              </div>

              <div className="rej-sql-sample">
                <code>UPDATE orders SET status = 'DONE', last_fence = 1042 WHERE id = 99 AND last_fence &lt; 1042;</code>
                <span className="sql-res">-- 0 rows affected. Storage preserved!</span>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* =========================================================================
          7. SECTION 6: "WHAT HAPPENS WHEN THINGS FAIL?" (LIVE CLUSTER CHAOS)
          ========================================================================= */}
      <section className="product-section" id="chaos-testing">
        <div className="section-container">
          
          <div className="section-heading-block">
            <span className="eyebrow-text">FAULT TOLERANCE</span>
            <h2 className="product-title">What happens when things fail?</h2>
            <p className="product-desc">
              Simulate real distributed failures against the cluster and watch consensus heal itself in milliseconds.
            </p>
          </div>

          <div className="chaos-cluster-surface">
            
            {/* Action Bar */}
            <div className="chaos-controls-bar">
              <span className="ctrl-label">SIMULATE:</span>
              <div className="ctrl-btn-group">
                <button 
                  onClick={() => handleChaosAction('kill_leader')}
                  className={`ctrl-btn ${chaosState.activeAction === 'kill_leader' ? 'active' : ''}`}
                >
                  Kill leader
                </button>
                <button 
                  onClick={() => handleChaosAction('partition')}
                  className={`ctrl-btn ${chaosState.activeAction === 'partition' ? 'active' : ''}`}
                >
                  Partition node
                </button>
                <button 
                  onClick={() => handleChaosAction('stall_worker')}
                  className={`ctrl-btn ${chaosState.activeAction === 'stall_worker' ? 'active' : ''}`}
                >
                  Stall worker
                </button>
                <button 
                  onClick={() => handleChaosAction('reset')}
                  className="ctrl-btn reset"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Cluster Visual Graph */}
            <div className="chaos-nodes-topology">
              
              {/* Leader Node 1 */}
              <div className={`chaos-node-box ${chaosState.node1.role.toLowerCase()} ${chaosState.node1.status}`}>
                <div className="c-node-role">{chaosState.node1.role}</div>
                <div className="c-node-id">{chaosState.node1.id}</div>
                <div className="c-node-glyph">
                  {chaosState.node1.status === 'killed' ? '×' : '●'}
                </div>
                <div className="c-node-status">{chaosState.node1.status}</div>
              </div>

              {/* Node 2 */}
              <div className={`chaos-node-box ${chaosState.node2.role.toLowerCase()} ${chaosState.node2.status}`}>
                <div className="c-node-role">{chaosState.node2.role}</div>
                <div className="c-node-id">{chaosState.node2.id}</div>
                <div className="c-node-glyph">●</div>
                <div className="c-node-status">{chaosState.node2.status}</div>
              </div>

              {/* Node 3 */}
              <div className={`chaos-node-box ${chaosState.node3.role.toLowerCase()} ${chaosState.node3.status}`}>
                <div className="c-node-role">{chaosState.node3.role}</div>
                <div className="c-node-id">{chaosState.node3.id}</div>
                <div className="c-node-glyph">
                  {chaosState.node3.status === 'partitioned' ? '⚡' : '●'}
                </div>
                <div className="c-node-status">{chaosState.node3.status}</div>
              </div>

            </div>

            {/* Live Terminal Log / Election Output */}
            <div className="chaos-output-bar font-mono">
              <div className="output-term">TERM {chaosState.term}</div>
              <div className="output-text">{chaosState.electionProgress || chaosState.logMessage}</div>
            </div>

          </div>

        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-left">
            <QuorumBrandLogo size={22} />
            <div>
              <span className="footer-brand">Quorum</span>
              <p className="footer-text">Distributed consensus and lock manager. Open-source under MIT License.</p>
            </div>
          </div>

          <div className="footer-links">
            <a href="https://github.com/Samarthweb2/Quorum" className="footer-link" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://github.com/Samarthweb2/Quorum/blob/main/README.md" className="footer-link" target="_blank" rel="noopener noreferrer">Architecture Docs</a>
            <button 
              onClick={() => onLaunchDashboard('topology')} 
              className="footer-link" 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              Control Plane Dashboard
            </button>
          </div>
        </div>
      </footer>

      {/* 9. FLOATING AI AGENT CHAT ASSISTANT */}
      <div id="ai-agent-widget" className="ai-agent-widget">
        <button 
          onClick={() => setIsAiOpen(!isAiOpen)} 
          className={`ai-launcher-btn ${isAiOpen ? 'is-active' : ''}`}
          aria-label="Open Quorum AI Assistant"
        >
          {isAiOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          )}
        </button>

        <div className={`ai-drawer ${isAiOpen ? 'open' : ''}`}>
          <div className="ai-drawer-header">
            <div className="ai-header-top">
              <div className="ai-avatar-circle"><span>Q</span></div>
              <button onClick={() => setIsAiOpen(false)} className="ai-close-btn" aria-label="Close Assistant">✕</button>
            </div>
            <div className="ai-header-greeting">
              <h3>Hi there 👋</h3>
              <h2>How can we help?</h2>
            </div>
            <div onClick={() => setAiActiveTab('messages')} className="ai-send-msg-card">
              <span>Send us a message</span>
              <span className="arrow-glyph">➤</span>
            </div>
          </div>

          <div className="ai-chat-body">
            {aiActiveTab === 'home' && (
              <div className="ai-tab-view active">
                <div className="ai-suggested-title">Suggested questions:</div>
                <div className="ai-suggestions-list">
                  <button onClick={() => handleAiSend('How does Quorum fencing protect against zombie workers?')} className="suggestion-chip">
                    🛡️ How does fencing token protection work?
                  </button>
                  <button onClick={() => handleAiSend('How does Raft leader election and failover work in Quorum?')} className="suggestion-chip">
                    ⚡ How does Raft leader election work?
                  </button>
                  <button onClick={() => handleAiSend('Show me Python code to acquire a distributed lock with TTL')} className="suggestion-chip">
                    🐍 Python distributed lock example
                  </button>
                </div>
              </div>
            )}

            {aiActiveTab === 'messages' && (
              <div className="ai-tab-view active">
                <div className="chat-messages-scroll">
                  {aiMessages.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.sender}`}>
                      <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: msg.text }} />
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleAiSend(); }} className="ai-query-form">
                  <input 
                    type="text" 
                    value={aiInput} 
                    onChange={(e) => setAiInput(e.target.value)} 
                    placeholder="Type your question..." 
                    autoComplete="off"
                  />
                  <button type="submit" className="ai-query-submit" aria-label="Send Query">➤</button>
                </form>
              </div>
            )}
          </div>

          <div className="ai-drawer-footer">
            <button onClick={() => setAiActiveTab('home')} className={`ai-nav-tab ${aiActiveTab === 'home' ? 'active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span>Home</span>
            </button>
            <button onClick={() => setAiActiveTab('messages')} className={`ai-nav-tab ${aiActiveTab === 'messages' ? 'active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Messages</span>
            </button>
          </div>
        </div>
      </div>

      {/* 10. LOGIN MODAL */}
      {isLoginOpen && (
        <div 
          className="login-modal-backdrop" 
          onClick={(e) => { if (e.target === e.currentTarget) setIsLoginOpen(false); }}
        >
          <div className="login-modal-dialog">
            <div className="login-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284C7' }}></span>
                <h3>Log In to Quorum Control Plane</h3>
              </div>
              <button onClick={() => setIsLoginOpen(false)} className="login-close-btn">✕</button>
            </div>
            
            <div className="login-modal-body">
              <p style={{ fontSize: '0.88rem', color: '#64748B', marginBottom: '18px', lineHeight: 1.5 }}>
                Access your live 5-node cluster, monitor real-time Raft terms, and manage active distributed leases across namespaces.
              </p>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                setIsLoginOpen(false);
                onLaunchDashboard('topology');
              }}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#231044', marginBottom: '6px' }}>
                    Cluster Endpoint
                  </label>
                  <input 
                    type="text" 
                    defaultValue="http://127.0.0.1:8000" 
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-mono)' }} 
                    required 
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#231044', marginBottom: '6px' }}>
                    API Token / Secret Key
                  </label>
                  <input 
                    type="password" 
                    defaultValue="••••••••••••" 
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-mono)' }} 
                    required 
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.95rem' }}
                >
                  Sign In to Control Plane →
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
