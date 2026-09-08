import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import ClusterTopology from './components/ClusterTopology';
import LockStudio from './components/LockStudio';
import WalInspector from './components/WalInspector';
import ChaosSandbox from './components/ChaosSandbox';
import ZombieSimModal from './components/ZombieSimModal';
import AiAgentStudio from './components/AiAgentStudio';


export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'dashboard'
  const [activeTab, setActiveTab] = useState('topology');
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState({});
  const [rpcPulses, setRpcPulses] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [zombieModalOpen, setZombieModalOpen] = useState(false);
  const [zombieSimResult, setZombieSimResult] = useState(null);

  const wsRef = useRef(null);

  // WebSocket connection & event loop
  useEffect(() => {
    let reconnectTimer;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || '127.0.0.1:8000';
      const wsUrl = `${protocol}//${host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'INIT' || msg.type === 'CLUSTER_STATE_UPDATE') {
            if (msg.data) setStatus(msg.data);
            if (msg.logs) setLogs(msg.logs);
          } else if (msg.type === 'RPC_PULSE') {
            const pulseId = `${Date.now()}-${Math.random()}`;
            setRpcPulses((prev) => [...prev.slice(-15), { ...msg, id: pulseId }]);
            // Auto clean pulse after 1.2s
            setTimeout(() => {
              setRpcPulses((prev) => prev.filter((p) => p.id !== pulseId));
            }, 1200);
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    // Periodic fallback REST poll for logs
    const pollLogsInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/logs');
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch {}
    }, 1500);

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(pollLogsInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // REST API Methods
  const handleAcquireLock = async (key, client_id, ttl_ms) => {
    const res = await fetch('/api/locks/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, client_id, ttl_ms }),
    });
    return await res.json();
  };

  const handleRenewLock = async (key, client_id, fence_token, ttl_ms) => {
    const res = await fetch('/api/locks/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, client_id, fence_token, ttl_ms }),
    });
    return await res.json();
  };

  const handleReleaseLock = async (key, client_id, fence_token) => {
    const res = await fetch('/api/locks/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, client_id, fence_token }),
    });
    return await res.json();
  };

  const handleCreatePartition = async (partitions) => {
    const res = await fetch('/api/chaos/partition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partitions }),
    });
    return await res.json();
  };

  const handleHealPartitions = async () => {
    const res = await fetch('/api/chaos/heal', { method: 'POST' });
    return await res.json();
  };

  const handleKillNode = async (node_id) => {
    const res = await fetch('/api/chaos/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id }),
    });
    return await res.json();
  };

  const handleRestartNode = async (node_id) => {
    const res = await fetch('/api/chaos/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id }),
    });
    return await res.json();
  };

  const handleSetNetworkConditions = async (latency_ms, packet_loss_rate) => {
    const res = await fetch('/api/chaos/network-conditions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latency_ms, packet_loss_rate }),
    });
    return await res.json();
  };

  const handleSimulateZombie = async () => {
    const res = await fetch('/api/chaos/simulate-zombie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_name: 'production-orders-db' }),
    });
    const data = await res.json();
    setZombieSimResult(data);
    setZombieModalOpen(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {view === 'landing' ? (
        <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
          <LandingPage
            status={status}
            onLaunchDashboard={() => setView('dashboard')}
            onAcquireLock={handleAcquireLock}
            onSimulateZombie={handleSimulateZombie}
            onCreatePartition={handleCreatePartition}
            onHealPartitions={handleHealPartitions}
          />
        </div>
      ) : (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s ease-in-out' }}>
          <Header
            status={status}
            wsConnected={wsConnected}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onSimulateZombie={handleSimulateZombie}
            onBackToLanding={() => setView('landing')}
          />

          <main style={{ flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto', padding: '24px' }}>
            {activeTab === 'topology' && (
              <ClusterTopology
                status={status}
                rpcPulses={rpcPulses}
                onKillNode={handleKillNode}
                onRestartNode={handleRestartNode}
              />
            )}

            {activeTab === 'locks' && (
              <LockStudio
                status={status}
                onAcquireLock={handleAcquireLock}
                onRenewLock={handleRenewLock}
                onReleaseLock={handleReleaseLock}
              />
            )}

            {activeTab === 'wal' && (
              <WalInspector status={status} logs={logs} />
            )}

            {activeTab === 'chaos' && (
              <ChaosSandbox
                status={status}
                onCreatePartition={handleCreatePartition}
                onHealPartitions={handleHealPartitions}
                onKillNode={handleKillNode}
                onRestartNode={handleRestartNode}
                onSetNetworkConditions={handleSetNetworkConditions}
                onSimulateZombie={handleSimulateZombie}
              />
            )}

            {activeTab === 'ai-agents' && (
              <AiAgentStudio />
            )}
          </main>

        </div>
      )}

      {/* Zombie Worker Fencing Token Modal */}
      <ZombieSimModal
        isOpen={zombieModalOpen}
        onClose={() => setZombieModalOpen(false)}
        simulationResult={zombieSimResult}
        onRunAgain={handleSimulateZombie}
      />
    </div>
  );
}
