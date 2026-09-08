import React, { useState, useEffect } from 'react';
import { 
  Bot, Shield, Zap, AlertTriangle, CheckCircle2, Play, 
  RotateCcw, Code2, Database, Terminal, Clock, Sparkles, 
  ArrowRight, Lock, Unlock, Copy, Check
} from 'lucide-react';

export default function AiAgentStudio() {
  const [scenario, setScenario] = useState('safe'); // 'safe' | 'zombie' | 'chaos'
  const [isRunning, setIsRunning] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState('langchain-tool');

  // Agent State Tracker during playback
  const [agentStates, setAgentStates] = useState({
    'agent-alpha': { status: 'IDLE', thought: 'Waiting for task dispatch...', token: null },
    'agent-beta': { status: 'IDLE', thought: 'Waiting for task dispatch...', token: null },
    'agent-gamma': { status: 'IDLE', thought: 'Waiting for task dispatch...', token: null },
  });

  const [storageState, setStorageState] = useState({
    balance_usd: 15000.0,
    reserved_units: 300,
    processed_orders: 42,
    max_fence_token: 0,
    audit_status: 'NORMAL',
  });

  // Run initial status fetch
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/ai/status');
      if (res.ok) {
        const data = await res.json();
        if (data.storage_state && Object.keys(data.storage_state).length > 0) {
          setStorageState((prev) => ({
            ...prev,
            ...data.storage_state,
            max_fence_token: data.max_fence_token || 0,
          }));
        }
      }
    } catch (e) {
      console.error('Failed to fetch AI status:', e);
    }
  };

  const handleRunScenario = async (selectedScenario) => {
    const targetScenario = selectedScenario || scenario;
    setScenario(targetScenario);
    setIsRunning(true);
    setActiveStepIndex(-1);
    setSimulationResult(null);

    // Reset initial UI states
    setAgentStates({
      'agent-alpha': { status: 'IDLE', thought: 'Initializing agent thought chain...', token: null },
      'agent-beta': { status: 'IDLE', thought: 'Listening for available tasks...', token: null },
      'agent-gamma': { status: 'IDLE', thought: 'Standing by for audit cycle...', token: null },
    });

    if (targetScenario === 'safe') {
      setStorageState({ balance_usd: 15000.0, reserved_units: 300, processed_orders: 42, max_fence_token: 0, audit_status: 'NORMAL' });
    } else if (targetScenario === 'zombie') {
      setStorageState({ balance_usd: 20000.0, reserved_units: 100, processed_orders: 50, max_fence_token: 0, audit_status: 'NORMAL' });
    } else {
      setStorageState({ balance_usd: 10000.0, reserved_units: 50, processed_orders: 10, max_fence_token: 0, audit_status: 'UNPROTECTED' });
    }

    try {
      const res = await fetch('/api/ai/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: targetScenario, resource: 'shared-financial-ledger' }),
      });
      const data = await res.json();
      setSimulationResult(data);

      // Play back steps sequentially with visual timing
      const steps = data.steps || [];
      for (let i = 0; i < steps.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        setActiveStepIndex(i);

        const currentStep = steps[i];
        const agentId = currentStep.agent_id;

        if (agentId && agentStates[agentId] !== undefined) {
          setAgentStates((prev) => ({
            ...prev,
            [agentId]: {
              status: currentStep.phase,
              thought: currentStep.thought,
              token: currentStep.fence_token || prev[agentId]?.token,
            },
          }));
        }

        // Update live database numbers
        if (currentStep.details?.new_state) {
          setStorageState((prev) => ({
            ...prev,
            ...currentStep.details.new_state,
            max_fence_token: currentStep.fence_token || prev.max_fence_token,
          }));
        } else if (currentStep.details?.new_balance !== undefined) {
          setStorageState((prev) => ({
            ...prev,
            balance_usd: currentStep.details.new_balance,
            max_fence_token: currentStep.details.max_fence_token || prev.max_fence_token,
          }));
        } else if (currentStep.details?.corrupted_balance !== undefined) {
          setStorageState((prev) => ({
            ...prev,
            balance_usd: currentStep.details.corrupted_balance,
            audit_status: 'CORRUPTED (RACE CONDITION)',
          }));
        }
      }
    } catch (e) {
      console.error('Error running simulation:', e);
    } finally {
      setIsRunning(false);
    }
  };

  const getAgentStatusBadge = (agentId) => {
    const s = agentStates[agentId]?.status || 'IDLE';
    switch (s) {
      case 'THOUGHT':
        return <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>REASONING...</span>;
      case 'LOCK_GRANTED':
        return <span style={{ background: 'rgba(0, 242, 170, 0.2)', color: '#00f2aa', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>HOLDING LEASE</span>;
      case 'WRITE_COMMITTED':
        return <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>COMMITTED ✅</span>;
      case 'STALL':
        return <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>STALLED (ZOMBIE)</span>;
      case 'WRITE_REJECTED':
        return <span style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#ef4444', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>REJECTED ❌</span>;
      case 'RELEASE':
        return <span style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>RELEASED</span>;
      default:
        return <span style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#64748b', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>IDLE</span>;
    }
  };

  const codeSnippets = {
    'langchain-tool': `# 1. LangChain Autonomous Agent with QuorumLockTool
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from quorum.ai.tools import QuorumLockTool, FencedStorageTarget
from quorum.client.client import QuorumClient

# Connect to Quorum Raft Cluster
quorum_client = QuorumClient(servers=["127.0.0.1:50051", "127.0.0.1:50052"])

# Equip Agent with Distributed Locking Tool
lock_tool = QuorumLockTool(client=quorum_client, agent_id="finance-agent-alpha")
tools = [lock_tool, execute_ledger_mutation]

# The agent autonomously invokes QuorumLock before mutating shared state
# and supplies the received 64-bit fencing token to the mutation tool.`,

    'python-guard': `# 2. Python Async Guard Context Manager
import asyncio
from quorum.ai.tools import QuorumAgentGuard, FencedStorageTarget

async def run_agent_execution_cycle(client, storage):
    # Safe guarded block with automatic heartbeat lease renewal during heavy LLM thinking
    async with QuorumAgentGuard(client, resource_key="financial-ledger", agent_id="settlement-agent") as guard:
        token = guard.fence_token
        print(f"Acquired Quorum lease with strictly monotonic token: #{token}")
        
        # 1. Heavy multi-step LLM Chain-of-Thought
        decision = await llm_reasoning_step()
        
        # 2. Downstream tool verifies token to prevent zombie overwrites
        storage.execute_mutation(
            resource_name="financial-ledger",
            agent_id="settlement-agent",
            fence_token=token,
            mutation={"balance_usd": -2500.0}
        )`,

    'fenced-target': `# 3. Downstream Storage Fencing Protection
class ProtectedDatabase:
    def __init__(self):
        self.max_fencing_token = 0

    def apply_write(self, agent_id: str, fence_token: int, data: dict):
        # Monotonic verification: Reject any write from an agent with an older token
        if fence_token < self.max_fencing_token:
            raise StaleFenceTokenException(
                f"Zombie agent '{agent_id}' write rejected! "
                f"Token #{fence_token} < Highest Seen #{self.max_fencing_token}"
            )
        
        self.max_fencing_token = fence_token
        self.commit_to_db(data)`
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. Header Banner */}
      <div className="card-temporal" style={{ padding: '24px 28px', background: 'linear-gradient(135deg, rgba(14, 18, 28, 0.95), rgba(20, 15, 38, 0.9))', borderColor: 'rgba(168, 85, 247, 0.25)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '220px', height: '220px', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', position: 'relative', zIndex: 2 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', padding: '6px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', color: '#ffffff' }}>
                <Bot size={18} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, color: '#ffffff', letterSpacing: '-0.02em' }}>
                AI Agent Swarm Studio
              </h2>
              <span className="temporal-badge" style={{ borderColor: 'rgba(168, 85, 247, 0.4)', color: '#c084fc', background: 'rgba(168, 85, 247, 0.1)' }}>
                <Sparkles size={12} />
                LANGCHAIN COMPATIBLE
              </span>
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem', maxWidth: '750px', lineHeight: 1.5 }}>
              Autonomous AI agents executing multi-step LLM reasoning against shared environments can double-spend, race, or overwrite state when latency strikes. Quorum provides Raft consensus leases and 64-bit monotonic fencing tokens to enforce linearizable agent execution.
            </p>
          </div>

          {/* Scenario Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleRunScenario('safe')}
              disabled={isRunning}
              className={`btn-temporal-outline ${scenario === 'safe' ? 'active' : ''}`}
              style={{
                fontSize: '0.8rem',
                padding: '8px 16px',
                borderColor: scenario === 'safe' ? '#00f2aa' : 'rgba(255, 255, 255, 0.1)',
                color: scenario === 'safe' ? '#00f2aa' : '#e2e8f0',
                background: scenario === 'safe' ? 'rgba(0, 242, 170, 0.1)' : 'transparent',
              }}
            >
              <Shield size={14} />
              1. Safe Coordinated Swarm
            </button>

            <button
              onClick={() => handleRunScenario('zombie')}
              disabled={isRunning}
              className={`btn-temporal-outline ${scenario === 'zombie' ? 'active' : ''}`}
              style={{
                fontSize: '0.8rem',
                padding: '8px 16px',
                borderColor: scenario === 'zombie' ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)',
                color: scenario === 'zombie' ? '#fbbf24' : '#e2e8f0',
                background: scenario === 'zombie' ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
              }}
            >
              <AlertTriangle size={14} />
              2. Zombie Agent Mitigation
            </button>

            <button
              onClick={() => handleRunScenario('chaos')}
              disabled={isRunning}
              className={`btn-temporal-outline ${scenario === 'chaos' ? 'active' : ''}`}
              style={{
                fontSize: '0.8rem',
                padding: '8px 16px',
                borderColor: scenario === 'chaos' ? '#ef4444' : 'rgba(255, 255, 255, 0.1)',
                color: scenario === 'chaos' ? '#f87171' : '#e2e8f0',
                background: scenario === 'chaos' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
              }}
            >
              <Zap size={14} />
              3. Unprotected Chaos
            </button>
          </div>
        </div>
      </div>

      {/* 2. Central Shared Database / Resource State Bar */}
      <div className="card-temporal" style={{ padding: '18px 24px', background: 'rgba(10, 14, 22, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '8px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            <Database size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              Shared Environment Target
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
              production-ledger-db :: shared-financial-ledger
            </div>
          </div>
        </div>

        {/* Database Metric Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>LEDGER BALANCE</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: storageState.balance_usd >= 0 ? '#00f2aa' : '#ef4444', fontFamily: 'var(--font-mono)' }}>
              ${Number(storageState.balance_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ width: '1px', height: '32px', background: 'rgba(255, 255, 255, 0.08)' }} />

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>WAREHOUSE STOCK</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {storageState.reserved_units || 0} units
            </div>
          </div>

          <div style={{ width: '1px', height: '32px', background: 'rgba(255, 255, 255, 0.08)' }} />

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>MAX FENCING TOKEN</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
              #{storageState.max_fence_token || 0}
            </div>
          </div>

          <div style={{ width: '1px', height: '32px', background: 'rgba(255, 255, 255, 0.08)' }} />

          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>INTEGRITY STATUS</div>
            <span 
              style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                padding: '4px 10px', 
                borderRadius: '100px', 
                background: storageState.balance_usd >= 0 ? 'rgba(0, 242, 170, 0.15)' : 'rgba(239, 68, 68, 0.2)', 
                color: storageState.balance_usd >= 0 ? '#00f2aa' : '#f87171',
                border: `1px solid ${storageState.balance_usd >= 0 ? 'rgba(0, 242, 170, 0.3)' : 'rgba(239, 68, 68, 0.4)'}`
              }}
            >
              {storageState.balance_usd >= 0 ? 'FENCED & DURABLE' : 'CORRUPTED (DOUBLE SPEND)'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Three Autonomous Agent Persona Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        
        {/* Agent Alpha */}
        <div 
          className="card-temporal" 
          style={{ 
            padding: '20px', 
            borderColor: agentStates['agent-alpha'].status === 'LOCK_GRANTED' ? '#38bdf8' : (agentStates['agent-alpha'].status === 'WRITE_REJECTED' ? '#ef4444' : 'rgba(255, 255, 255, 0.08)'),
            boxShadow: agentStates['agent-alpha'].status === 'LOCK_GRANTED' ? '0 0 24px rgba(56, 189, 248, 0.25)' : 'none',
            transition: 'all 0.3s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '1.5rem', background: 'rgba(56, 189, 248, 0.15)', padding: '6px 10px', borderRadius: '8px' }}>
                💳
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1rem' }}>Settlement Agent</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>agent-alpha (Financial Debits)</div>
              </div>
            </div>
            {getAgentStatusBadge('agent-alpha')}
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '12px', borderRadius: '8px', minHeight: '65px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.4, border: '1px solid rgba(255, 255, 255, 0.04)', marginBottom: '14px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>Thought: </span>
            {agentStates['agent-alpha'].thought}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            <span>Token: <strong style={{ color: '#38bdf8' }}>{agentStates['agent-alpha'].token ? `#${agentStates['agent-alpha'].token}` : 'None'}</strong></span>
            <span>Tool: <code>QuorumLockTool</code></span>
          </div>
        </div>

        {/* Agent Beta */}
        <div 
          className="card-temporal" 
          style={{ 
            padding: '20px', 
            borderColor: agentStates['agent-beta'].status === 'LOCK_GRANTED' ? '#00f2aa' : 'rgba(255, 255, 255, 0.08)',
            boxShadow: agentStates['agent-beta'].status === 'LOCK_GRANTED' ? '0 0 24px rgba(0, 242, 170, 0.25)' : 'none',
            transition: 'all 0.3s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '1.5rem', background: 'rgba(0, 242, 170, 0.15)', padding: '6px 10px', borderRadius: '8px' }}>
                📦
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1rem' }}>Inventory Agent</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>agent-beta (Stock Allocation)</div>
              </div>
            </div>
            {getAgentStatusBadge('agent-beta')}
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '12px', borderRadius: '8px', minHeight: '65px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.4, border: '1px solid rgba(255, 255, 255, 0.04)', marginBottom: '14px' }}>
            <span style={{ color: '#00f2aa', fontWeight: 600 }}>Thought: </span>
            {agentStates['agent-beta'].thought}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            <span>Token: <strong style={{ color: '#00f2aa' }}>{agentStates['agent-beta'].token ? `#${agentStates['agent-beta'].token}` : 'None'}</strong></span>
            <span>Tool: <code>QuorumLockTool</code></span>
          </div>
        </div>

        {/* Agent Gamma */}
        <div 
          className="card-temporal" 
          style={{ 
            padding: '20px', 
            borderColor: agentStates['agent-gamma'].status === 'LOCK_GRANTED' ? '#c084fc' : 'rgba(255, 255, 255, 0.08)',
            boxShadow: agentStates['agent-gamma'].status === 'LOCK_GRANTED' ? '0 0 24px rgba(192, 132, 252, 0.25)' : 'none',
            transition: 'all 0.3s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '1.5rem', background: 'rgba(192, 132, 252, 0.15)', padding: '6px 10px', borderRadius: '8px' }}>
                🛡️
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1rem' }}>Risk & Audit Agent</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>agent-gamma (Reconciliation)</div>
              </div>
            </div>
            {getAgentStatusBadge('agent-gamma')}
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '12px', borderRadius: '8px', minHeight: '65px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.4, border: '1px solid rgba(255, 255, 255, 0.04)', marginBottom: '14px' }}>
            <span style={{ color: '#c084fc', fontWeight: 600 }}>Thought: </span>
            {agentStates['agent-gamma'].thought}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            <span>Token: <strong style={{ color: '#c084fc' }}>{agentStates['agent-gamma'].token ? `#${agentStates['agent-gamma'].token}` : 'None'}</strong></span>
            <span>Tool: <code>QuorumLockTool</code></span>
          </div>
        </div>

      </div>

      {/* 4. Live Multi-Agent Execution Stream / Timeline */}
      <div className="card-temporal" style={{ padding: '24px', background: 'rgba(10, 13, 20, 0.95)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={16} color="#00f2aa" />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              LangChain Coordination & Tool Execution Trace
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
              {simulationResult?.steps ? `${activeStepIndex + 1} / ${simulationResult.steps.length} Events` : 'Ready'}
            </span>
            <button
              onClick={() => handleRunScenario(scenario)}
              disabled={isRunning}
              className="btn-temporal-outline"
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
            >
              <RotateCcw size={12} />
              Re-run Scenario
            </button>
          </div>
        </div>

        {/* Steps List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
          {(!simulationResult || !simulationResult.steps) ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              Click any scenario button above to trigger an autonomous multi-agent simulation.
            </div>
          ) : (
            simulationResult.steps.slice(0, activeStepIndex + 1).map((s, idx) => {
              const isRejected = s.phase === 'WRITE_REJECTED' || s.status === 'REJECTED';
              const isStall = s.phase === 'STALL';
              const isLock = s.phase === 'LOCK_GRANTED';
              const isWrite = s.phase === 'WRITE_COMMITTED';

              return (
                <div
                  key={idx}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: isRejected 
                      ? 'rgba(239, 68, 68, 0.1)' 
                      : isStall 
                      ? 'rgba(245, 158, 11, 0.1)' 
                      : isLock 
                      ? 'rgba(0, 242, 170, 0.06)' 
                      : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${
                      isRejected 
                        ? 'rgba(239, 68, 68, 0.3)' 
                        : isStall 
                        ? 'rgba(245, 158, 11, 0.3)' 
                        : isLock 
                        ? 'rgba(0, 242, 170, 0.2)' 
                        : 'rgba(255, 255, 255, 0.04)'
                    }`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    animation: 'fadeIn 0.2s ease-in-out',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ marginTop: '2px' }}>
                      {isRejected && <AlertTriangle size={14} color="#ef4444" />}
                      {isStall && <Clock size={14} color="#fbbf24" />}
                      {isLock && <Lock size={14} color="#00f2aa" />}
                      {isWrite && <CheckCircle2 size={14} color="#22c55e" />}
                      {!isRejected && !isStall && !isLock && !isWrite && <Bot size={14} color="#38bdf8" />}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#f1f5f9' }}>
                          {s.agent_name}
                        </span>
                        <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                          [{s.phase}]
                        </span>
                        {s.fence_token && (
                          <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '1px 6px', borderRadius: '4px' }}>
                            Token #{s.fence_token}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: isRejected ? '#fca5a5' : '#cbd5e1', lineHeight: 1.4 }}>
                        {s.thought}
                      </div>
                      {s.tool_action && (
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                          ↳ Tool Invocation: <code>{s.tool_action}</code>
                        </div>
                      )}
                    </div>
                  </div>

                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    Step #{s.step}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 5. LangChain Integration Code Snippets */}
      <div className="card-temporal" style={{ padding: '24px', background: 'rgba(8, 10, 16, 0.9)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code2 size={16} color="#a855f7" />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              SDK Implementation: Add Quorum Locking to Any AI Agent Framework
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', padding: '2px', borderRadius: '6px' }}>
              <button
                onClick={() => setActiveCodeTab('langchain-tool')}
                style={{
                  background: activeCodeTab === 'langchain-tool' ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                  color: activeCodeTab === 'langchain-tool' ? '#c084fc' : '#94a3b8',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                LangChain Tool
              </button>
              <button
                onClick={() => setActiveCodeTab('python-guard')}
                style={{
                  background: activeCodeTab === 'python-guard' ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                  color: activeCodeTab === 'python-guard' ? '#c084fc' : '#94a3b8',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Async Guard
              </button>
              <button
                onClick={() => setActiveCodeTab('fenced-target')}
                style={{
                  background: activeCodeTab === 'fenced-target' ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                  color: activeCodeTab === 'fenced-target' ? '#c084fc' : '#94a3b8',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Storage Fencing
              </button>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(codeSnippets[activeCodeTab]);
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              className="btn-temporal-outline"
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              {copiedCode ? <Check size={12} color="#00f2aa" /> : <Copy size={12} />}
              {copiedCode ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <pre style={{ margin: 0, padding: '16px', background: 'rgba(0, 0, 0, 0.45)', borderRadius: '8px', color: '#38bdf8', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.5, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          {codeSnippets[activeCodeTab]}
        </pre>
      </div>

    </div>
  );
}
