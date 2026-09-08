import React, { useState, useEffect } from 'react';
import { 
  Search, Play, Pause, RotateCcw, CheckCircle2, Copy, Check, Lock, 
  Cpu, Server, Activity, AlertTriangle, ShieldAlert, Layers,
  Terminal, Shield, Zap, ExternalLink, Code2, Database, Bot
} from 'lucide-react';


// 3-Tier Layered Quorum Logo (Orange Mark)
function QuorumStackLogo({ size = 26, color = "#f59e0b" }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="quorumOrangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Top Diamond Plate */}
      <path 
        d="M50 16L84 34L50 52L16 34Z" 
        fill={color === "#f59e0b" ? "url(#quorumOrangeGrad)" : color} 
      />
      {/* Middle Chevron Plate */}
      <path 
        d="M16 48L50 66L84 48L50 56Z" 
        fill={color === "#f59e0b" ? "url(#quorumOrangeGrad)" : color} 
      />
      {/* Bottom Chevron Plate */}
      <path 
        d="M16 64L50 82L84 64L50 72Z" 
        fill={color === "#f59e0b" ? "url(#quorumOrangeGrad)" : color} 
      />
    </svg>
  );
}


// GitHub Mark
function GitHubMark({ size = 20, color = "#FFFFFF" }) {
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
  const [copiedTab, setCopiedTab] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState('python-ctx');
  const [activeFencingTab, setActiveFencingTab] = useState('with-fencing');
  const [sandboxFeedback, setSandboxFeedback] = useState(null);
  const [isSandboxLoading, setIsSandboxLoading] = useState(false);

  // Pipeline simulation state
  const [pipelineStep, setPipelineStep] = useState(2);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const leaderId = status?.leader_id || 'node-2';
  const aliveNodes = status?.alive_nodes || 5;
  const isPartitioned = status?.is_partitioned;

  useEffect(() => {
    let timer;
    if (isAutoPlaying) {
      timer = setInterval(() => {
        setPipelineStep((prev) => (prev + 1) % 5);
      }, 1600);
    }
    return () => clearInterval(timer);
  }, [isAutoPlaying]);

  const pipelineStages = [
    { id: 0, name: 'Client Propose', badge: 'RPC_SUBMIT', desc: 'Worker issues lease request to elected Raft Leader', nodeName: 'Python Worker', details: 'AcquireLockRequest(key="payments-db", ttl=8000ms)' },
    { id: 1, name: 'AppendEntries RPC', badge: 'LOG_BROADCAST', desc: 'Leader replicates entry in parallel across all cluster nodes', nodeName: leaderId, details: 'AppendEntries(term=1, prev_idx=42, entries=[LockProposal])' },
    { id: 2, name: 'Quorum Reached', badge: 'CONSENSUS_3_OF_5', desc: 'Majority nodes acknowledge durability in framed WAL', nodeName: 'Majority (3/5)', details: 'Quorum verified: [node-1, node-2, node-3] written & flushed' },
    { id: 3, name: 'Fencing Minted', badge: 'INT64_MONOTONIC', desc: 'Strictly monotonic fencing token generated for downstream safety', nodeName: 'State Machine', details: 'FenceToken #104 minted (guaranteed > previous #103)' },
    { id: 4, name: 'Storage Protected', badge: 'LEASE_GRANTED', desc: 'Worker enters critical section; stale writes rejected by DB', nodeName: 'Downstream DB', details: 'Lock granted! Storage accepts write with Token #104' }
  ];

  const pipelineEvents = [
    { time: '13:04:12.102', type: 'CLIENT_PROPOSE', label: 'Python Worker dispatched lease request for resource "orders-db"' },
    { time: '13:04:12.105', type: 'LEADER_RECEIVED', label: `Leader ${leaderId} appended uncommitted entry at Log Index #43` },
    { time: '13:04:12.111', type: 'APPEND_ENTRIES_RPC', label: 'Broadcasted AppendEntries RPC to [node-1, node-3, node-4, node-5]' },
    { time: '13:04:12.115', type: 'QUORUM_ACK_RECEIVED', label: '3 of 5 nodes acknowledged log flush. Majority quorum verified!' },
    { time: '13:04:12.118', type: 'COMMIT_INDEX_ADVANCE', label: 'Commit Index advanced to #43. Applied to Lock State Machine' },
    { time: '13:04:12.122', type: 'FENCING_TOKEN_ISSUED', label: 'Minted 64-bit Monotonic Fencing Token #104 for client "worker-alpha"' },
    { time: '13:04:12.126', type: 'LEASE_ACTIVE', label: 'Lease active with 8000ms TTL and background heartbeat auto-renewal' }
  ];

  const handleSandboxAcquire = async () => {
    setIsSandboxLoading(true);
    setSandboxFeedback(null);
    try {
      const res = await onAcquireLock('temporal-landing-lock', 'demo-worker', 8000);
      setSandboxFeedback(res);
    } catch (e) {
      setSandboxFeedback({ success: false, message: e.message });
    } finally {
      setIsSandboxLoading(false);
    }
  };

  const handleSandboxPartition = async () => {
    setIsSandboxLoading(true);
    try {
      if (isPartitioned) {
        await onHealPartitions();
        setSandboxFeedback({ success: true, message: 'Network partitions healed. Full 5-node connectivity restored.' });
      } else {
        await onCreatePartition([['node-1', 'node-2', 'node-3'], ['node-4', 'node-5']]);
        setSandboxFeedback({ success: true, message: 'Simulated 3v2 split-brain partition: Majority (node 1,2,3) vs Minority (node 4,5).' });
      }
    } finally {
      setIsSandboxLoading(false);
    }
  };

  const codeSnippets = {
    'python-ctx': `# 1. Python SDK - Context Manager with Automatic Background Renewal
import asyncio
from quorum.client.client import QuorumClient

async def run_critical_job():
    # Connect to cluster nodes (auto-discovers and follows leader)
    endpoints = ["127.0.0.1:50051", "127.0.0.1:50052", "127.0.0.1:50053"]
    client = QuorumClient(servers=endpoints, client_id="worker-alpha")

    # Safe lease with strictly monotonic 64-bit fencing token
    async with client.lock("primary-database-writer", ttl_s=10.0, auto_renew=True) as lock:
        print(f"Granted Lock! Fencing Token: #{lock.fence_token}")
        # Downstream storage validates token to reject stale writes
        await execute_storage_write(fencing_token=lock.fence_token)

    await client.close()`,

    'python-manual': `# 2. Python SDK - Explicit Acquire, Renew, and Release
import asyncio
from quorum.client.client import QuorumClient, LockBusyError

async def main():
    client = QuorumClient(servers=["127.0.0.1:50051"], client_id="worker-beta")

    try:
        lock = await client.acquire_lock("batch-processor", ttl_s=5.0)
        print(f"Granted lock with fencing token: #{lock.fence_token}")
        
        # Extend lease
        await client.renew_lock(lock, ttl_s=10.0)
        
        # Explicit release
        await client.release_lock(lock)
    except LockBusyError:
        print("Lock currently held by competing worker")
    finally:
        await client.close()`,

    'rest-api': `# 3. HTTP / REST Gateway (FastAPI & cURL)
# Acquire a lock via HTTP API
curl -X POST http://localhost:8000/api/locks/acquire \\
  -H "Content-Type: application/json" \\
  -d '{
    "key": "distributed-etl-task",
    "client_id": "worker-charlie",
    "ttl_ms": 6000
  }'

# Response:
# {
#   "success": true,
#   "status": "LOCK_ACQUIRED",
#   "fence_token": 104,
#   "expires_at_ms": 1788851490200,
#   "message": "Lock acquired successfully"
# }`,

    'grpc-proto': `// 4. Protobuf Interface (proto/quorum.proto)
syntax = "proto3";
package quorum.api;

service QuorumService {
  rpc AcquireLock (AcquireLockRequest) returns (AcquireLockResponse);
  rpc RenewLock   (RenewLockRequest)   returns (RenewLockResponse);
  rpc ReleaseLock (ReleaseLockRequest) returns (ReleaseLockResponse);
  rpc GetLock     (GetLockRequest)     returns (GetLockResponse);
  rpc WatchLeader (WatchLeaderRequest) returns (stream LeaderNotification);
}`,

    'langchain-agent': `# 5. LangChain Autonomous AI Agent with Quorum Locking
from langchain.agents import AgentExecutor, create_tool_calling_agent
from quorum.ai.tools import QuorumLockTool, QuorumAgentGuard
from quorum.client.client import QuorumClient

# Connect to Quorum 5-Node Raft Cluster
quorum_client = QuorumClient(servers=["127.0.0.1:50051", "127.0.0.1:50052"])

# Equip Agent with QuorumLockTool
lock_tool = QuorumLockTool(client=quorum_client, agent_id="settlement-agent")
tools = [lock_tool, execute_ledger_mutation]

# The agent autonomously acquires a Raft lease + 64-bit monotonic fencing token.
# If LLM reasoning stalls, downstream storage rejects stale writes to prevent double-spending!`
  };


  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeSnippets[activeCodeTab]);
    setCopiedTab(true);
    setTimeout(() => setCopiedTab(false), 2000);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#08090d', color: '#ffffff' }}>
      
      {/* 1. Exact Temporal Minimalist Navbar */}
      <nav className="temporal-navbar">
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
          
          {/* Brand Logo: 3-Tier Stack Icon in Orange + Quorum */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <QuorumStackLogo size={28} color="#f59e0b" />
            <span style={{ fontSize: '21px', fontWeight: 400, letterSpacing: '-0.02em', color: '#ffffff', fontFamily: 'var(--font-sans)' }}>
              Quorum
            </span>
          </div>


          {/* Center Links (Exact items specified by user) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '26px' }}>
            <a href="#sandbox" className="temporal-nav-link">Interactive Sandbox</a>
            <a href="#fencing-proof" className="temporal-nav-link">Fencing Proof</a>
            <a href="#architecture" className="temporal-nav-link">Architecture</a>
            <a href="#ai-coordination" className="temporal-nav-link" style={{ color: '#c084fc' }}>AI Agents</a>
            <a href="#sdk-snippets" className="temporal-nav-link">SDK Snippets</a>
            <a href="#comparison" className="temporal-nav-link">Comparison</a>
          </div>


          {/* Right Actions: Search, GitHub Logo, Try Free, Log In */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            
            {/* Search Icon */}
            <button 
              style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
              onClick={() => { document.getElementById('sandbox')?.scrollIntoView({ behavior: 'smooth' }); }}
              title="Search documentation"
            >
              <Search size={18} strokeWidth={1.8} />
            </button>

            {/* GitHub Logo linking to GitHub */}
            <a 
              href="https://github.com/Samarthweb2/Quorum" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#ffffff', display: 'flex', alignItems: 'center', transition: 'opacity 0.2s', opacity: 0.9 }}
              title="Quorum on GitHub"
            >
              <GitHubMark size={20} color="#FFFFFF" />
            </a>

            {/* Try Free Button (Solid Purple Button matching screenshot) */}
            <button 
              onClick={onLaunchDashboard}
              className="btn-temporal-primary"
            >
              Try Free
            </button>

            {/* Log In Button (Minimalist Outline Button matching screenshot) */}
            <button 
              onClick={onLaunchDashboard}
              className="btn-temporal-outline"
            >
              Log In
            </button>

          </div>

        </div>
      </nav>

      {/* 2. Exact Hero Page from Temporal Screenshot */}
      <section className="temporal-hero-container">
        
        {/* 3D Perspective Grid Background (vanishing to center horizon) */}
        <div className="perspective-grid-wrap">
          <div className="perspective-grid-plane" />
        </div>

        {/* Central Atmospheric Purple/Cyan Nebula Glow */}
        <div className="temporal-nebula-glow" />

        {/* Twinkling Star Dust Overlay */}
        <div className="temporal-star-dust" />

        {/* Hero Content Box */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: '1100px', margin: '0 auto', textAlign: 'center' }}>
          
          {/* Exact Headline Style & Layout */}
          <h1 className="temporal-hero-heading">
            The world’s best distributed systems run on Quorum
          </h1>

          {/* Exact Subtitle Style & Layout */}
          <p className="temporal-hero-body">
            Build applications the way OpenAI, Lovable, Replit, Cursor, and Retool do with our open-source platform. Add fault-tolerant distributed locking and consensus capabilities to any application with your framework of choice.
          </p>

          {/* Hero CTAs: "Get Started for Free" and "Run Locally" */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <button 
              onClick={onLaunchDashboard}
              className="temporal-hero-btn-primary"
            >
              Get Started for Free
            </button>
            <button 
              onClick={() => { document.getElementById('sandbox')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="temporal-hero-btn-secondary"
            >
              Run Locally
            </button>
          </div>

        </div>

      </section>

      {/* 3. Enterprise Logos Marquee Bar (Exact match to screenshot bottom strip) */}
      <div className="logo-marquee-bar">
        <div className="logo-marquee-track">
          
          <div className="logo-item" style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>◎</span> MACQUARIE
          </div>

          <div className="logo-item" style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.06em' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 900 }}>ANZ</span>
          </div>

          <div className="logo-item" style={{ fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 10.45a5.52 5.52 0 0 0-.48-4.52 5.6 5.6 0 0 0-3.92-2.73 5.56 5.56 0 0 0-4.73 1.25A5.56 5.56 0 0 0 8.7 3.5a5.6 5.6 0 0 0-3.92 2.73 5.54 5.54 0 0 0 .61 6.13 5.52 5.52 0 0 0 .48 4.52 5.6 5.6 0 0 0 3.92 2.73 5.56 5.56 0 0 0 4.73-1.25 5.56 5.56 0 0 0 4.45.95 5.6 5.6 0 0 0 3.92-2.73 5.54 5.54 0 0 0-.61-6.13zM13 19.46v-3.79l3.28 1.9a3.86 3.86 0 0 1-3.28 1.89zm5.34-3.48-3.28-1.9 1.9-3.28a3.87 3.87 0 0 1 1.38 5.18zM18.8 8.9l-3.28 1.9V7a3.86 3.86 0 0 1 3.28 1.9zm-7.8-5.36a3.86 3.86 0 0 1 3.28 1.9l-3.28 1.9V3.54zm-5.34 3.48 3.28 1.9-1.9 3.28a3.87 3.87 0 0 1-1.38-5.18zM5.2 15.1l3.28-1.9V17a3.86 3.86 0 0 1-3.28-1.9z"/></svg>
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>OpenAI</span>
          </div>

          <div className="logo-item" style={{ fontFamily: 'cursive', fontSize: '1.25rem', fontWeight: 800 }}>
            Yum!
          </div>

          <div className="logo-item" style={{ fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '1.1rem', color: '#ffffff' }}>∞</span>
            <span style={{ fontSize: '1rem', fontWeight: 800 }}>kotak</span>
          </div>

          <div className="logo-item" style={{ fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ff3b30' }}>●</span>
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>vodafone</span>
          </div>

          <div className="logo-item" style={{ fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="22" height="16" viewBox="0 0 24 16" fill="currentColor"><path d="M19.35 6.04C18.67 2.59 15.64 0 12 0 9.11 0 6.6 1.64 5.35 4.04 2.34 4.36 0 6.91 0 10c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.04em' }}>CLOUDFLARE</span>
          </div>

          <div className="logo-item" style={{ fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="m23.6 9.6-1.5-4.6c-.2-.5-.8-.7-1.2-.4l-1.3 1-3.2-9.9c-.2-.6-.9-.8-1.4-.4-.5.4-.6 1-.3 1.5l3.2 9.9H4.8l3.2-9.9c.3-.5.2-1.1-.3-1.5-.5-.4-1.2-.2-1.4.4L3.1 5.6 1.8 4.6c-.4-.3-1-.1-1.2.4L.4 9.6c-.1.5.1 1 .5 1.3l10.5 7.6c.4.3.9.3 1.2 0L23.1 10.9c.4-.3.6-.8.5-1.3z"/></svg>
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>GitLab</span>
          </div>

          <div className="logo-item" style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.02em' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>Remitly</span>
          </div>

          <div className="logo-item" style={{ fontFamily: 'serif', fontStyle: 'italic', fontSize: '1.15rem', fontWeight: 700 }}>
            Alaska
          </div>

        </div>
      </div>

      {/* 4. Center Section: [Interactive Sandbox] */}
      <section id="sandbox" style={{ padding: '80px 24px 60px', position: 'relative' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div className="temporal-badge" style={{ marginBottom: '12px' }}>
              <Activity size={12} />
              SECTION 01 • INTERACTIVE CONSENSUS REPLAY & CLUSTER BRIDGE
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 700, letterSpacing: '-0.025em', color: '#ffffff' }}>
              Interactive Consensus Sandbox
            </h2>
            <p style={{ fontSize: '1rem', color: '#9ca3af', maxWidth: '680px', margin: '8px auto 0' }}>
              Step through the 5 deterministic Raft consensus phases or invoke RPC operations directly on the live 5-node cluster.
            </p>
          </div>

          {/* Interactive Replay Stage Card */}
          <div className="glass-panel" style={{ padding: '32px', background: 'rgba(10, 14, 22, 0.9)', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '32px' }}>
            
            {/* Visual Pipeline Track */}
            <div className="pipeline-track" style={{ marginBottom: '28px' }}>
              <div className="pipeline-connector-line">
                <div className="pipeline-connector-progress" style={{ width: `${(pipelineStep / 4) * 100}%` }} />
              </div>

              {pipelineStages.map((stage, idx) => {
                const isActive = pipelineStep === idx;
                const isPassed = pipelineStep > idx;

                return (
                  <div 
                    key={stage.id} 
                    className={`pipeline-node ${isActive ? 'active' : ''} ${isPassed ? 'completed' : ''}`}
                    onClick={() => setPipelineStep(idx)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: isActive ? '#00f2aa' : '#64748b', marginBottom: '4px' }}>
                      PHASE 0{idx + 1}
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: isActive ? '#ffffff' : '#cbd5e1', marginBottom: '6px' }}>
                      {stage.name}
                    </div>
                    <span style={{ 
                      fontSize: '0.65rem', 
                      padding: '2px 8px', 
                      borderRadius: '12px', 
                      background: isActive ? 'rgba(0, 242, 170, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: isActive ? '#00f2aa' : '#94a3b8',
                      fontFamily: 'var(--font-mono)',
                      border: `1px solid ${isActive ? 'rgba(0, 242, 170, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`
                    }}>
                      {stage.badge}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Replay Details & Event History Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              
              {/* Left Column: Stage Controls */}
              <div style={{ background: 'rgba(14, 18, 28, 0.9)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00f2aa', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="radar-dot" style={{ width: '6px', height: '6px' }}></span>
                    STAGE 0{pipelineStep + 1} ACTIVE
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                    {pipelineStages[pipelineStep].nodeName}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                  {pipelineStages[pipelineStep].name}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '16px' }}>
                  {pipelineStages[pipelineStep].desc}
                </p>

                <div style={{ background: 'rgba(6, 8, 13, 0.9)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#38bdf8' }}>
                  <code>{pipelineStages[pipelineStep].details}</code>
                </div>

                <div style={{ marginTop: '20px' }}>
                  <input 
                    type="range" 
                    min="0" 
                    max="4" 
                    value={pipelineStep} 
                    onChange={(e) => setPipelineStep(Number(e.target.value))}
                    className="temporal-slider"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
                  <button 
                    onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                    className="btn-temporal-primary"
                    style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                  >
                    {isAutoPlaying ? <Pause size={14} /> : <Play size={14} />}
                    {isAutoPlaying ? 'Pause' : 'Auto Play'}
                  </button>

                  <button 
                    onClick={() => setPipelineStep(prev => Math.max(0, prev - 1))}
                    className="btn-temporal-outline"
                    style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                    disabled={pipelineStep === 0}
                  >
                    ◀ Prev
                  </button>

                  <button 
                    onClick={() => setPipelineStep(prev => Math.min(4, prev + 1))}
                    className="btn-temporal-outline"
                    style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                    disabled={pipelineStep === 4}
                  >
                    Next ▶
                  </button>

                  <button 
                    onClick={() => setPipelineStep(0)}
                    className="btn-temporal-outline"
                    style={{ padding: '8px 12px', fontSize: '0.8rem', marginLeft: 'auto' }}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              {/* Right Column: Event Log */}
              <div style={{ background: 'rgba(14, 18, 28, 0.9)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Terminal size={14} />
                    EXECUTION EVENT STREAM
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                    RAFT COMMIT INDEX #43
                  </span>
                </div>

                <div style={{ flex: 1, maxHeight: '250px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '8px', background: 'rgba(6, 8, 13, 0.9)' }}>
                  {pipelineEvents.map((evt, idx) => (
                    <div 
                      key={idx} 
                      className={`event-row ${idx === pipelineStep ? 'active' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#64748b' }}>{evt.time}</span>
                        <span style={{ color: idx === pipelineStep ? '#00f2aa' : '#38bdf8', fontWeight: 600 }}>{evt.type}</span>
                      </div>
                      <span style={{ color: '#cbd5e1', fontSize: '0.75rem', marginLeft: '12px' }}>
                        {evt.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>

          {/* Real Backend Cluster Sandbox Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            
            <div className="bento-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Lock size={18} color="#7c5cfc" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>Propose Real Lock</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '20px' }}>
                Sends a live lease request to elected leader <strong>{leaderId}</strong>. Grants monotonic 64-bit fencing token.
              </p>
              <button 
                onClick={handleSandboxAcquire}
                disabled={isSandboxLoading}
                className="btn-temporal-primary"
                style={{ width: '100%' }}
              >
                Acquire Lock Now
              </button>
            </div>

            <div className="bento-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <AlertTriangle size={18} color="#f59e0b" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>3v2 Partition Chaos</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '20px' }}>
                Simulate split-brain partition (3 majority vs 2 minority). Verify minority refuses to grant uncommitted leases.
              </p>
              <button 
                onClick={handleSandboxPartition}
                disabled={isSandboxLoading}
                className="btn-temporal-outline"
                style={{ width: '100%', borderColor: isPartitioned ? '#00f2aa' : 'rgba(239, 68, 68, 0.4)', color: isPartitioned ? '#00f2aa' : '#f87171' }}
              >
                {isPartitioned ? 'Heal Partitions (Restore 5/5)' : 'Simulate 3v2 Partition'}
              </button>
            </div>

            <div className="bento-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <ShieldAlert size={18} color="#c084fc" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>Zombie Worker Proof</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '20px' }}>
                Test Martin Kleppmann's GC pause race condition. See storage reject stale writes with outdated tokens.
              </p>
              <button 
                onClick={onSimulateZombie}
                className="btn-temporal-outline"
                style={{ width: '100%', borderColor: 'rgba(124, 92, 252, 0.4)', color: '#c4b5fd' }}
              >
                Test Zombie Worker ➔
              </button>
            </div>

          </div>

          {/* Sandbox Response Feedback */}
          {sandboxFeedback && (
            <div style={{ marginTop: '20px', padding: '14px 18px', borderRadius: '8px', background: sandboxFeedback.success ? 'rgba(0, 242, 170, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${sandboxFeedback.success ? 'rgba(0, 242, 170, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {sandboxFeedback.success ? <CheckCircle2 size={16} color="#00f2aa" /> : <AlertTriangle size={16} color="#f87171" />}
                <span style={{ fontSize: '0.85rem', color: sandboxFeedback.success ? '#00f2aa' : '#f87171', fontWeight: 600 }}>
                  {sandboxFeedback.message || (sandboxFeedback.success ? 'Operation executed on cluster!' : 'Action failed')}
                </span>
                {sandboxFeedback.fence_token && (
                  <span style={{ fontSize: '0.75rem', background: 'rgba(0, 242, 170, 0.2)', color: '#00f2aa', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                    Token #{sandboxFeedback.fence_token}
                  </span>
                )}
              </div>
              <button onClick={() => setSandboxFeedback(null)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
            </div>
          )}

        </div>
      </section>

      {/* 5. Center Section: [Fencing Proof] */}
      <section id="fencing-proof" style={{ padding: '80px 24px', background: 'rgba(6, 7, 10, 0.6)', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div className="temporal-badge" style={{ marginBottom: '12px' }}>
              <Shield size={12} />
              SECTION 02 • MARTIN KLEPPMANN FORMAL ANALYSIS
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 700, color: '#ffffff' }}>
              Why Unversioned Locks Silently Corrupt Data
            </h2>
            <p style={{ fontSize: '1rem', color: '#9ca3af', maxWidth: '720px', margin: '8px auto 0' }}>
              Without fencing tokens, Stop-the-World GC pauses, page faults, and packet drops inevitably cause concurrent writes.
            </p>

            <div style={{ display: 'inline-flex', background: 'rgba(14, 18, 28, 0.9)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '4px', marginTop: '24px' }}>
              <button
                onClick={() => setActiveFencingTab('without-fencing')}
                style={{
                  padding: '8px 18px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeFencingTab === 'without-fencing' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                  color: activeFencingTab === 'without-fencing' ? '#f87171' : '#9ca3af',
                  transition: 'all 0.2s'
                }}
              >
                ⚠️ Without Fencing (Redlock / Vanilla Redis)
              </button>
              <button
                onClick={() => setActiveFencingTab('with-fencing')}
                style={{
                  padding: '8px 18px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeFencingTab === 'with-fencing' ? 'rgba(0, 242, 170, 0.2)' : 'transparent',
                  color: activeFencingTab === 'with-fencing' ? '#00f2aa' : '#9ca3af',
                  transition: 'all 0.2s'
                }}
              >
                ✓ With Quorum Monotonic Fencing
              </button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '32px', border: activeFencingTab === 'with-fencing' ? '1px solid rgba(0, 242, 170, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)' }}>
            {activeFencingTab === 'without-fencing' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f87171', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                    TIMELINE A: CLIENT 1 (PAUSED)
                  </div>
                  <ol style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.8, paddingLeft: '18px' }}>
                    <li>Client 1 acquires lock on distributed resource.</li>
                    <li>Client 1 encounters a 12-second Stop-The-World GC pause.</li>
                    <li>Lock TTL expires; Redis / Redlock unlocks resource.</li>
                    <li>Client 1 wakes up, unaware lease has expired, and writes to database.</li>
                  </ol>
                </div>

                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f87171', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                    TIMELINE B: CLIENT 2 (ACTIVE)
                  </div>
                  <ol style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.8, paddingLeft: '18px' }}>
                    <li>Client 2 acquires lock legitimately while Client 1 paused.</li>
                    <li>Client 2 updates database records cleanly.</li>
                    <li>Client 1 wakes up and blindly overwrites Client 2's data!</li>
                    <li style={{ color: '#f87171', fontWeight: 700 }}>RESULT: Silent Data Corruption ❌</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div style={{ background: 'rgba(0, 242, 170, 0.05)', border: '1px solid rgba(0, 242, 170, 0.2)', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#00f2aa', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                    CLIENT 1: TOKEN #33
                  </div>
                  <ol style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.8, paddingLeft: '18px' }}>
                    <li>Client 1 acquires lock. Quorum issues <strong>Fence Token #33</strong>.</li>
                    <li>Client 1 pauses (GC pause or packet drop). Lease expires.</li>
                    <li>Client 1 wakes up with old Token #33 and attempts DB write.</li>
                    <li style={{ color: '#00f2aa', fontWeight: 700 }}>STORAGE ENGINE: Reject Token #33 &lt; Active #34! ✓</li>
                  </ol>
                </div>

                <div style={{ background: 'rgba(0, 242, 170, 0.05)', border: '1px solid rgba(0, 242, 170, 0.2)', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#00f2aa', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                    CLIENT 2: TOKEN #34
                  </div>
                  <ol style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.8, paddingLeft: '18px' }}>
                    <li>Client 2 acquires lease. Quorum issues <strong>Fence Token #34</strong>.</li>
                    <li>Client 2 writes to storage with Token #34. DB records max=34.</li>
                    <li>When Client 1 attempts write with #33, storage blocks it!</li>
                    <li style={{ color: '#00f2aa', fontWeight: 700 }}>RESULT: 100% Consistent Mutual Exclusion ✓</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* 6. Center Section: [Architecture] */}
      <section id="architecture" style={{ padding: '80px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '44px' }}>
            <div className="temporal-badge" style={{ marginBottom: '12px' }}>
              <Cpu size={12} />
              SECTION 03 • CORE ARCHITECTURE
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 700, color: '#ffffff' }}>
              Engineered for Zero Data Loss
            </h2>
            <p style={{ fontSize: '1rem', color: '#9ca3af' }}>
              Formal Raft protocol implementation with zero clock-skew vulnerabilities.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '22px' }}>
            
            <div className="bento-card">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7c5cfc', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                [01] RAFT §5.4.2 SAFETY
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                Figure 8 Safety Enforcement
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                Prevents a newly elected leader from committing previous term entries by counting replicas. Only current term entries are committed directly.
              </p>
            </div>

            <div className="bento-card">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#00f2aa', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                [02] LEASE MONOTONICITY
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                64-Bit Fencing Tokens
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                Every lock acquisition increments a cluster-wide atomic counter. Downstream storage validates tokens to reject delayed zombie requests.
              </p>
            </div>

            <div className="bento-card">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                [03] DISK DURABILITY
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                CRC32 Framed WAL Auto-Repair
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                Log records are framed with magic bytes and CRC32 checksums. Power-loss torn writes are automatically detected and truncated upon restart.
              </p>
            </div>

            <div className="bento-card">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                [04] CLIENT TOPOLOGY
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                Transparent Leader Redirection
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                If clients connect to a follower, requests are transparently forwarded to the active leader with zero manual cluster re-addressing.
              </p>
            </div>

            <div className="bento-card">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ff5c5c', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                [05] CHAOS RESILIENCE
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                Split-Brain Partition Tolerance
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                Survives up to <code>f</code> failures in a <code>2f + 1</code> node cluster. Split networks refuse writes on the minority side to maintain linearizability.
              </p>
            </div>

            <div className="bento-card">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7c5cfc', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                [06] MULTI-PROTOCOL INTEROP
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                gRPC, REST & WebSocket
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                Protobuf high-speed microsecond transport for services, paired with an HTTP/REST gateway and WebSocket live telemetry for control planes.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* AI Agent Swarm Section */}
      <section id="ai-coordination" style={{ padding: '80px 24px', background: 'radial-gradient(ellipse at center top, rgba(168, 85, 247, 0.12) 0%, rgba(6, 7, 10, 0.9) 70%)', borderTop: '1px solid rgba(168, 85, 247, 0.25)' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '44px' }}>
            <div className="temporal-badge" style={{ marginBottom: '12px', borderColor: 'rgba(168, 85, 247, 0.4)', color: '#c084fc', background: 'rgba(168, 85, 247, 0.1)' }}>
              <Bot size={12} />
              AI AGENT COORDINATION & MULTI-AGENT LOCKING
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
              The World's Best AI Agents Run on Quorum
            </h2>
            <p style={{ fontSize: '1.05rem', color: '#9ca3af', maxWidth: '780px', margin: '0 auto', lineHeight: 1.6 }}>
              Autonomous AI agents executing LangChain tools, CrewAI workflows, and LLM reasoning cycles share critical databases and external APIs. Quorum eliminates double-execution, race conditions, and zombie agent overwrites using leader-backed Raft leases and 64-bit monotonic fencing tokens.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '36px', borderColor: 'rgba(168, 85, 247, 0.3)', background: 'rgba(14, 18, 30, 0.85)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
              <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', padding: '24px' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>💳</div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>Settlement Agent (Finance)</h3>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  Validates incoming payment batches, debits accounts, and generates proof tokens without double-spending.
                </p>
                <div style={{ marginTop: '12px', fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                  Tool: <code>QuorumLockTool.acquire('ledger')</code>
                </div>
              </div>

              <div style={{ background: 'rgba(0, 242, 170, 0.05)', border: '1px solid rgba(0, 242, 170, 0.2)', borderRadius: '12px', padding: '24px' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>📦</div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>Inventory Agent (Warehouse)</h3>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  Allocates physical catalog stock and prevents simultaneous overselling across competing autonomous channels.
                </p>
                <div style={{ marginTop: '12px', fontSize: '0.75rem', color: '#00f2aa', fontFamily: 'var(--font-mono)' }}>
                  Safety: <code>64-Bit Monotonic Fencing Tokens</code>
                </div>
              </div>

              <div style={{ background: 'rgba(192, 132, 252, 0.05)', border: '1px solid rgba(192, 132, 252, 0.2)', borderRadius: '12px', padding: '24px' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>🛡️</div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>Risk & Audit Agent</h3>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  Runs background reconciliation and audits ledger solvency. Guarantees consistency across distributed networks.
                </p>
                <div style={{ marginTop: '12px', fontSize: '0.75rem', color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
                  Consensus: <code>Raft Majority Quorum (3 of 5)</code>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <button
                onClick={onLaunchDashboard}
                className="btn-temporal-primary"
                style={{ fontSize: '0.95rem', padding: '12px 28px' }}
              >
                Launch Live AI Agent Swarm Studio →
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 7. Center Section: [SDK Snippets] */}
      <section id="sdk-snippets" style={{ padding: '80px 24px', background: 'rgba(6, 7, 10, 0.7)', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>

        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div className="temporal-badge" style={{ marginBottom: '12px' }}>
              <Code2 size={12} />
              SECTION 04 • CLIENT INTEGRATIONS
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 700, color: '#ffffff' }}>
              Client SDKs & Protocol Hub
            </h2>
            <p style={{ fontSize: '1rem', color: '#9ca3af' }}>
              Production-ready client libraries with auto-renewal and leader-following.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(14, 18, 28, 0.95)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', padding: '0 16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button 
                  onClick={() => setActiveCodeTab('python-ctx')}
                  className={`tab-btn ${activeCodeTab === 'python-ctx' ? 'active' : ''}`}
                  style={{ color: activeCodeTab === 'python-ctx' ? '#7c5cfc' : '#9ca3af', borderBottomColor: activeCodeTab === 'python-ctx' ? '#7c5cfc' : 'transparent' }}
                >
                  Python Context Manager
                </button>
                <button 
                  onClick={() => setActiveCodeTab('python-manual')}
                  className={`tab-btn ${activeCodeTab === 'python-manual' ? 'active' : ''}`}
                  style={{ color: activeCodeTab === 'python-manual' ? '#7c5cfc' : '#9ca3af', borderBottomColor: activeCodeTab === 'python-manual' ? '#7c5cfc' : 'transparent' }}
                >
                  Explicit Python Client
                </button>
                <button 
                  onClick={() => setActiveCodeTab('rest-api')}
                  className={`tab-btn ${activeCodeTab === 'rest-api' ? 'active' : ''}`}
                  style={{ color: activeCodeTab === 'rest-api' ? '#7c5cfc' : '#9ca3af', borderBottomColor: activeCodeTab === 'rest-api' ? '#7c5cfc' : 'transparent' }}
                >
                  HTTP / REST Gateway
                </button>
                <button 
                  onClick={() => setActiveCodeTab('grpc-proto')}
                  className={`tab-btn ${activeCodeTab === 'grpc-proto' ? 'active' : ''}`}
                  style={{ color: activeCodeTab === 'grpc-proto' ? '#7c5cfc' : '#9ca3af', borderBottomColor: activeCodeTab === 'grpc-proto' ? '#7c5cfc' : 'transparent' }}
                >
                  gRPC Protobuf Interface
                </button>
                <button 
                  onClick={() => setActiveCodeTab('langchain-agent')}
                  className={`tab-btn ${activeCodeTab === 'langchain-agent' ? 'active' : ''}`}
                  style={{ color: activeCodeTab === 'langchain-agent' ? '#c084fc' : '#9ca3af', borderBottomColor: activeCodeTab === 'langchain-agent' ? '#c084fc' : 'transparent' }}
                >
                  LangChain AI Agent
                </button>
              </div>


              <button 
                onClick={handleCopyCode}
                className="btn-temporal-outline"
                style={{ padding: '6px 14px', fontSize: '0.75rem', margin: '8px 0' }}
              >
                {copiedTab ? <Check size={14} color="#00f2aa" /> : <Copy size={14} />}
                {copiedTab ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            <div style={{ padding: '24px', background: '#050608', overflowX: 'auto' }}>
              <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.7, color: '#e2e8f0' }}>
                <code>{codeSnippets[activeCodeTab]}</code>
              </pre>
            </div>
          </div>

        </div>
      </section>

      {/* 8. Center Section: [Comparison] */}
      <section id="comparison" style={{ padding: '80px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div className="temporal-badge" style={{ marginBottom: '12px' }}>
              <Database size={12} />
              SECTION 05 • COMPARATIVE MATRIX
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 700, color: '#ffffff' }}>
              Distributed Lock Safety Comparison
            </h2>
            <p style={{ fontSize: '1rem', color: '#9ca3af' }}>
              Why leading infrastructure teams choose consensus over clock-based locking.
            </p>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem', background: 'rgba(14, 18, 28, 0.85)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(8, 9, 13, 0.95)' }}>
                  <th style={{ padding: '16px 20px', color: '#9ca3af', fontWeight: 600 }}>Capability / Safety Rule</th>
                  <th style={{ padding: '16px 20px', color: '#7c5cfc', fontWeight: 700 }}>Quorum (This Engine)</th>
                  <th style={{ padding: '16px 20px', color: '#9ca3af', fontWeight: 600 }}>Redis Redlock</th>
                  <th style={{ padding: '16px 20px', color: '#9ca3af', fontWeight: 600 }}>CoreOS etcd</th>
                  <th style={{ padding: '16px 20px', color: '#9ca3af', fontWeight: 600 }}>Apache ZooKeeper</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 600 }}>Consensus Algorithm</td>
                  <td style={{ padding: '14px 20px', color: '#00f2aa', fontWeight: 700 }}>Raft (Formal Specification)</td>
                  <td style={{ padding: '14px 20px', color: '#f87171' }}>None (Ad-hoc wall-clock)</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>Raft</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>Zab</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 600 }}>Monotonic Fencing Tokens</td>
                  <td style={{ padding: '14px 20px', color: '#00f2aa', fontWeight: 700 }}>✓ Built-in 64-bit sequence</td>
                  <td style={{ padding: '14px 20px', color: '#f87171' }}>✗ Not supported</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ 64-bit revision</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ 64-bit zxid</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 600 }}>Split-Brain Safety</td>
                  <td style={{ padding: '14px 20px', color: '#00f2aa', fontWeight: 700 }}>✓ Majority Quorum Required</td>
                  <td style={{ padding: '14px 20px', color: '#fbbf24' }}>⚠️ Clock drift vulnerable</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ Majority Quorum</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ Majority Quorum</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 600 }}>Raft §5.4.2 Figure 8 Safety</td>
                  <td style={{ padding: '14px 20px', color: '#00f2aa', fontWeight: 700 }}>✓ Formally Enforced</td>
                  <td style={{ padding: '14px 20px', color: '#64748b' }}>N/A</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ Enforced</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ Enforced</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 600 }}>Torn-Write Auto-Repair</td>
                  <td style={{ padding: '14px 20px', color: '#00f2aa', fontWeight: 700 }}>✓ CRC32 Automatic</td>
                  <td style={{ padding: '14px 20px', color: '#f87171' }}>⚠️ Manual redis-check-aof</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ bbolt DB</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ Log Truncation</td>
                </tr>
                <tr>
                  <td style={{ padding: '14px 20px', fontWeight: 600 }}>Runtime Simplicity</td>
                  <td style={{ padding: '14px 20px', color: '#00f2aa', fontWeight: 700 }}>✓ Lightweight Async Python</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>✓ Lightweight C</td>
                  <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>⚠️ Heavy Go binary</td>
                  <td style={{ padding: '14px 20px', color: '#f87171' }}>✗ Heavy JVM process</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </section>

      {/* Minimalist Footer */}
      <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', background: '#050608', padding: '36px 24px', marginTop: 'auto' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TemporalCloverLogo size={22} color="#FFFFFF" />
            <span style={{ fontSize: '16px', fontWeight: 400, color: '#ffffff' }}>Quorum</span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '12px' }}>
              Open-source distributed consensus & locking engine under the MIT License.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <button onClick={onLaunchDashboard} className="btn-temporal-primary">
              Launch Control Plane ➔
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}
